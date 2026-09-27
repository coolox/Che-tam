import { createHmac } from 'node:crypto';

export function createTurnCredentials(config, nowMs = Date.now()) {
  if (!config) {
    return null;
  }

  const ttlSec = Number.isFinite(config.ttlSec) && config.ttlSec > 0 ? config.ttlSec : 600;
  const expiresAt = Math.floor(nowMs / 1000) + ttlSec;
  // coTURN REST auth expects an expiry-prefixed username and HMAC over the
  // complete username. The stable suffix identifies this service only.
  const username = `${expiresAt}:hearth-canary`;
  const credential = createHmac('sha1', config.authSecret).update(username).digest('base64');

  return {
    ttlSec,
    expiresAt,
    username,
    credential,
    uris: [
      `turn:${config.host}:${config.tcpPort}?transport=tcp`,
      `turns:${config.host}:${config.tlsPort}?transport=tcp`,
    ],
  };
}
