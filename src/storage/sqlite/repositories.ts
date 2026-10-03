import type { SqlDatabase, SqlExecutor, SqlValue } from './contracts';

export type StoredProfile = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  updatedAt: string;
};

export type StoredChat = {
  id: string;
  title: string;
  kind: string;
  lastMessageAt: string | null;
  unreadCount: number;
  updatedAt: string;
};

export type StoredMessage = {
  id: string;
  chatId: string;
  clientMessageId: string;
  senderId: string;
  body: string;
  createdAt: string;
  deliveryState: string;
  updatedAt: string;
};

export type StoredReceipt = {
  messageId: string;
  profileId: string;
  state: string;
  receivedAt: string;
};

export type EndpointCacheEntry = {
  endpointId: string;
  url: string;
  priority: number;
  lastKnownGoodAt: string | null;
  updatedAt: string;
};

export type OutboxEntry = {
  clientMessageId: string;
  chatId: string;
  payload: string;
  state: string;
  attemptCount: number;
  nextAttemptAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type Row = Record<string, SqlValue>;

function mapChat(row: Row): StoredChat {
  return { id: row.id as string, title: row.title as string, kind: row.kind as string, lastMessageAt: row.last_message_at as string | null, unreadCount: row.unread_count as number, updatedAt: row.updated_at as string };
}
function mapMessage(row: Row): StoredMessage {
  return { id: row.id as string, chatId: row.chat_id as string, clientMessageId: row.client_message_id as string, senderId: row.sender_id as string, body: row.body as string, createdAt: row.created_at as string, deliveryState: row.delivery_state as string, updatedAt: row.updated_at as string };
}
function mapOutbox(row: Row): OutboxEntry {
  return { clientMessageId: row.client_message_id as string, chatId: row.chat_id as string, payload: row.payload as string, state: row.state as string, attemptCount: row.attempt_count as number, nextAttemptAt: row.next_attempt_at as string | null, createdAt: row.created_at as string, updatedAt: row.updated_at as string };
}

export class SqliteRepositories {
  public constructor(private readonly database: SqlDatabase) {}

  async upsertProfile(profile: StoredProfile): Promise<void> {
    await this.database.execute(`INSERT INTO profiles(id, display_name, avatar_url, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET display_name = excluded.display_name, avatar_url = excluded.avatar_url, updated_at = excluded.updated_at`, [profile.id, profile.displayName, profile.avatarUrl, profile.updatedAt]);
  }

  async upsertChat(chat: StoredChat): Promise<void> {
    await this.database.execute(`INSERT INTO chats(id, title, kind, last_message_at, unread_count, updated_at) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET title = excluded.title, kind = excluded.kind, last_message_at = excluded.last_message_at, unread_count = excluded.unread_count, updated_at = excluded.updated_at`, [chat.id, chat.title, chat.kind, chat.lastMessageAt, chat.unreadCount, chat.updatedAt]);
  }

  async upsertMessage(message: StoredMessage): Promise<void> {
    await this.database.execute(`INSERT INTO messages(id, chat_id, client_message_id, sender_id, body, created_at, delivery_state, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(client_message_id) DO UPDATE SET chat_id = excluded.chat_id, sender_id = excluded.sender_id, body = excluded.body, created_at = excluded.created_at, delivery_state = excluded.delivery_state, updated_at = excluded.updated_at`, [message.id, message.chatId, message.clientMessageId, message.senderId, message.body, message.createdAt, message.deliveryState, message.updatedAt]);
  }

  async insertReceipt(receipt: StoredReceipt): Promise<void> {
    await this.database.execute('INSERT OR IGNORE INTO message_receipts(message_id, profile_id, state, received_at) VALUES (?, ?, ?, ?)', [receipt.messageId, receipt.profileId, receipt.state, receipt.receivedAt]);
  }

  async setCursor(scope: string, cursor: string, updatedAt: string): Promise<void> {
    await this.database.execute(`INSERT INTO sync_cursors(scope, cursor, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(scope) DO UPDATE SET cursor = excluded.cursor, updated_at = excluded.updated_at`, [scope, cursor, updatedAt]);
  }

  async readCursor(scope: string): Promise<string | null> {
    const rows = await this.database.query<Row>('SELECT cursor FROM sync_cursors WHERE scope = ?', [scope]);
    return rows[0]?.cursor as string | undefined ?? null;
  }

  async upsertEndpointCache(entry: EndpointCacheEntry): Promise<void> {
    await this.database.execute(`INSERT INTO endpoint_cache(endpoint_id, url, priority, last_known_good_at, updated_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(endpoint_id) DO UPDATE SET url = excluded.url, priority = excluded.priority, last_known_good_at = excluded.last_known_good_at, updated_at = excluded.updated_at`, [entry.endpointId, entry.url, entry.priority, entry.lastKnownGoodAt, entry.updatedAt]);
  }

  async enqueue(outbox: OutboxEntry): Promise<void> {
    await this.database.execute(`INSERT INTO outbox(client_message_id, chat_id, payload, state, attempt_count, next_attempt_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(client_message_id) DO NOTHING`, [outbox.clientMessageId, outbox.chatId, outbox.payload, outbox.state, outbox.attemptCount, outbox.nextAttemptAt, outbox.createdAt, outbox.updatedAt]);
  }

  async saveMessageAndEnqueue(message: StoredMessage, outbox: OutboxEntry): Promise<void> {
    await this.database.transaction(async (transaction) => {
      await this.upsertMessageWith(transaction, message);
      await this.enqueueWith(transaction, outbox);
    });
  }

  async listChats(): Promise<StoredChat[]> {
    return (await this.database.query<Row>('SELECT * FROM chats ORDER BY last_message_at IS NULL ASC, last_message_at DESC, id ASC')).map(mapChat);
  }

  async listMessages(chatId: string): Promise<StoredMessage[]> {
    return (await this.database.query<Row>('SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at ASC, id ASC', [chatId])).map(mapMessage);
  }

  async readOutbox(): Promise<OutboxEntry[]> {
    return (await this.database.query<Row>('SELECT * FROM outbox ORDER BY created_at ASC, client_message_id ASC')).map(mapOutbox);
  }

  private async upsertMessageWith(executor: SqlExecutor, message: StoredMessage): Promise<void> {
    await executor.execute(`INSERT INTO messages(id, chat_id, client_message_id, sender_id, body, created_at, delivery_state, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(client_message_id) DO UPDATE SET chat_id = excluded.chat_id, sender_id = excluded.sender_id, body = excluded.body, created_at = excluded.created_at, delivery_state = excluded.delivery_state, updated_at = excluded.updated_at`, [message.id, message.chatId, message.clientMessageId, message.senderId, message.body, message.createdAt, message.deliveryState, message.updatedAt]);
  }

  private async enqueueWith(executor: SqlExecutor, outbox: OutboxEntry): Promise<void> {
    await executor.execute(`INSERT INTO outbox(client_message_id, chat_id, payload, state, attempt_count, next_attempt_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(client_message_id) DO NOTHING`, [outbox.clientMessageId, outbox.chatId, outbox.payload, outbox.state, outbox.attemptCount, outbox.nextAttemptAt, outbox.createdAt, outbox.updatedAt]);
  }
}

export function createSqliteRepositories(database: SqlDatabase): SqliteRepositories {
  return new SqliteRepositories(database);
}
