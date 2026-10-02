import { createServer as createHttpServer } from 'node:http';
import { gunzipSync } from 'node:zlib';
import { CANARY_PATH, MAX_JOURNAL_GZIP_BYTES, MAX_JOURNAL_JSON_BYTES, MAX_UPLOAD_BYTES } from './config.mjs';
import { hasValidCanaryKey } from './auth.mjs';
import { sendJson, sendNotFound, readLimitedBody } from './http-utils.mjs';
import { normalizeJournalPayload } from './journal-store.mjs';
import { createTurnCredentials } from './turn-cred.mjs';
import { handleWebSocketUpgrade } from './websocket.mjs';

export function createCanaryServer({
  canaryKey = '',
  journalStore,
  turn = null,
  logger = console,
  websocketRuntime = null,
} = {}) {
  if (!journalStore) {
    throw new Error('journalStore is required');
  }

  const server = createHttpServer(async (request, response) => {
    const startedAt = Date.now();
    const pathname = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`).pathname;
    if (pathname.startsWith(CANARY_PATH)) {
      response.on('finish', () => {
        logger.info?.('canary_http_request', {
          method: request.method,
          pathname,
          status: response.statusCode,
          deviceLabel: validatedPrintableHeader(request.headers['x-canary-device-label']),
          timestamp: new Date().toISOString(),
        });
      });
    }

    try {
      if (request.method === 'GET' && pathname === CANARY_PATH) {
        sendJson(response, 200, { status: 'ok' });
        return;
      }

      if (request.method === 'POST' && pathname === `${CANARY_PATH}upload`) {
        if (!hasValidCanaryKey(request.headers, canaryKey)) {
          sendNotFound(response);
          return;
        }
        const { bytes } = await readLimitedBody(request, MAX_UPLOAD_BYTES);
        sendJson(response, 200, { bytes, serverMs: Date.now() - startedAt });
        return;
      }

      if (request.method === 'POST' && pathname === `${CANARY_PATH}journal`) {
        if (!hasValidCanaryKey(request.headers, canaryKey)) {
          sendNotFound(response);
          return;
        }
        if (request.headers['content-encoding'] !== 'gzip') {
          sendJson(response, 415, { error: 'gzip_required' });
          return;
        }
        const { buffer } = await readLimitedBody(request, MAX_JOURNAL_GZIP_BYTES);
        const jsonBuffer = gunzipSync(buffer, { maxOutputLength: MAX_JOURNAL_JSON_BYTES });
        const payload = JSON.parse(jsonBuffer.toString('utf8'));
        const records = normalizeJournalPayload(payload);
        const stored = await journalStore.append(records);
        sendJson(response, 200, { ...stored, serverMs: Date.now() - startedAt });
        return;
      }

      if (request.method === 'GET' && pathname === `${CANARY_PATH}turn-cred`) {
        if (!hasValidCanaryKey(request.headers, canaryKey)) {
          sendNotFound(response);
          return;
        }
        const credentials = createTurnCredentials(turn);
        if (!credentials) {
          sendNotFound(response);
          return;
        }
        sendJson(response, 200, credentials);
        return;
      }

      sendNotFound(response);
    } catch (error) {
      if (error?.code === 'body_too_large') {
        if (!response.headersSent) {
          sendJson(response, 413, { error: 'request_body_too_large' });
        }
        return;
      }

      const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : 400;
      logger.warn?.('canary_http_error', { message: error?.message, statusCode });
      if (!response.headersSent) {
        sendJson(response, statusCode, { error: statusCode === 400 ? 'bad_request' : 'request_failed' });
      }
    }
  });

  const webSocketSockets = new Set();
  server.closeCanaryWebSockets = () => {
    for (const socket of webSocketSockets) {
      socket.destroy();
    }
    webSocketSockets.clear();
  };

  server.on('upgrade', (request, socket) => {
    webSocketSockets.add(socket);
    socket.once('close', () => webSocketSockets.delete(socket));
    socket.once('error', () => webSocketSockets.delete(socket));
    handleWebSocketUpgrade(request, socket, { path: CANARY_PATH, logger, runtime: websocketRuntime });
  });

  return server;
}

const PRINTABLE_RE = /^[\x20-\x7e]{1,64}$/;

function validatedPrintableHeader(value) {
  return typeof value === 'string' && PRINTABLE_RE.test(value) ? value : null;
}
