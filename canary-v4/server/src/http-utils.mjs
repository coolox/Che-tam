export function sendJson(response, statusCode, payload, headers = {}) {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    ...headers,
  });
  response.end(body);
}

export function sendNotFound(response) {
  sendJson(response, 404, { status: 'not_found' });
}

export function readLimitedBody(request, limitBytes) {
  return new Promise((resolve, reject) => {
    let bytes = 0;
    let tooLarge = false;
    const chunks = [];

    request.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > limitBytes) {
        tooLarge = true;
        return;
      }
      chunks.push(chunk);
    });

    request.on('end', () => {
      if (tooLarge) {
        reject(Object.assign(new Error('request_body_too_large'), { code: 'body_too_large' }));
        return;
      }
      resolve({ buffer: Buffer.concat(chunks), bytes });
    });
    request.on('error', reject);
  });
}
