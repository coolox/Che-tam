import { createHash, randomUUID } from 'node:crypto';

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

export function handleWebSocketUpgrade(request, socket, { path, logger = console } = {}) {
  const pathname = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`).pathname;
  const key = request.headers['sec-websocket-key'];
  const upgrade = request.headers.upgrade?.toLowerCase();
  const version = request.headers['sec-websocket-version'];

  if (pathname !== path || upgrade !== 'websocket' || version !== '13' || typeof key !== 'string') {
    socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }

  const connectionId = randomUUID();
  const deviceLabel = typeof request.headers['x-device-label'] === 'string' ? request.headers['x-device-label'] : null;
  const accept = createHash('sha1').update(key + WS_GUID).digest('base64');
  socket.write([
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${accept}`,
    '',
    '',
  ].join('\r\n'));

  logger.info?.('canary_ws_open', { connectionId, deviceLabel, openedAt: new Date().toISOString() });
  const state = { buffer: Buffer.alloc(0), closed: false, closeCode: null };

  socket.on('data', (chunk) => {
    state.buffer = Buffer.concat([state.buffer, chunk]);
    processFrames(socket, state);
  });
  socket.on('close', () => {
    logger.info?.('canary_ws_close', {
      connectionId,
      deviceLabel,
      closedAt: new Date().toISOString(),
      closeCode: state.closeCode,
    });
  });
  socket.on('error', () => {});
}

function processFrames(socket, state) {
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
        closeSocket(socket, state, 1009);
        return;
      }
      length = state.buffer.readUInt32BE(offset + 4);
      offset += 8;
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
      socket.write(encodeFrame(opcode, payload));
    } else if (opcode === 0x8) {
      state.closeCode = payload.length >= 2 ? payload.readUInt16BE(0) : 1000;
      socket.write(encodeFrame(0x8, payload));
      socket.end();
      state.closed = true;
    } else if (opcode === 0x9) {
      socket.write(encodeFrame(0xA, payload));
    } else if (opcode === 0xA) {
      continue;
    } else {
      closeSocket(socket, state, 1003);
    }
  }
}

function closeSocket(socket, state, code) {
  const payload = Buffer.alloc(2);
  payload.writeUInt16BE(code);
  state.closeCode = code;
  state.closed = true;
  socket.write(encodeFrame(0x8, payload));
  socket.end();
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
