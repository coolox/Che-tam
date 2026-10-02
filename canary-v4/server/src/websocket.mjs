import { createHash, randomUUID } from 'node:crypto';

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PRINTABLE_RE = /^[\x20-\x7e]{1,64}$/;

export function handleWebSocketUpgrade(request, socket, { path, logger = console, runtime = null } = {}) {
  const wsRuntime = runtime ?? realRuntime;
  const pathname = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`).pathname;
  const key = request.headers['sec-websocket-key'];
  const upgrade = request.headers.upgrade?.toLowerCase();
  const version = request.headers['sec-websocket-version'];

  if (pathname !== path || upgrade !== 'websocket' || version !== '13' || typeof key !== 'string') {
    socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }

  const connectionId = validatedUuidHeader(request.headers['x-canary-connection-id']) ?? randomUUID();
  const deviceLabel = validatedPrintableHeader(request.headers['x-canary-device-label']);
  const accept = createHash('sha1').update(key + WS_GUID).digest('base64');
  socket.write([
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${accept}`,
    '',
    '',
  ].join('\r\n'));

  const openedAtMs = wsRuntime.nowMs();
  const openedAt = wsRuntime.isoNow();
  logger.info?.('canary_ws_open', {
    connectionId,
    deviceLabel,
    timestamp: openedAt,
  });
  const state = {
    buffer: Buffer.alloc(0),
    closed: false,
    closeCode: null,
    closeReason: null,
    finalized: false,
    lastReceivedAt: null,
    lastFrameAt: null,
    heartbeatTimer: null,
  };

  socket.on('data', (chunk) => {
    state.lastReceivedAt = wsRuntime.isoNow();
    state.buffer = Buffer.concat([state.buffer, chunk]);
    processFrames(socket, state, wsRuntime);
  });
  socket.on('end', () => {
    finalizeClose(state.closeReason ?? 'remote_eof');
  });
  socket.on('close', () => {
    finalizeClose(state.closeReason ?? 'remote_eof');
  });
  socket.on('error', () => {
    finalizeClose('socket_error');
  });

  function finalizeClose(reason) {
    if (state.finalized) return;
    state.finalized = true;
    if (state.heartbeatTimer) {
      wsRuntime.clearTimer(state.heartbeatTimer);
      state.heartbeatTimer = null;
    }
    const closedAtMs = wsRuntime.nowMs();
    logger.info?.('canary_ws_close', {
      connectionId,
      deviceLabel,
      openedAt,
      timestamp: wsRuntime.isoFromMs(closedAtMs),
      durationMs: Math.max(0, closedAtMs - openedAtMs),
      closeCode: state.closeCode,
      reason,
      lastReceivedAt: state.lastReceivedAt,
      lastFrameAt: state.lastFrameAt,
    });
  }

  state.closeForSilence = () => {
    if (state.closed || state.finalized) return;
    closeSocket(socket, state, 1001, 'silence_timeout');
    finalizeClose('silence_timeout');
  };
}

function processFrames(socket, state, runtime) {
  while (!state.closed && state.buffer.length >= 2) {
    const first = state.buffer[0];
    const second = state.buffer[1];
    const opcode = first & 0x0f;
    const masked = (second & 0x80) !== 0;
    let length = second & 0x7f;
    let offset = 2;

    if (length === 126) {
      if (state.buffer.length < offset + 2) return;
      length = state.buffer.readUInt16BE(offset);
      offset += 2;
    } else if (length === 127) {
      if (state.buffer.length < offset + 8) return;
      const high = state.buffer.readUInt32BE(offset);
      if (high !== 0) {
        closeSocket(socket, state, 1009, 'server_protocol_error');
        return;
      }
      length = state.buffer.readUInt32BE(offset + 4);
      offset += 8;
    }

    if (!masked) {
      closeSocket(socket, state, 1002, 'server_protocol_error');
      return;
    }

    const maskLength = masked ? 4 : 0;
    if (state.buffer.length < offset + maskLength + length) return;

    const mask = masked ? state.buffer.subarray(offset, offset + 4) : null;
    offset += maskLength;
    const payload = Buffer.from(state.buffer.subarray(offset, offset + length));
    state.buffer = state.buffer.subarray(offset + length);

    if (mask) {
      for (let i = 0; i < payload.length; i += 1) {
        payload[i] ^= mask[i % 4];
      }
    }

    if (opcode === 0x1 || opcode === 0x2) {
      state.lastFrameAt = runtime.isoNow();
      if (opcode === 0x1) {
        maybeRefreshHeartbeatTimeout(payload.toString('utf8'), state, runtime);
      }
      socket.write(encodeFrame(opcode, payload));
    } else if (opcode === 0x8) {
      state.closeCode = payload.length >= 2 ? payload.readUInt16BE(0) : 1000;
      state.closeReason = 'client_close';
      socket.write(encodeFrame(0x8, payload));
      socket.end();
      state.closed = true;
    } else if (opcode === 0x9) {
      socket.write(encodeFrame(0xA, payload));
    } else if (opcode === 0xA) {
      continue;
    } else {
      closeSocket(socket, state, 1003, 'server_protocol_error');
    }
  }
}

function maybeRefreshHeartbeatTimeout(text, state, runtime) {
  const heartbeat = parseHeartbeatPing(text);
  if (!heartbeat) return;
  if (state.heartbeatTimer) {
    runtime.clearTimer(state.heartbeatTimer);
  }
  state.heartbeatTimer = runtime.setTimer(() => {
    state.closeForSilence?.();
  }, heartbeat.disconnectAfterSec * 1000);
  state.heartbeatTimer.unref?.();
}

export function parseHeartbeatPing(text) {
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    return null;
  }
  if (payload?.type !== 'ws_heartbeat') return null;
  const intervalSec = Number(payload.intervalSec);
  const disconnectAfterSec = Number(payload.disconnectAfterSec);
  if (!Number.isFinite(intervalSec) || !Number.isFinite(disconnectAfterSec)) return null;
  if (!Number.isInteger(disconnectAfterSec) || disconnectAfterSec < 1 || disconnectAfterSec > 3600) return null;
  const expected = Math.round(intervalSec * 2.5);
  if (disconnectAfterSec !== expected) return null;
  return { intervalSec, disconnectAfterSec };
}

function closeSocket(socket, state, code, reason) {
  const payload = Buffer.alloc(2);
  payload.writeUInt16BE(code);
  state.closeCode = code;
  state.closeReason = reason;
  state.closed = true;
  socket.write(encodeFrame(0x8, payload));
  socket.end();
}

function validatedUuidHeader(value) {
  return typeof value === 'string' && value.length <= 64 && UUID_RE.test(value) ? value : null;
}

function validatedPrintableHeader(value) {
  return typeof value === 'string' && PRINTABLE_RE.test(value) ? value : null;
}

export function encodeFrame(opcode, payload = Buffer.alloc(0)) {
  const length = payload.length;
  let header;
  if (length < 126) {
    header = Buffer.from([0x80 | opcode, length]);
  } else if (length <= 0xffff) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeUInt32BE(0, 2);
    header.writeUInt32BE(length, 6);
  }
  return Buffer.concat([header, payload]);
}

const realRuntime = {
  nowMs: () => Date.now(),
  isoNow: () => new Date().toISOString(),
  isoFromMs: (ms) => new Date(ms).toISOString(),
  setTimer: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimer: (timer) => clearTimeout(timer),
};
