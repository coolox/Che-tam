import assert from 'node:assert/strict';
import { randomBytes, randomUUID, createHmac } from 'node:crypto';
import { createSocket } from 'node:dgram';
import { request as httpRequest } from 'node:http';
import { connect } from 'node:net';
import { gzipSync } from 'node:zlib';
import { after, before, describe, it } from 'node:test';
import { CANARY_PATH, MAX_UPLOAD_BYTES } from '../src/config.mjs';
import { MemoryJournalStore } from '../src/journal-store.mjs';
import { createCanaryServer } from '../src/server.mjs';
import { createTurnCredentials } from '../src/turn-cred.mjs';
import { createUdpEchoServer } from '../src/udp-echo.mjs';

const TEST_KEY = 'test-key';

describe('TURN REST credentials', () => {
  it('uses expiry:username and HMAC over the complete username for coturn', () => {
    const secret = 'unit-test-turn-secret';
    const credentials = createTurnCredentials({
      host: 'turn.example.test',
      authSecret: secret,
      ttlSec: 600,
      tcpPort: 3478,
      tlsPort: 5349,
    }, 1_700_000_000_000);

    assert.equal(credentials.username, '1700000600:hearth-canary');
    assert.equal(
      credentials.credential,
      createHmac('sha1', secret).update(credentials.username).digest('base64'),
    );
  });
});

describe('Canary v4 server', () => {
  let server;
  let baseUrl;
  let store;

  before(async () => {
    store = new MemoryJournalStore();
    server = createCanaryServer({
      canaryKey: TEST_KEY,
      journalStore: store,
      logger: silentLogger(),
    });
    await listenLocal(server);
    const address = server.address();
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  it('serves health without authentication', async () => {
    const response = await requestJson(`${baseUrl}${CANARY_PATH}`);

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body, { status: 'ok' });
  });

  it('hides protected upload without X-Canary-Key', async () => {
    const response = await requestJson(`${baseUrl}${CANARY_PATH}upload`, {
      method: 'POST',
      body: Buffer.from('abc'),
    });

    assert.equal(response.statusCode, 404);
  });

  it('accepts upload data up to the local testable limit and discards it', async () => {
    const body = randomBytes(32 * 1024);
    const response = await requestJson(`${baseUrl}${CANARY_PATH}upload`, {
      method: 'POST',
      headers: { 'X-Canary-Key': TEST_KEY },
      body,
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.bytes, body.length);
    assert.equal(typeof response.body.serverMs, 'number');
  });

  it('rejects oversized uploads', async () => {
    const response = await requestJson(`${baseUrl}${CANARY_PATH}upload`, {
      method: 'POST',
      headers: { 'X-Canary-Key': TEST_KEY },
      body: Buffer.alloc(MAX_UPLOAD_BYTES + 1),
    });

    assert.equal(response.statusCode, 413);
  });

  it('accepts gzip journal records and deduplicates by recordId', async () => {
    const record = {
      recordId: randomUUID(),
      deviceLabel: 'tm-1',
      runId: '2026-10-02T14:00:03Z',
      runKind: 'full',
      timestampUtc: '2026-10-02T14:00:04Z',
      testType: 'http_domain',
      target: 'vmi3376157.contaboserver.net',
      success: true,
      errorCategory: 'none',
    };
    const body = gzipSync(Buffer.from(JSON.stringify({ records: [record, record] })));

    const response = await requestJson(`${baseUrl}${CANARY_PATH}journal`, {
      method: 'POST',
      headers: {
        'Content-Encoding': 'gzip',
        'X-Canary-Key': TEST_KEY,
      },
      body,
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.accepted, 1);
    assert.equal(response.body.duplicates, 1);
    assert.deepEqual(store.records(), [record]);
  });

  it('validates journal identity fields', async () => {
    const body = gzipSync(Buffer.from(JSON.stringify({
      records: [{ recordId: 'not-a-uuid', deviceLabel: '../bad' }],
    })));

    const response = await requestJson(`${baseUrl}${CANARY_PATH}journal`, {
      method: 'POST',
      headers: {
        'Content-Encoding': 'gzip',
        'X-Canary-Key': TEST_KEY,
      },
      body,
    });

    assert.equal(response.statusCode, 400);
  });

  it('keeps turn credentials disabled when no TURN config exists', async () => {
    const response = await requestJson(`${baseUrl}${CANARY_PATH}turn-cred`, {
      headers: { 'X-Canary-Key': TEST_KEY },
    });

    assert.equal(response.statusCode, 404);
  });

  it('echoes WebSocket messages and responds to ping', async () => {
    const client = await openWebSocket(baseUrl, CANARY_PATH);

    client.write(maskedFrame(0x1, Buffer.from('hello')));
    const echo = await readFrame(client);
    assert.equal(echo.opcode, 0x1);
    assert.equal(echo.payload.toString('utf8'), 'hello');

    client.write(maskedFrame(0x9, Buffer.from('p')));
    const pong = await readFrame(client);
    assert.equal(pong.opcode, 0xA);
    assert.equal(pong.payload.toString('utf8'), 'p');

    client.end(maskedFrame(0x8, Buffer.alloc(0)));
    await onceEvent(client, 'close');
  });

  it('logs WebSocket open with validated client correlation headers', async () => {
    const logs = [];
    const logServer = createCanaryServer({
      canaryKey: TEST_KEY,
      journalStore: new MemoryJournalStore(),
      logger: {
        info(event, fields) {
          logs.push({ event, fields });
        },
        warn() {},
      },
    });
    await listenLocal(logServer);
    const address = logServer.address();
    const url = `http://127.0.0.1:${address.port}`;
    let client;

    try {
      const connectionId = randomUUID();
      client = await openWebSocket(url, CANARY_PATH, {
        'X-Canary-Connection-Id': connectionId,
        'X-Canary-Device-Label': 'tm-1',
      });
      await waitForLog(logs, 'canary_ws_open');

      const openLog = logs.find((entry) => entry.event === 'canary_ws_open');
      assert.equal(openLog.fields.connectionId, connectionId);
      assert.equal(openLog.fields.deviceLabel, 'tm-1');
      assert.match(openLog.fields.timestamp, /^\d{4}-\d{2}-\d{2}T/);
      client.end(maskedFrame(0x8, closePayload(1000)));
      await waitForLog(logs, 'canary_ws_close');
    } finally {
      await destroyClient(client);
      await new Promise((resolve) => logServer.close(resolve));
    }
  });

  it('logs one graceful WebSocket close with correlation and duration', async () => {
    const logs = [];
    const logServer = createCanaryServer({
      canaryKey: TEST_KEY,
      journalStore: new MemoryJournalStore(),
      logger: {
        info(event, fields) {
          logs.push({ event, fields });
        },
        warn() {},
      },
    });
    await listenLocal(logServer);
    const address = logServer.address();
    const url = `http://127.0.0.1:${address.port}`;
    let client;

    try {
      const connectionId = randomUUID();
      client = await openWebSocket(url, CANARY_PATH, {
        'X-Canary-Connection-Id': connectionId,
        'X-Canary-Device-Label': 'tm-1',
      });
      client.write(maskedFrame(0x8, closePayload(1001)));
      await onceEvent(client, 'close');
      await waitForLog(logs, 'canary_ws_close');

      const closeLogs = logs.filter((entry) => entry.event === 'canary_ws_close');
      assert.equal(closeLogs.length, 1);
      const closeLog = closeLogs[0];
      assert.equal(closeLog.fields.connectionId, connectionId);
      assert.equal(closeLog.fields.deviceLabel, 'tm-1');
      assert.match(closeLog.fields.openedAt, /^\d{4}-\d{2}-\d{2}T/);
      assert.match(closeLog.fields.timestamp, /^\d{4}-\d{2}-\d{2}T/);
      assert.equal(typeof closeLog.fields.durationMs, 'number');
      assert.equal(closeLog.fields.closeCode, 1001);
      assert.equal(closeLog.fields.reason, 'client_close');
      assert.match(closeLog.fields.lastReceivedAt, /^\d{4}-\d{2}-\d{2}T/);
    } finally {
      await destroyClient(client);
      await new Promise((resolve) => logServer.close(resolve));
    }
  });

  it('logs one abrupt WebSocket TCP close with a non-graceful reason', { timeout: 3_000 }, async () => {
    const logs = [];
    const logServer = createCanaryServer({
      canaryKey: TEST_KEY,
      journalStore: new MemoryJournalStore(),
      logger: {
        info(event, fields) {
          logs.push({ event, fields });
        },
        warn() {},
      },
    });
    await listenLocal(logServer);
    const address = logServer.address();
    const url = `http://127.0.0.1:${address.port}`;
    let client;

    try {
      const connectionId = randomUUID();
      client = await openWebSocket(url, CANARY_PATH, {
        'X-Canary-Connection-Id': connectionId,
        'X-Canary-Device-Label': 'tm-1',
      });
      if (typeof client.resetAndDestroy === 'function') {
        client.resetAndDestroy();
      } else {
        client.destroy();
      }
      await waitForLog(logs, 'canary_ws_close');

      const closeLogs = logs.filter((entry) => entry.event === 'canary_ws_close');
      assert.equal(closeLogs.length, 1);
      assert.equal(closeLogs[0].fields.connectionId, connectionId);
      assert.equal(closeLogs[0].fields.deviceLabel, 'tm-1');
      assert.equal(closeLogs[0].fields.closeCode, null);
      assert.notEqual(closeLogs[0].fields.reason, 'client_close');
    } finally {
      await destroyClient(client);
      await closeServer(logServer);
    }
  });

  it('logs sanitized Canary HTTP request metadata with device label', async () => {
    const logs = [];
    const logServer = createCanaryServer({
      canaryKey: TEST_KEY,
      journalStore: new MemoryJournalStore(),
      logger: {
        info(event, fields) {
          logs.push({ event, fields });
        },
        warn() {},
      },
    });
    await listenLocal(logServer);
    const address = logServer.address();
    const url = `http://127.0.0.1:${address.port}`;

    try {
      const response = await requestJson(`${url}${CANARY_PATH}`, {
        headers: { 'X-Canary-Device-Label': 'tm-1' },
      });
      await waitForLog(logs, 'canary_http_request');

      const httpLog = logs.find((entry) => entry.event === 'canary_http_request');
      assert.equal(response.statusCode, 200);
      assert.deepEqual(Object.keys(httpLog.fields).sort(), [
        'deviceLabel',
        'method',
        'pathname',
        'status',
        'timestamp',
      ]);
      assert.equal(httpLog.fields.method, 'GET');
      assert.equal(httpLog.fields.pathname, CANARY_PATH);
      assert.equal(httpLog.fields.status, 200);
      assert.equal(httpLog.fields.deviceLabel, 'tm-1');
      assert.match(httpLog.fields.timestamp, /^\d{4}-\d{2}-\d{2}T/);
    } finally {
      await new Promise((resolve) => logServer.close(resolve));
    }
  });

  it('accepts legacy Canary HTTP GET without correlation headers and logs null label', async () => {
    const logs = [];
    const logServer = createCanaryServer({
      canaryKey: TEST_KEY,
      journalStore: new MemoryJournalStore(),
      logger: {
        info(event, fields) {
          logs.push({ event, fields });
        },
        warn() {},
      },
    });
    await listenLocal(logServer);
    const address = logServer.address();
    const url = `http://127.0.0.1:${address.port}`;

    try {
      const response = await requestJson(`${url}${CANARY_PATH}`);
      await waitForLog(logs, 'canary_http_request');

      const httpLog = logs.find((entry) => entry.event === 'canary_http_request');
      assert.equal(response.statusCode, 200);
      assert.deepEqual(response.body, { status: 'ok' });
      assert.equal(httpLog.fields.method, 'GET');
      assert.equal(httpLog.fields.pathname, CANARY_PATH);
      assert.equal(httpLog.fields.status, 200);
      assert.equal(httpLog.fields.deviceLabel, null);
    } finally {
      await new Promise((resolve) => logServer.close(resolve));
    }
  });

  it('accepts legacy WebSocket upgrade without correlation headers and logs server correlation', async () => {
    const logs = [];
    const logServer = createCanaryServer({
      canaryKey: TEST_KEY,
      journalStore: new MemoryJournalStore(),
      logger: {
        info(event, fields) {
          logs.push({ event, fields });
        },
        warn() {},
      },
    });
    await listenLocal(logServer);
    const address = logServer.address();
    const url = `http://127.0.0.1:${address.port}`;
    let client;

    try {
      client = await openWebSocket(url, CANARY_PATH);
      await waitForLog(logs, 'canary_ws_open');

      const openLog = logs.find((entry) => entry.event === 'canary_ws_open');
      assert.match(openLog.fields.connectionId, /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
      assert.equal(openLog.fields.deviceLabel, null);

      client.end(maskedFrame(0x8, closePayload(1000)));
      await waitForLog(logs, 'canary_ws_close');
    } finally {
      await destroyClient(client);
      await new Promise((resolve) => logServer.close(resolve));
    }
  });
});

describe('Canary v4 UDP echo server', () => {
  it('echoes UDP datagrams on a local ephemeral port', async () => {
    const echoServer = createUdpEchoServer({
      host: '127.0.0.1',
      port: 0,
      logger: silentLogger(),
    });
    const address = await echoServer.listen();
    const client = createSocket('udp4');

    try {
      const payload = Buffer.from('udp-echo-test');
      const echoed = await sendUdpAndReceive(client, payload, address.port, address.address);
      assert.deepEqual(echoed, payload);
    } finally {
      client.close();
      await echoServer.close();
    }
  });
});

function requestJson(url, { method = 'GET', headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const request = httpRequest(url, {
      method,
      headers: {
        ...headers,
        ...(body ? { 'content-length': body.length } : {}),
      },
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve({
          statusCode: response.statusCode,
          body: text ? JSON.parse(text) : null,
        });
      });
    });
    request.on('error', reject);
    if (body) {
      request.end(body);
    } else {
      request.end();
    }
  });
}

function openWebSocket(baseUrl, path, headers = {}) {
  const url = new URL(baseUrl);
  const key = randomBytes(16).toString('base64');
  const headerLines = Object.entries(headers).map(([name, value]) => `${name}: ${value}`);

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error('websocket upgrade timeout'));
    }, 1_000);
    const socket = connect(Number(url.port), url.hostname, () => {
      socket.write([
        `GET ${path} HTTP/1.1`,
        `Host: ${url.host}`,
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Key: ${key}`,
        'Sec-WebSocket-Version: 13',
        ...headerLines,
        '',
        '',
      ].join('\r\n'));
    });

    let buffer = Buffer.alloc(0);
    socket.on('data', function onData(chunk) {
      buffer = Buffer.concat([buffer, chunk]);
      const marker = buffer.indexOf('\r\n\r\n');
      if (marker === -1) return;
      const head = buffer.subarray(0, marker).toString('utf8');
      if (!head.startsWith('HTTP/1.1 101')) {
        clearTimeout(timer);
        reject(new Error(`websocket upgrade failed: ${head}`));
        socket.destroy();
        return;
      }
      clearTimeout(timer);
      socket.off('data', onData);
      socket.unshift(buffer.subarray(marker + 4));
      resolve(socket);
    });
    socket.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

function listenLocal(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
}

function closePayload(code) {
  const payload = Buffer.alloc(2);
  payload.writeUInt16BE(code);
  return payload;
}

function maskedFrame(opcode, payload) {
  const mask = randomBytes(4);
  const header = Buffer.from([0x80 | opcode, 0x80 | payload.length]);
  const masked = Buffer.from(payload);
  for (let i = 0; i < masked.length; i += 1) {
    masked[i] ^= mask[i % 4];
  }
  return Buffer.concat([header, mask, masked]);
}

function readFrame(socket) {
  return new Promise((resolve, reject) => {
    let buffer = Buffer.alloc(0);
    socket.on('data', onData);
    socket.on('error', reject);

    function onData(chunk) {
      buffer = Buffer.concat([buffer, chunk]);
      if (buffer.length < 2) return;
      const opcode = buffer[0] & 0x0f;
      const length = buffer[1] & 0x7f;
      if (buffer.length < 2 + length) return;
      socket.off('data', onData);
      resolve({ opcode, payload: buffer.subarray(2, 2 + length) });
    }
  });
}

function onceEvent(emitter, eventName) {
  return new Promise((resolve, reject) => {
    emitter.once(eventName, resolve);
    emitter.once('error', reject);
  });
}

function sendUdpAndReceive(socket, payload, port, host) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('udp echo timeout')), 1_000);

    socket.once('message', (message) => {
      clearTimeout(timer);
      resolve(message);
    });
    socket.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    socket.send(payload, port, host, (error) => {
      if (error) {
        clearTimeout(timer);
        reject(error);
      }
    });
  });
}

async function waitForLog(logs, eventName) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (logs.some((entry) => entry.event === eventName)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail(`timed out waiting for ${eventName}`);
}

async function destroyClient(client) {
  if (!client || client.destroyed) return;
  const closed = onceEvent(client, 'close').catch(() => {});
  client.destroy();
  await closed;
}

async function closeServer(server) {
  server.closeAllConnections?.();
  await new Promise((resolve) => server.close(resolve));
}

function silentLogger() {
  return {
    info() {},
    warn() {},
  };
}
