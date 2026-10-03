import { INITIAL_CHATS, INITIAL_MESSAGES } from '../ui/demoData';
import type { Chat, Message } from '../ui/types';
import { migrateDatabase } from '../storage/sqlite/migrate';
import { createSqliteRepositories, type SqliteRepositories, type StoredChat, type StoredMessage } from '../storage/sqlite/repositories';
import type { SqlDatabaseFactory } from '../storage/sqlite/contracts';

export const LOCAL_DATA_ERROR_TEXT = 'Не удалось открыть локальные данные. Попробуйте ещё раз.';
export const LOCAL_LOADING_TEXT = 'Загружаем локальные сообщения…';
export const EMPTY_CHATS_TEXT = 'Здесь появятся ваши чаты';
export const EMPTY_CONVERSATION_TEXT = 'В этом чате пока нет сообщений';

export type LocalDataSnapshot =
  | { status: 'loading'; chats: Chat[]; messagesByChat: Record<string, Message[]>; errorText: null }
  | { status: 'ready'; chats: Chat[]; messagesByChat: Record<string, Message[]>; errorText: null }
  | { status: 'error'; chats: Chat[]; messagesByChat: Record<string, Message[]>; errorText: typeof LOCAL_DATA_ERROR_TEXT };

export type LocalMessageStore = {
  bootstrap(): Promise<void>;
  clearUnread(chatId: string): Promise<void>;
  getSnapshot(): LocalDataSnapshot;
  subscribe(listener: () => void): () => void;
};

const FIXTURE_TIMESTAMP = '2026-09-22T12:00:00.000Z';
const LOCAL_PROFILE_ID = 'local-self';
const RELATIVE_PROFILE_ID = 'local-relative';

function initials(title: string): string {
  return title.split(/\s+/).filter(Boolean).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
}

function avatarColor(id: string): string {
  const colors = ['#116149', '#7c4f2c', '#8a4f7d', '#2f668f', '#b25d32', '#4e6f51'];
  return colors[[...id].reduce((sum, character) => sum + character.charCodeAt(0), 0) % colors.length];
}

function messageToViewModel(message: StoredMessage): Message {
  return {
    id: message.id,
    chatId: message.chatId,
    sender: message.senderId === LOCAL_PROFILE_ID ? 'me' : 'relative',
    text: message.body,
    createdAt: message.createdAt,
    delivered: message.deliveryState !== 'queued',
    read: message.deliveryState === 'read',
    kind: 'text',
  };
}

function chatToViewModel(chat: StoredChat, lastMessage: string): Chat {
  return {
    id: chat.id,
    name: chat.title,
    initials: initials(chat.title),
    avatarColor: avatarColor(chat.id),
    lastMessage,
    time: chat.lastMessageAt ? new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }).format(new Date(chat.lastMessageAt)) : '',
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

export function createLocalMessageStore(factory: SqlDatabaseFactory, databaseName = 'che-tam-local.db'): LocalMessageStore {
  let snapshot: LocalDataSnapshot = { status: 'loading', chats: [], messagesByChat: {}, errorText: null };
  let repositories: SqliteRepositories | null = null;
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

  return {
    async bootstrap() {
      setSnapshot({ status: 'loading', chats: [], messagesByChat: {}, errorText: null });
      try {
        const database = await factory(databaseName);
        await migrateDatabase(database, FIXTURE_TIMESTAMP);
        repositories = createSqliteRepositories(database);
        await seedDevelopmentFixture(repositories);
        await refresh();
      } catch {
        repositories = null;
        setSnapshot({ status: 'error', chats: [], messagesByChat: {}, errorText: LOCAL_DATA_ERROR_TEXT });
      }
    },
    async clearUnread(chatId) {
      if (!repositories) return;
      try {
        await repositories.clearChatUnread(chatId, FIXTURE_TIMESTAMP);
        await refresh();
      } catch {
        setSnapshot({ status: 'error', chats: [], messagesByChat: {}, errorText: LOCAL_DATA_ERROR_TEXT });
      }
    },
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  };
}
