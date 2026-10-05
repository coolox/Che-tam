import { INITIAL_CHATS, INITIAL_MESSAGES } from '../ui/demoData';
import type { Chat, Message } from '../ui/types';
import { migrateDatabase } from '../storage/sqlite/migrate';
import { createSqliteRepositories, type SqliteRepositories, type StoredChat, type StoredMessage } from '../storage/sqlite/repositories';
import type { SqlDatabaseFactory } from '../storage/sqlite/contracts';
import { subscribeToNetworkAvailability, type NetworkAvailabilitySource } from '../hooks/useConnectionStatus';
import { createDebugLocalAckTransport, createLocalOutboxWorker, type LocalOutboxTransport, type LocalOutboxWorker } from './localOutbox';

export const LOCAL_DATA_ERROR_TEXT = 'Не удалось открыть локальные данные. Попробуйте ещё раз.';
export const LOCAL_LOADING_TEXT = 'Загружаем локальные сообщения…';
export const EMPTY_CHATS_TEXT = 'Здесь появятся ваши чаты';
export const EMPTY_CONVERSATION_TEXT = 'В этом чате пока нет сообщений';

export type LocalDataSnapshot =
  | { status: 'loading'; chats: Chat[]; messagesByChat: Record<string, Message[]>; errorText: null }
  | { status: 'ready'; chats: Chat[]; messagesByChat: Record<string, Message[]>; errorText: null }
  | { status: 'error'; chats: Chat[]; messagesByChat: Record<string, Message[]>; errorText: string };

export type LocalMessageStore = {
  bootstrap(): Promise<void>;
  clearUnread(chatId: string): Promise<void>;
  dispose(): void;
  getSnapshot(): LocalDataSnapshot;
  retryTextMessage(clientMessageId: string): Promise<{ retried: boolean }>;
  sendTextMessage(chatId: string, draft: string): Promise<{ sent: boolean; clientMessageId: string | null }>;
  subscribe(listener: () => void): () => void;
};

type LocalMessageStoreOptions = {
  developmentSeedEnabled?: boolean;
  idFactory?: () => string;
  initialNetworkAvailable?: boolean;
  networkAvailabilitySource?: NetworkAvailabilitySource;
  now?: () => Date;
  transport?: LocalOutboxTransport | null;
};

const FIXTURE_TIMESTAMP = '2026-09-22T12:00:00.000Z';
const LOCAL_PROFILE_ID = 'local-self';
const RELATIVE_PROFILE_ID = 'local-relative';
const silentNetworkAvailabilitySource: NetworkAvailabilitySource = {
  addEventListener: () => () => undefined,
};

function hashErrorText(value: string): string {
  let hash = 0x811c9dc5;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36).slice(0, 6).padStart(6, '0');
}

export function formatLocalDataError(error: unknown): string {
  const name = error instanceof Error ? error.name : 'Error';
  const message = error instanceof Error ? error.message : String(error);
  const safeName = name.replace(/[^a-zA-Z0-9_ -]/g, '').trim().slice(0, 24) || 'Error';
  return `${LOCAL_DATA_ERROR_TEXT} Код: ${safeName}-${hashErrorText(message)}`;
}

function initials(title: string): string {
  return title.split(/\s+/).filter(Boolean).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
}

function avatarColor(id: string): string {
  const colors = ['#116149', '#7c4f2c', '#8a4f7d', '#2f668f', '#b25d32', '#4e6f51'];
  return colors[[...id].reduce((sum, character) => sum + character.charCodeAt(0), 0) % colors.length];
}

function messageToViewModel(message: StoredMessage): Message {
  const localDeliveryState = message.deliveryState === 'queued' || message.deliveryState === 'sent' || message.deliveryState === 'not_sent'
    ? message.deliveryState
    : undefined;
  return {
    id: message.id,
    chatId: message.chatId,
    clientMessageId: message.clientMessageId,
    sender: message.senderId === LOCAL_PROFILE_ID ? 'me' : 'relative',
    text: message.body,
    createdAt: message.createdAt,
    delivered: message.deliveryState === 'delivered' || message.deliveryState === 'read',
    read: message.deliveryState === 'read',
    deliveryState: localDeliveryState,
    kind: 'text',
  };
}

export function formatChatListTime(timestamp: string, options: Intl.DateTimeFormatOptions = {}): string {
  return new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', ...options }).format(new Date(timestamp));
}

function chatToViewModel(chat: StoredChat, lastMessage: string): Chat {
  return {
    id: chat.id,
    name: chat.title,
    initials: initials(chat.title),
    avatarColor: avatarColor(chat.id),
    lastMessage,
    time: chat.lastMessageAt ? formatChatListTime(chat.lastMessageAt) : '',
    unread: chat.unreadCount,
    trafficLabel: 'Локальные сообщения',
    pinned: false,
  };
}

async function seedDevelopmentFixture(repositories: SqliteRepositories): Promise<void> {
  if ((await repositories.listChats()).length > 0) return;
  await repositories.upsertProfile({ id: LOCAL_PROFILE_ID, displayName: 'Вы', avatarUrl: null, updatedAt: FIXTURE_TIMESTAMP });
  await repositories.upsertProfile({ id: RELATIVE_PROFILE_ID, displayName: 'Семья', avatarUrl: null, updatedAt: FIXTURE_TIMESTAMP });
  for (const fixtureChat of INITIAL_CHATS) {
    const fixtureMessages = INITIAL_MESSAGES[fixtureChat.id] ?? [];
    const lastMessageAt = fixtureMessages.at(-1)?.createdAt ?? null;
    await repositories.upsertChat({
      id: fixtureChat.id,
      title: fixtureChat.name,
      kind: 'local',
      lastMessageAt,
      unreadCount: fixtureChat.unread,
      updatedAt: FIXTURE_TIMESTAMP,
    });
    for (const fixtureMessage of fixtureMessages) {
      await repositories.upsertMessage({
        id: fixtureMessage.id,
        chatId: fixtureMessage.chatId,
        clientMessageId: `fixture-${fixtureMessage.id}`,
        senderId: fixtureMessage.sender === 'me' ? LOCAL_PROFILE_ID : RELATIVE_PROFILE_ID,
        body: fixtureMessage.text,
        createdAt: fixtureMessage.createdAt,
        deliveryState: fixtureMessage.read ? 'read' : fixtureMessage.delivered ? 'delivered' : 'queued',
        updatedAt: FIXTURE_TIMESTAMP,
      });
    }
  }
}

function isDevelopmentBuild(): boolean {
  return typeof __DEV__ !== 'undefined' && __DEV__;
}

function createUuid(): string {
  const randomUuid = globalThis.crypto?.randomUUID;
  if (randomUuid) return randomUuid.call(globalThis.crypto);
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, marker => {
    const value = Math.floor(Math.random() * 16);
    return (marker === 'x' ? value : (value & 0x3) | 0x8).toString(16);
  });
}

export function createLocalMessageStore(
  factory: SqlDatabaseFactory,
  databaseName = 'che-tam-local.db',
  options: LocalMessageStoreOptions = {},
): LocalMessageStore {
  let snapshot: LocalDataSnapshot = { status: 'loading', chats: [], messagesByChat: {}, errorText: null };
  let repositories: SqliteRepositories | null = null;
  let outboxWorker: LocalOutboxWorker | null = null;
  let networkAvailable = options.initialNetworkAvailable ?? false;
  let unsubscribeNetworkAvailability: (() => void) | null = null;
  const developmentSeedEnabled = options.developmentSeedEnabled ?? isDevelopmentBuild();
  const idFactory = options.idFactory ?? createUuid;
  const networkAvailabilitySource = options.networkAvailabilitySource ?? silentNetworkAvailabilitySource;
  const now = options.now ?? (() => new Date());
  const transport = options.transport === undefined ? createDebugLocalAckTransport() : options.transport;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());
  const setSnapshot = (next: LocalDataSnapshot) => { snapshot = next; notify(); };

  async function refresh(): Promise<void> {
    if (!repositories) throw new Error('Repository is not ready');
    const storedChats = await repositories.listChats();
    const messagesByChat: Record<string, Message[]> = {};
    const chats: Chat[] = [];
    for (const storedChat of storedChats) {
      const messages = (await repositories.listMessages(storedChat.id)).map(messageToViewModel);
      messagesByChat[storedChat.id] = messages;
      chats.push(chatToViewModel(storedChat, messages.at(-1)?.text ?? ''));
    }
    setSnapshot({ status: 'ready', chats, messagesByChat, errorText: null });
  }

  function refreshAfterOutboxAck(): void {
    void refresh().catch(() => undefined);
  }

  return {
    async bootstrap() {
      setSnapshot({ status: 'loading', chats: [], messagesByChat: {}, errorText: null });
      try {
        const database = await factory(databaseName);
        await migrateDatabase(database, FIXTURE_TIMESTAMP);
        repositories = createSqliteRepositories(database);
        if (developmentSeedEnabled) await seedDevelopmentFixture(repositories);
        outboxWorker?.dispose();
        unsubscribeNetworkAvailability?.();
        outboxWorker = createLocalOutboxWorker(repositories, transport, { now, onMessageUpdated: refreshAfterOutboxAck, online: networkAvailable });
        unsubscribeNetworkAvailability = subscribeToNetworkAvailability(networkAvailabilitySource, event => {
          if (event.type === 'networkObserved') networkAvailable = event.available;
          else networkAvailable = event.type === 'networkRestored';
          outboxWorker?.setOnline(networkAvailable);
        });
        await refresh();
        await outboxWorker.kick();
      } catch (error) {
        repositories = null;
        unsubscribeNetworkAvailability?.();
        unsubscribeNetworkAvailability = null;
        outboxWorker?.dispose();
        outboxWorker = null;
        setSnapshot({ status: 'error', chats: [], messagesByChat: {}, errorText: formatLocalDataError(error) });
      }
    },
    async clearUnread(chatId) {
      if (!repositories) return;
      try {
        await repositories.clearChatUnread(chatId, FIXTURE_TIMESTAMP);
        await refresh();
      } catch (error) {
        setSnapshot({ status: 'error', chats: [], messagesByChat: {}, errorText: formatLocalDataError(error) });
      }
    },
    dispose() {
      unsubscribeNetworkAvailability?.();
      unsubscribeNetworkAvailability = null;
      outboxWorker?.dispose();
      outboxWorker = null;
      listeners.clear();
    },
    async retryTextMessage(clientMessageId) {
      if (!repositories) return { retried: false };
      const updatedAt = now().toISOString();
      try {
        const retried = await repositories.retryNotSentTextMessage(clientMessageId, LOCAL_PROFILE_ID, updatedAt);
        if (retried) {
          await refresh();
          void outboxWorker?.kick();
        }
        return { retried };
      } catch (error) {
        setSnapshot({ status: 'error', chats: snapshot.chats, messagesByChat: snapshot.messagesByChat, errorText: formatLocalDataError(error) });
        return { retried: false };
      }
    },
    async sendTextMessage(chatId, draft) {
      if (!repositories) return { sent: false, clientMessageId: null };
      const body = draft.trim();
      if (!body) return { sent: false, clientMessageId: null };
      const createdAt = now().toISOString();
      const clientMessageId = idFactory();
      const message: StoredMessage = {
        id: clientMessageId,
        chatId,
        clientMessageId,
        senderId: LOCAL_PROFILE_ID,
        body,
        createdAt,
        deliveryState: 'queued',
        updatedAt: createdAt,
      };
      try {
        await repositories.saveMessageAndEnqueue(message, {
          clientMessageId,
          chatId,
          payload: JSON.stringify({ kind: 'text', clientMessageId, chatId, body, createdAt }),
          state: 'queued',
          attemptCount: 0,
          nextAttemptAt: null,
          createdAt,
          updatedAt: createdAt,
        });
        await refresh();
        void outboxWorker?.kick();
        return { sent: true, clientMessageId };
      } catch (error) {
        setSnapshot({ status: 'error', chats: snapshot.chats, messagesByChat: snapshot.messagesByChat, errorText: formatLocalDataError(error) });
        return { sent: false, clientMessageId: null };
      }
    },
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  };
}
