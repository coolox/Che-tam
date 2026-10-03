import { InMemorySqliteDatabase } from '../src/storage/sqlite/inMemoryAdapter';
import { migrateDatabase } from '../src/storage/sqlite/migrate';
import { createSqliteRepositories, type OutboxEntry, type StoredMessage } from '../src/storage/sqlite/repositories';

const now = '2026-10-03T12:00:00.000Z';
const message: StoredMessage = { id: 'm1', chatId: 'c1', clientMessageId: 'cm1', senderId: 'p1', body: 'private body', createdAt: now, deliveryState: 'queued', updatedAt: now };
const outbox: OutboxEntry = { clientMessageId: 'cm1', chatId: 'c1', payload: '{"kind":"text"}', state: 'queued', attemptCount: 0, nextAttemptAt: null, createdAt: now, updatedAt: now };

async function setup() {
  const database = new InMemorySqliteDatabase();
  await migrateDatabase(database, now);
  const repositories = createSqliteRepositories(database);
  await repositories.upsertProfile({ id: 'p1', displayName: 'Ada', avatarUrl: null, updatedAt: now });
  await repositories.upsertChat({ id: 'c1', title: 'Chat', kind: 'direct', lastMessageAt: null, unreadCount: 0, updatedAt: now });
  return { database, repositories };
}

describe('SQLite repositories', () => {
  it('keeps the original message id, its receipt, and one outbox item for repeated client_message_id', async () => {
    const { database, repositories } = await setup();
    await repositories.saveMessageAndEnqueue(message, outbox);
    await repositories.insertReceipt({ messageId: 'm1', profileId: 'p1', state: 'received', receivedAt: now });
    await repositories.saveMessageAndEnqueue({ ...message, id: 'm2', body: 'updated' }, outbox);

    expect(await repositories.listMessages('c1')).toEqual([{ ...message, body: 'updated' }]);
    expect((await database.query('SELECT message_id FROM message_receipts')).map((receipt) => receipt.message_id)).toEqual(['m1']);
    expect(await repositories.readOutbox()).toEqual([outbox]);
  });

  it('lists chats by last message descending and messages chronologically with stable id ties', async () => {
    const { repositories } = await setup();
    await repositories.upsertChat({ id: 'c2', title: 'Newest', kind: 'group', lastMessageAt: '2026-10-03T13:00:00.000Z', unreadCount: 0, updatedAt: now });
    await repositories.upsertChat({ id: 'c3', title: 'Older', kind: 'group', lastMessageAt: '2026-10-03T11:00:00.000Z', unreadCount: 0, updatedAt: now });
    await repositories.upsertMessage({ ...message, id: 'm-b', clientMessageId: 'cm-b', createdAt: '2026-10-03T13:00:00.000Z' });
    await repositories.upsertMessage({ ...message, id: 'm-a', clientMessageId: 'cm-a', createdAt: '2026-10-03T13:00:00.000Z' });
    await repositories.upsertMessage({ ...message, id: 'm-old', clientMessageId: 'cm-old', createdAt: '2026-10-03T11:00:00.000Z' });

    expect((await repositories.listChats()).map((chat) => chat.id)).toEqual(['c2', 'c3', 'c1']);
    expect((await repositories.listMessages('c1')).map((item) => item.id)).toEqual(['m-old', 'm-a', 'm-b']);
  });

  it('clears a chat unread count persistently', async () => {
    const { repositories } = await setup();
    await repositories.upsertChat({ id: 'c1', title: 'Chat', kind: 'direct', lastMessageAt: now, unreadCount: 3, updatedAt: now });
    await repositories.clearChatUnread('c1', '2026-10-03T12:01:00.000Z');

    expect(await repositories.listChats()).toEqual([{
      id: 'c1', title: 'Chat', kind: 'direct', lastMessageAt: now, unreadCount: 0, updatedAt: '2026-10-03T12:01:00.000Z',
    }]);
  });

  it('rolls back both message and outbox changes when deterministic enqueue failure is injected', async () => {
    const { database, repositories } = await setup();
    database.failNext('insert into outbox');

    await expect(repositories.saveMessageAndEnqueue(message, outbox)).rejects.toThrow('Injected failure');
    expect(await repositories.listMessages('c1')).toEqual([]);
    expect(await repositories.readOutbox()).toEqual([]);
  });
});
