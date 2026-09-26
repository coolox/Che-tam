export const DEFAULT_HOST = '127.0.0.1';
export const DEFAULT_PORT = 9999;
export const CANARY_PATH = '/hearth-canary/';
export const MAX_UPLOAD_BYTES = 2.5 * 1024 * 1024;
export const MAX_JOURNAL_GZIP_BYTES = 2.5 * 1024 * 1024;
export const MAX_JOURNAL_JSON_BYTES = 10 * 1024 * 1024;

export function loadConfig(env = process.env) {
  return {
    host: env.CANARY_HOST || DEFAULT_HOST,
    port: Number.parseInt(env.CANARY_PORT || String(DEFAULT_PORT), 10),
    canaryKey: env.CANARY_KEY || '',
    dataDir: env.CANARY_DATA_DIR || '',
    turn: loadTurnConfig(env),
  };
}

function loadTurnConfig(env) {
  if (!env.CANARY_TURN_HOST || !env.CANARY_TURN_AUTH_SECRET) {
    return null;
  }

  return {
    host: env.CANARY_TURN_HOST,
    authSecret: env.CANARY_TURN_AUTH_SECRET,
    ttlSec: Number.parseInt(env.CANARY_TURN_TTL_SEC || '600', 10),
    tcpPort: Number.parseInt(env.CANARY_TURN_TCP_PORT || '3478', 10),
    tlsPort: Number.parseInt(env.CANARY_TURN_TLS_PORT || '5349', 10),
  };
}
