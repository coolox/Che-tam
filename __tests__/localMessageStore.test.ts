import { InMemorySqliteDatabase } from '../src/storage/sqlite/inMemoryAdapter';
import { createLocalMessageStore, EMPTY_CHATS_TEXT, EMPTY_CONVERSATION_TEXT, formatChatListTime, formatLocalDataError, formatLocalDataErrorDiagnostic, LOCAL_DATA_ERROR_TEXT, LOCAL_LOADING_TEXT } from '../src/messages/localMessageStore';
import { createDebugLocalAckTransportAvailabilitySource } from '../src/messages/localOutbox';

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
    const store = createLocalMessageStore(async () => database, 'che-tam-local.db', { developmentSeedEnabled: true });
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
    expect(store.getSnapshot()).toEqual({ status: 'ready', chats: [], messagesByChat: {}, errorText: null, errorDiagnostic: null });
  });

  it('clears persisted unread when opening a chat', async () => {
    const database = new InMemorySqliteDatabase();
    const store = createLocalMessageStore(async () => database, 'che-tam-local.db', { developmentSeedEnabled: true });
    await store.bootstrap();
    await store.clearUnread('parents');
    expect(store.getSnapshot().chats.find((chat) => chat.id === 'parents')?.unread).toBe(0);
    await store.bootstrap();
    expect(store.getSnapshot().chats.find((chat) => chat.id === 'parents')?.unread).toBe(0);
  });

  it('saves separate composer drafts and clears blank drafts', async () => {
    const database = new InMemorySqliteDatabase();
    const store = createLocalMessageStore(async () => database, 'che-tam-local.db', { developmentSeedEnabled: true });
    await store.bootstrap();

    await store.saveComposerDraft('parents', '  Черновик для родителей  ');
    await store.saveComposerDraft('sister', 'Черновик для сестры');
    await store.saveComposerDraft('parents', '   ');

    expect(await store.readComposerDraft('parents')).toBeNull();
    expect(await store.readComposerDraft('sister')).toBe('Черновик для сестры');
  });

  it('retains drafts for empty or failed sends and clears only after a successful send', async () => {
    const database = new InMemorySqliteDatabase();
    const store = createLocalMessageStore(async () => database, 'che-tam-local.db', {
      developmentSeedEnabled: true,
      idFactory: () => 'draft-send-client-message',
      now: () => new Date('2026-10-03T12:00:00.000Z'),
    });
    await store.bootstrap();
    await store.saveComposerDraft('parents', 'Останется');

    expect(await store.sendTextMessage('parents', '   ')).toEqual({ sent: false, clientMessageId: null });
    expect(await store.readComposerDraft('parents')).toBe('Останется');

    database.failNext('insert into messages');
    expect(await store.sendTextMessage('parents', 'Останется')).toEqual({ sent: false, clientMessageId: null });
    expect(await store.readComposerDraft('parents')).toBe('Останется');

    expect(await store.sendTextMessage('parents', 'Останется')).toEqual({ sent: true, clientMessageId: 'draft-send-client-message' });
    expect(await store.readComposerDraft('parents')).toBeNull();
  });

  it('persists reply snapshots across reloads even when the original message is deleted locally', async () => {
    const database = new InMemorySqliteDatabase();
    const store = createLocalMessageStore(async () => database, 'che-tam-local.db', {
      developmentSeedEnabled: true,
      idFactory: () => 'reply-client-message',
      now: () => new Date('2026-10-03T12:00:00.000Z'),
      transport: null,
    });
    await store.bootstrap();
    const original = store.getSnapshot().messagesByChat.parents[0];

    await expect(store.sendTextMessage('parents', '  Отвечаю локально  ', {
      messageId: original.id,
      senderName: 'Мама и папа',
      preview: 'Как дети? Получилось подключиться к Wi-Fi?',
    })).resolves.toEqual({ sent: true, clientMessageId: 'reply-client-message' });

    expect(store.getSnapshot().messagesByChat.parents.at(-1)).toMatchObject({
      id: 'reply-client-message',
      replyTo: {
        messageId: 'parents-1',
        senderName: 'Мама и папа',
        preview: 'Как дети? Получилось подключиться к Wi-Fi?',
      },
      text: 'Отвечаю локально',
    });

    await store.bootstrap();
    expect(store.getSnapshot().messagesByChat.parents.at(-1)?.replyTo).toEqual({
      messageId: 'parents-1',
      senderName: 'Мама и папа',
      preview: 'Как дети? Получилось подключиться к Wi-Fi?',
    });

    await store.deleteMessageForMe('parents-1');
    expect(store.getSnapshot().messagesByChat.parents.map(message => message.id)).not.toContain('parents-1');
    expect(store.getSnapshot().messagesByChat.parents.at(-1)?.replyTo).toEqual({
      messageId: null,
      senderName: 'Мама и папа',
      preview: 'Как дети? Получилось подключиться к Wi-Fi?',
    });
  });

  it('deletes a selected message only from local SQLite state and removes its pending outbox row', async () => {
    const database = new InMemorySqliteDatabase();
    const store = createLocalMessageStore(async () => database, 'che-tam-local.db', {
      developmentSeedEnabled: true,
      idFactory: () => 'delete-local-client-message',
      now: () => new Date('2026-10-03T12:00:00.000Z'),
      transport: null,
    });
    await store.bootstrap();
    await store.sendTextMessage('parents', 'Удалить только здесь');
    expect(await database.query('SELECT client_message_id FROM outbox WHERE client_message_id = ?', ['delete-local-client-message'])).toHaveLength(1);

    await store.deleteMessageForMe('delete-local-client-message');

    expect(store.getSnapshot().messagesByChat.parents.map(message => message.id)).not.toContain('delete-local-client-message');
    expect(await database.query('SELECT client_message_id FROM outbox WHERE client_message_id = ?', ['delete-local-client-message'])).toEqual([]);
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
    expect(store.getSnapshot().errorDiagnostic).toBeNull();
  });

  it('formats bounded local error codes without stacks or raw messages', () => {
    const errorText = formatLocalDataError(new TypeError('FOREIGN KEY constraint failed: messages.chat_id / secret token'));
    expect(errorText.startsWith(LOCAL_DATA_ERROR_TEXT)).toBe(true);
    expect(errorText).toMatch(/Код: TypeError-[a-z0-9]{6}$/);
    expect(errorText).not.toContain('messages.chat_id');
    expect(errorText).not.toContain('secret');
    expect(errorText.length).toBeLessThanOrEqual(LOCAL_DATA_ERROR_TEXT.length + 40);
  });

  it('exposes bounded raw diagnostics only in explicit local test mode', async () => {
    const failure = new TypeError('FOREIGN KEY constraint failed: messages.chat_id / secret token');
    const productionStore = createLocalMessageStore(async () => { throw failure; }, 'che-tam-local.db', { localTestMode: { enabled: false } });
    const localTestStore = createLocalMessageStore(async () => { throw failure; }, 'che-tam-local.db', { localTestMode: { enabled: true } });

    await productionStore.bootstrap();
    await localTestStore.bootstrap();

    expect(productionStore.getSnapshot()).toMatchObject({
      status: 'error',
      errorDiagnostic: null,
    });
    expect(productionStore.getSnapshot().errorText).not.toContain('messages.chat_id');
    expect(productionStore.getSnapshot().errorText).not.toContain('secret token');
    expect(localTestStore.getSnapshot()).toMatchObject({
      status: 'error',
      errorDiagnostic: {
        name: 'TypeError',
        message: 'FOREIGN KEY constraint failed: messages.chat_id / secret token',
      },
    });
  });

  it('bounds local test diagnostics for UI presentation', () => {
    const error = new Error(`line one\n${'x'.repeat(1200)}`);
    error.name = 'Custom\x00DatabaseError';
    const diagnostic = formatLocalDataErrorDiagnostic(error);

    expect(diagnostic.name).toBe('Custom DatabaseError');
    expect(diagnostic.message).toMatch(/^line one x+/);
    expect(diagnostic.message).toHaveLength(1000);
    expect(diagnostic.message.endsWith('…')).toBe(true);
  });

  it('exposes a connected status source only for explicit local fake ack transport mode', () => {
    expect(createDebugLocalAckTransportAvailabilitySource({ enabled: false })).toBeNull();

    const source = createDebugLocalAckTransportAvailabilitySource({ enabled: true });
    const listener = jest.fn();
    const unsubscribe = source?.addEventListener(listener);

    expect(source).toMatchObject({ explicitlyConnectedTransport: true });
    expect(listener).toHaveBeenCalledWith(true);
    expect(unsubscribe).toEqual(expect.any(Function));
  });
});
