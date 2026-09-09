import { createHash } from 'node:crypto';
import { createServer } from 'node:http';

const HOST = '127.0.0.1';
const PORT = 9999;
const PATHNAME = '/hearth-canary/';
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function healthResponse(response) {
  const body = JSON.stringify({ status: 'ok', service: 'hearth-canary' });
  response.writeHead(200, {
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
  });
  response.end(body);
}

const server = createServer((request, response) => {
  const pathname = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`).pathname;
  if (request.method === 'GET' && pathname === PATHNAME) {
    healthResponse(response);
    return;
  }
  response.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify({ status: 'not_found' }));
});

server.on('upgrade', (request, socket) => {
  const pathname = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`).pathname;
  const key = request.headers['sec-websocket-key'];
  const upgrade = request.headers.upgrade?.toLowerCase();
  if (pathname !== PATHNAME || upgrade !== 'websocket' || typeof key !== 'string') {
    socket.write('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }

  const accept = createHash('sha1').update(key + WS_GUID).digest('base64');
  socket.write([
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${accept}`,
    '',
    '',
  ].join('\r\n'));
  socket.end(Buffer.from([0x88, 0x00]));
});

server.listen(PORT, HOST, () => {
  console.log(`Hearth Canary endpoint listening on http://${HOST}:${PORT}${PATHNAME}`);
});

function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
