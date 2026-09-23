import { Chat, Message, TabKey } from './types';

const normalize = (value: string) => value.trim().toLocaleLowerCase('ru-RU');

export function searchChats(chats: Chat[], query: string): Chat[] {
  const needle = normalize(query);
  if (!needle) {
    return chats;
  }
  return chats.filter(chat => normalize(`${chat.name} ${chat.lastMessage}`).includes(needle));
}

export function getOrderedChats(chats: Chat[], query = ''): Chat[] {
  return [...searchChats(chats, query)].sort((first, second) => {
    if (first.pinned !== second.pinned) {
      return first.pinned ? -1 : 1;
    }
    return chats.indexOf(first) - chats.indexOf(second);
  });
}

export function togglePinnedChat(chats: Chat[], chatId: string): Chat[] {
  return chats.map(chat => (chat.id === chatId ? { ...chat, pinned: !chat.pinned } : chat));
}

export function appendOutgoingMessage(
  messages: Message[],
  draft: string,
  now: Date = new Date(),
): { added: false; messages: Message[] } | { added: true; message: Message; messages: Message[] } {
  const text = draft.trim();
  if (!text) {
    return { added: false, messages };
  }
  const chatId = messages[0]?.chatId ?? 'demo';
  const message: Message = {
    id: `${chatId}-${now.getTime()}`,
    chatId,
    sender: 'me',
    text,
    createdAt: now.toISOString(),
    delivered: true,
  };
  return { added: true, message, messages: [...messages, message] };
}

export function selectTab(_current: TabKey, next: TabKey): TabKey {
  return next;
}

export function formatMessageTime(value: string): string {
  return new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }).format(new Date(value));
}

export function getChatPreview(chat: Chat): string {
  return chat.lastMessage.length > 80 ? `${chat.lastMessage.slice(0, 77)}...` : chat.lastMessage;
}
