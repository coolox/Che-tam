import { InMemorySqliteDatabase } from '../src/storage/sqlite/inMemoryAdapter';
import { createLocalMessageStore, EMPTY_CHATS_TEXT, EMPTY_CONVERSATION_TEXT, formatChatListTime, formatLocalDataError, LOCAL_DATA_ERROR_TEXT, LOCAL_LOADING_TEXT } from '../src/messages/localMessageStore';

describe('local message store', () => {
  it('formats chat-list times in the selected device time zone', () => {
    const instant = '2026-01-15T12:00:00.000Z';
    const istanbul = formatChatListTime(instant, { timeZone: 'Europe/Istanbul' });
    const ashgabat = formatChatListTime(instant, { timeZone: 'Asia/Ashgabat' });

    expect(istanbul).toBe('15:00');
    expect(ashgabat).toBe('17:00');
    expect(istanbul).not.toBe(ashgabat);
  });

  it('migrates, seeds only once, and reads chats/messages from repositories', async () => {
    const database = new InMemorySqliteDatabase();
    const store = createLocalMessageStore(async () => database);
    expect(store.getSnapshot().status).toBe('loading');
    await store.bootstrap();
    const first = store.getSnapshot();
    expect(first.status).toBe('ready');
    expect(first.chats.map((chat) => chat.id)).toEqual(['parents', 'sister', 'grandma', 'brother', 'family', 'cousin']);
    expect(first.chats[0].unread).toBe(2);
    expect(first.messagesByChat.parents.map((message) => message.id)).toEqual(['parents-1', 'parents-2', 'parents-call-1', 'parents-call-2', 'parents-3', 'parents-4', 'parents-5']);
    await store.bootstrap();
    expect(store.getSnapshot().chats).toHaveLength(6);
    expect(store.getSnapshot().messagesByChat.parents).toHaveLength(7);
  });

  it('does not seed demo data when development seed is disabled', async () => {
    const database = new InMemorySqliteDatabase();
    const store = createLocalMessageStore(async () => database, 'che-tam-local.db', { developmentSeedEnabled: false });
    await store.bootstrap();
    expect(store.getSnapshot()).toEqual({ status: 'ready', chats: [], messagesByChat: {}, errorText: null });
  });

  it('clears persisted unread when opening a chat', async () => {
    const database = new InMemorySqliteDatabase();
    const store = createLocalMessageStore(async () => database);
    await store.bootstrap();
    await store.clearUnread('parents');
    expect(store.getSnapshot().chats.find((chat) => chat.id === 'parents')?.unread).toBe(0);
    await store.bootstrap();
    expect(store.getSnapshot().chats.find((chat) => chat.id === 'parents')?.unread).toBe(0);
  });

  it('has deterministic Russian loading, empty, and recoverable error strings', async () => {
    expect(LOCAL_LOADING_TEXT).toBe('Загружаем локальные сообщения…');
    expect(EMPTY_CHATS_TEXT).toBe('Здесь появятся ваши чаты');
    expect(EMPTY_CONVERSATION_TEXT).toBe('В этом чате пока нет сообщений');
    const store = createLocalMessageStore(async () => { throw new Error('private failure'); });
    await store.bootstrap();
    expect(store.getSnapshot()).toMatchObject({ status: 'error' });
    expect(store.getSnapshot().errorText).toMatch(/^Не удалось открыть локальные данные\. Попробуйте ещё раз\. Код: Error-[a-z0-9]{6}$/);
    expect(store.getSnapshot().errorText).not.toContain('private failure');
  });

  it('formats bounded local error codes without stacks or raw messages', () => {
    const errorText = formatLocalDataError(new TypeError('FOREIGN KEY constraint failed: messages.chat_id / secret token'));
    expect(errorText.startsWith(LOCAL_DATA_ERROR_TEXT)).toBe(true);
    expect(errorText).toMatch(/Код: TypeError-[a-z0-9]{6}$/);
    expect(errorText).not.toContain('messages.chat_id');
    expect(errorText).not.toContain('secret');
    expect(errorText.length).toBeLessThanOrEqual(LOCAL_DATA_ERROR_TEXT.length + 40);
  });
});
