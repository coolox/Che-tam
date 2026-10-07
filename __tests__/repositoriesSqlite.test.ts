import { InMemorySqliteDatabase } from '../src/storage/sqlite/inMemoryAdapter';
import { migrateDatabase } from '../src/storage/sqlite/migrate';
import { createSqliteRepositories, type OutboxEntry, type StoredMessage } from '../src/storage/sqlite/repositories';
import { formatChatListTime } from '../src/messages/localMessageStore';
import { formatMessageTime, getConversationDateItems } from '../src/ui/state';
import type { Message } from '../src/ui/types';
import { RealSqliteDatabase, withTempSqlitePath } from './helpers/realSqlite';

const now = '2026-10-03T12:00:00.000Z';
const message: StoredMessage = { id: 'm1', chatId: 'c1', clientMessageId: 'cm1', senderId: 'p1', body: 'private body', createdAt: now, deliveryState: 'queued', replyToMessageId: null, replySenderName: null, replyPreview: null, updatedAt: now };
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
  it('rejects a message for an unknown chat after foreign keys have been enabled', async () => {
    const database = new InMemorySqliteDatabase();
    await migrateDatabase(database, now);
    const repositories = createSqliteRepositories(database);

    await expect(repositories.upsertMessage(message)).rejects.toThrow('FOREIGN KEY constraint failed');
  });

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

  it('saves, separates, and clears chat drafts by chat id', async () => {
    const { repositories } = await setup();
    await repositories.upsertChat({ id: 'c2', title: 'Second', kind: 'direct', lastMessageAt: null, unreadCount: 0, updatedAt: now });

    await repositories.saveChatDraft({ chatId: 'c1', text: 'draft one', updatedAt: now });
    await repositories.saveChatDraft({ chatId: 'c2', text: 'draft two', updatedAt: '2026-10-03T12:01:00.000Z' });
    await repositories.clearChatDraft('c1');

    expect(await repositories.readChatDraft('c1')).toBeNull();
    expect(await repositories.readChatDraft('c2')).toEqual({
      chatId: 'c2',
      text: 'draft two',
      updatedAt: '2026-10-03T12:01:00.000Z',
    });
  });

  it('clears only the sent chat draft inside the successful enqueue transaction', async () => {
    const { repositories } = await setup();
    await repositories.upsertChat({ id: 'c2', title: 'Second', kind: 'direct', lastMessageAt: null, unreadCount: 0, updatedAt: now });
    await repositories.saveChatDraft({ chatId: 'c1', text: 'send me', updatedAt: now });
    await repositories.saveChatDraft({ chatId: 'c2', text: 'keep me', updatedAt: now });

    await repositories.saveMessageEnqueueAndClearDraft(message, outbox);

    expect(await repositories.readChatDraft('c1')).toBeNull();
    expect(await repositories.readChatDraft('c2')).toMatchObject({ text: 'keep me' });
  });

  it('rolls back both message and outbox changes when deterministic enqueue failure is injected', async () => {
    const { database, repositories } = await setup();
    database.failNext('insert into outbox');

    await expect(repositories.saveMessageAndEnqueue(message, outbox)).rejects.toThrow('Injected failure');
    expect(await repositories.listMessages('c1')).toEqual([]);
    expect(await repositories.readOutbox()).toEqual([]);
  });

  it('round-trips a stored instant through real SQLite and formats one local civil time everywhere', async () => {
    await withTempSqlitePath('che-tam-local-time-', async (databasePath) => {
      const database = new RealSqliteDatabase(databasePath);
      try {
        await migrateDatabase(database, now);
        const repositories = createSqliteRepositories(database);
        const createdAt = '2026-10-05T08:08:00.000Z';
        await repositories.upsertProfile({ id: 'p1', displayName: 'Ada', avatarUrl: null, updatedAt: now });
        await repositories.upsertChat({ id: 'c1', title: 'Chat', kind: 'direct', lastMessageAt: createdAt, unreadCount: 0, updatedAt: now });
        await repositories.upsertMessage({ ...message, createdAt, updatedAt: createdAt });

        const stored = (await repositories.listMessages('c1'))[0];
        const viewMessage: Message = {
          id: stored.id,
          chatId: stored.chatId,
          sender: 'me',
          text: stored.body,
          createdAt: stored.createdAt,
          delivered: false,
          kind: 'text',
        };

        expect(stored.createdAt).toBe(createdAt);
        expect(formatMessageTime(stored.createdAt, { timeZone: 'Europe/Istanbul' })).toBe('11:08');
        expect(formatChatListTime((await repositories.listChats())[0].lastMessageAt ?? '', { timeZone: 'Europe/Istanbul' })).toBe('11:08');
        expect(formatMessageTime(stored.createdAt, { timeZone: 'Asia/Ashgabat' })).toBe('13:08');
        expect(formatChatListTime((await repositories.listChats())[0].lastMessageAt ?? '', { timeZone: 'Asia/Ashgabat' })).toBe('13:08');
        expect(getConversationDateItems([viewMessage], {
          now: new Date('2026-10-05T09:00:00.000Z'),
          timeZone: 'Europe/Istanbul',
        })[0]).toMatchObject({ itemType: 'dateDivider', label: 'Сегодня' });
      } finally {
        database.close();
      }
    });
  });

  it('searches chat titles and all local message bodies with Russian case folding from real SQLite', async () => {
    await withTempSqlitePath('che-tam-local-search-', async (databasePath) => {
      const database = new RealSqliteDatabase(databasePath);
      try {
        await migrateDatabase(database, now);
        const repositories = createSqliteRepositories(database);
        await repositories.upsertProfile({ id: 'p1', displayName: 'Ada', avatarUrl: null, updatedAt: now });
        await repositories.upsertChat({ id: 'c-title', title: 'Бабушка', kind: 'direct', lastMessageAt: '2026-10-03T14:00:00.000Z', unreadCount: 0, updatedAt: now });
        await repositories.upsertChat({ id: 'c-body', title: 'Соседи', kind: 'direct', lastMessageAt: '2026-10-03T13:00:00.000Z', unreadCount: 0, updatedAt: now });
        await repositories.upsertChat({ id: 'c-russian', title: 'Родители', kind: 'direct', lastMessageAt: '2026-10-03T12:00:00.000Z', unreadCount: 0, updatedAt: now });
        await repositories.upsertChat({ id: 'c-plain', title: 'Друзья', kind: 'direct', lastMessageAt: '2026-10-03T11:00:00.000Z', unreadCount: 0, updatedAt: now });
        await repositories.upsertMessage({ ...message, id: 'm-title', chatId: 'c-title', clientMessageId: 'cm-title', body: 'обычный текст' });
        await repositories.upsertMessage({ ...message, id: 'm-body-old', chatId: 'c-body', clientMessageId: 'cm-body-old', body: 'раннее сообщение' });
        await repositories.upsertMessage({ ...message, id: 'm-body', chatId: 'c-body', clientMessageId: 'cm-body', body: 'Привезли лекарства' });
        await repositories.upsertMessage({ ...message, id: 'm-russian', chatId: 'c-russian', clientMessageId: 'cm-russian', body: 'ЁЛКА во дворе' });
        await repositories.upsertMessage({ ...message, id: 'm-plain', chatId: 'c-plain', clientMessageId: 'cm-plain', body: 'без совпадений' });

        expect(await repositories.searchChatIds('бабушка')).toEqual(['c-title']);
        expect(await repositories.searchChatIds('лекарства')).toEqual(['c-body']);
        expect(await repositories.searchChatIds('ёлка')).toEqual(['c-russian']);
        expect(await repositories.searchChatIds('нет такого')).toEqual([]);
      } finally {
        database.close();
      }
    });
  });

  it('treats SQL wildcard and injection-shaped search text as literal text', async () => {
    await withTempSqlitePath('che-tam-local-search-literal-', async (databasePath) => {
      const database = new RealSqliteDatabase(databasePath);
      try {
        await migrateDatabase(database, now);
        const repositories = createSqliteRepositories(database);
        await repositories.upsertProfile({ id: 'p1', displayName: 'Ada', avatarUrl: null, updatedAt: now });
        await repositories.upsertChat({ id: 'c-percent', title: 'Проценты', kind: 'direct', lastMessageAt: '2026-10-03T14:00:00.000Z', unreadCount: 0, updatedAt: now });
        await repositories.upsertChat({ id: 'c-other', title: 'Другой чат', kind: 'direct', lastMessageAt: '2026-10-03T13:00:00.000Z', unreadCount: 0, updatedAt: now });
        await repositories.upsertMessage({ ...message, id: 'm-percent', chatId: 'c-percent', clientMessageId: 'cm-percent', body: 'скидка 50% только сегодня' });
        await repositories.upsertMessage({ ...message, id: 'm-other', chatId: 'c-other', clientMessageId: 'cm-other', body: 'обычное сообщение' });

        expect(await repositories.searchChatIds('%')).toEqual(['c-percent']);
        expect(await repositories.searchChatIds("' OR 1=1 --")).toEqual([]);
      } finally {
        database.close();
      }
    });
  });
});
