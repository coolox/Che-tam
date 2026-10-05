export const SCHEMA_VERSION = 2;

export const CREATE_SCHEMA_MIGRATIONS = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL
  )
`;

export const SCHEMA_V1_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS profiles (
    id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    avatar_url TEXT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS chats (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    kind TEXT NOT NULL,
    last_message_at TEXT NULL,
    unread_count INTEGER NOT NULL DEFAULT 0 CHECK(unread_count >= 0),
    updated_at TEXT NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS idx_chats_last_message_at ON chats(last_message_at DESC, id ASC)',
  `CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    chat_id TEXT NOT NULL REFERENCES chats(id),
    client_message_id TEXT NOT NULL UNIQUE,
    sender_id TEXT NOT NULL REFERENCES profiles(id),
    body TEXT NOT NULL,
    created_at TEXT NOT NULL,
    delivery_state TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS idx_messages_chat_created_at ON messages(chat_id, created_at ASC, id ASC)',
  `CREATE TABLE IF NOT EXISTS message_receipts (
    message_id TEXT NOT NULL REFERENCES messages(id),
    profile_id TEXT NOT NULL REFERENCES profiles(id),
    state TEXT NOT NULL,
    received_at TEXT NOT NULL,
    PRIMARY KEY(message_id, profile_id, state)
  )`,
  `CREATE TABLE IF NOT EXISTS sync_cursors (
    scope TEXT PRIMARY KEY,
    cursor TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS endpoint_cache (
    endpoint_id TEXT PRIMARY KEY,
    url TEXT NOT NULL,
    priority INTEGER NOT NULL,
    last_known_good_at TEXT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS outbox (
    client_message_id TEXT PRIMARY KEY REFERENCES messages(client_message_id),
    chat_id TEXT NOT NULL REFERENCES chats(id),
    payload TEXT NOT NULL,
    state TEXT NOT NULL,
    attempt_count INTEGER NOT NULL DEFAULT 0 CHECK(attempt_count >= 0),
    next_attempt_at TEXT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
] as const;

export const SCHEMA_V2_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS chat_drafts (
    chat_id TEXT PRIMARY KEY REFERENCES chats(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
] as const;
