import { CallLogCallbackType, CallLogEntry, Chat, Message, TabKey } from './types';

const normalize = (value: string) => value.trim().toLocaleLowerCase('ru-RU');
const REPLY_PREVIEW_LIMIT = 120;

export type ComposerAction = 'mic' | 'send';
export type LocalDeliveryState = 'queued' | 'sent' | 'delivered' | 'read' | 'not_sent';
export type ReceiptState = 'none' | 'sent' | 'delivered' | 'read';
export type DeliveryIndicatorState = 'none' | 'queued' | 'sent' | 'delivered' | 'read' | 'not_sent';
export type DeliveryIndicatorPresentation = {
  icon: 'none' | 'clock' | 'check' | 'checkCheck' | 'alert';
  iconCount: 0 | 1;
  accent: boolean;
};
export type ReplyTarget = {
  messageId: string;
  senderName: string;
  preview: string;
};
export type MessageActionSheetState =
  | { visible: false; message: null; confirmDelete: false }
  | { visible: true; message: Message; confirmDelete: boolean };
export type MessagePresentation = {
  incomingTail: boolean;
  isCallEvent: boolean;
  isMissedCall: boolean;
  localDeliveryState: LocalDeliveryState | null;
  receipt: ReceiptState;
};
export type ConversationDateMessageItem = {
  itemType: 'message';
  key: string;
  message: Message;
};
export type ConversationDateDividerItem = {
  itemType: 'dateDivider';
  key: string;
  label: string;
};
export type ConversationDateItem = ConversationDateDividerItem | ConversationDateMessageItem;
export type ConversationDateGroupingOptions = {
  now?: Date;
  timeZone?: string;
};
export type CallLogDisplayModel =
  | { empty: true; emptyText: 'Здесь появятся ваши звонки'; rows: [] }
  | { empty: false; emptyText: null; rows: CallLogEntry[] };
export type ChatSelectionModel = {
  active: boolean;
  selectedIds: string[];
};
export type ChatSearchModel = {
  active: boolean;
  query: string;
};
export type ChatPreviewDisplayModel = {
  accessibilityLabel: string;
  isDraft: boolean;
  text: string;
};

export function searchChats(chats: Chat[], query: string, messagesByChat: Record<string, Message[]> = {}): Chat[] {
  const needle = normalize(query);
  if (!needle) {
    return chats;
  }
  return chats.filter(chat => {
    const messageText = (messagesByChat[chat.id] ?? []).map(message => message.text).join(' ');
    return normalize(`${chat.name} ${chat.lastMessage} ${messageText}`).includes(needle);
  });
}

export function getOrderedChats(chats: Chat[], query = '', messagesByChat: Record<string, Message[]> = {}): Chat[] {
  return [...searchChats(chats, query, messagesByChat)].sort((first, second) => {
    if (first.pinned !== second.pinned) {
      return first.pinned ? -1 : 1;
    }
    return chats.indexOf(first) - chats.indexOf(second);
  });
}

export function togglePinnedChat(chats: Chat[], chatId: string): Chat[] {
  return chats.map(chat => (chat.id === chatId ? { ...chat, pinned: !chat.pinned } : chat));
}

export function startChatSelection(chatId: string): ChatSelectionModel {
  return { active: true, selectedIds: [chatId] };
}

export function toggleChatSelection(selectedIds: string[], chatId: string): ChatSelectionModel {
  const selected = selectedIds.includes(chatId);
  const nextSelectedIds = selected ? selectedIds.filter(id => id !== chatId) : [...selectedIds, chatId];
  return { active: nextSelectedIds.length > 0, selectedIds: nextSelectedIds };
}

export function clearChatSelection(): ChatSelectionModel {
  return { active: false, selectedIds: [] };
}

export const startFamilySelection = startChatSelection;

export const toggleFamilySelection = toggleChatSelection;

export const clearFamilySelection = clearChatSelection;

export function openChatSearch(current: ChatSearchModel): ChatSearchModel {
  return current.active ? current : { active: true, query: current.query };
}

export function updateChatSearchQuery(current: ChatSearchModel, query: string): ChatSearchModel {
  return { active: current.active, query };
}

export function clearChatSearchQuery(current: ChatSearchModel): ChatSearchModel {
  return { active: current.active, query: '' };
}

export function closeChatSearch(): ChatSearchModel {
  return { active: false, query: '' };
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
    kind: 'text',
  };
  return { added: true, message, messages: [...messages, message] };
}

export function getComposerState(draft: string): { action: ComposerAction; showCamera: boolean; trimmedText: string } {
  const trimmedText = draft.trim();
  const isEmpty = trimmedText.length === 0;
  return {
    action: isEmpty ? 'mic' : 'send',
    showCamera: isEmpty,
    trimmedText,
  };
}

export function getMessageSenderName(message: Pick<Message, 'sender'>, chat: Pick<Chat, 'name'>): string {
  if (message.sender === 'me') return 'Вы';
  if (message.sender === 'relative') return chat.name;
  return 'Событие';
}

export function formatReplyPreview(text: string, limit = REPLY_PREVIEW_LIMIT): string {
  const compact = text.replace(/\s+/g, ' ').trim();
  if (compact.length <= limit) return compact;
  return `${compact.slice(0, limit - 1)}…`;
}

export function createReplyTarget(message: Message, chat: Pick<Chat, 'name'>): ReplyTarget {
  return {
    messageId: message.id,
    senderName: getMessageSenderName(message, chat),
    preview: formatReplyPreview(message.text),
  };
}

export function openMessageActionSheet(message: Message): MessageActionSheetState {
  return { visible: true, message, confirmDelete: false };
}

export function closeMessageActionSheet(): MessageActionSheetState {
  return { visible: false, message: null, confirmDelete: false };
}

export function requestMessageDeleteConfirmation(state: MessageActionSheetState): MessageActionSheetState {
  if (!state.visible) return state;
  return { ...state, confirmDelete: true };
}

export function getMessagePresentation(messages: Message[], message: Message): MessagePresentation {
  const index = messages.findIndex(item => item.id === message.id);
  const previous = index > 0 ? messages[index - 1] : undefined;
  const isCallEvent = message.kind === 'call';
  const localDeliveryState = message.sender === 'me' && message.kind !== 'call' && message.deliveryState ? message.deliveryState : null;
  const receipt: ReceiptState =
    message.sender !== 'me' || isCallEvent ? 'none'
      : localDeliveryState === 'sent' ? 'sent'
        : localDeliveryState ? 'none'
          : message.read ? 'read' : message.delivered ? 'delivered' : 'sent';
  return {
    incomingTail: message.sender === 'relative' && previous?.sender !== 'relative',
    isCallEvent,
    isMissedCall: isCallEvent && message.callStatus === 'missed',
    localDeliveryState,
    receipt,
  };
}

export function getDeliveryIndicatorState(presentation: Pick<MessagePresentation, 'localDeliveryState' | 'receipt'>): DeliveryIndicatorState {
  if (presentation.localDeliveryState) {
    return presentation.localDeliveryState;
  }
  return presentation.receipt;
}

export function getDeliveryIndicatorPresentation(state: DeliveryIndicatorState): DeliveryIndicatorPresentation {
  if (state === 'queued') return { icon: 'clock', iconCount: 1, accent: false };
  if (state === 'sent') return { icon: 'check', iconCount: 1, accent: false };
  if (state === 'delivered') return { icon: 'checkCheck', iconCount: 1, accent: false };
  if (state === 'read') return { icon: 'checkCheck', iconCount: 1, accent: true };
  if (state === 'not_sent') return { icon: 'alert', iconCount: 1, accent: false };
  return { icon: 'none', iconCount: 0, accent: false };
}

export function getConversationDateItems(
  messages: Message[],
  options: ConversationDateGroupingOptions = {},
): ConversationDateItem[] {
  const now = options.now ?? new Date();
  const nowCivilDate = getCivilDateParts(now, options.timeZone);
  const seenDateKeys = new Set<string>();
  const items: ConversationDateItem[] = [];

  for (const message of messages) {
    const messageDate = new Date(message.createdAt);
    const messageCivilDate = getCivilDateParts(messageDate, options.timeZone);
    const dateKey = getCivilDateKey(messageCivilDate);

    if (!seenDateKeys.has(dateKey)) {
      seenDateKeys.add(dateKey);
      items.push({
        itemType: 'dateDivider',
        key: `date-divider-${dateKey}`,
        label: formatConversationDateLabel(messageDate, messageCivilDate, nowCivilDate, options.timeZone),
      });
    }

    items.push({ itemType: 'message', key: `message-${message.id}`, message });
  }

  return items;
}

export function selectTab(_current: TabKey, next: TabKey): TabKey {
  return next;
}

export function getCallLogDisplayModel(entries: CallLogEntry[]): CallLogDisplayModel {
  return entries.length === 0
    ? { empty: true, emptyText: 'Здесь появятся ваши звонки', rows: [] }
    : { empty: false, emptyText: null, rows: entries };
}

export function getCallbackCallMode(callbackType: CallLogCallbackType): 'audio' | 'video' {
  return callbackType === 'video' ? 'video' : 'audio';
}

export function getTotalUnreadCount(chats: Chat[]): number {
  return chats.reduce((total, chat) => total + chat.unread, 0);
}

export function getMissedCallCount(entries: CallLogEntry[]): number {
  return entries.filter(entry => entry.direction === 'missed').length;
}

export function formatLocalCivilTime(value: string, options: Intl.DateTimeFormatOptions = {}): string {
  return new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', ...options }).format(new Date(value));
}

export function formatMessageTime(value: string, options: Intl.DateTimeFormatOptions = {}): string {
  return formatLocalCivilTime(value, options);
}

export function getChatPreview(chat: Chat): string {
  return chat.lastMessage.length > 80 ? `${chat.lastMessage.slice(0, 77)}...` : chat.lastMessage;
}

export function getChatPreviewDisplayModel(chat: Chat): ChatPreviewDisplayModel {
  const draft = chat.composerDraft?.trim() ?? '';
  if (draft.length > 0) {
    const text = draft.length > 80 ? `${draft.slice(0, 77)}...` : draft;
    return {
      accessibilityLabel: `Черновик: ${text}`,
      isDraft: true,
      text,
    };
  }

  const text = getChatPreview(chat);
  return {
    accessibilityLabel: text,
    isDraft: false,
    text,
  };
}

type CivilDateParts = {
  day: number;
  month: number;
  year: number;
};

function getCivilDateParts(date: Date, timeZone?: string): CivilDateParts {
  const parts = new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone,
  }).formatToParts(date);

  return {
    day: Number(parts.find(part => part.type === 'day')?.value),
    month: Number(parts.find(part => part.type === 'month')?.value),
    year: Number(parts.find(part => part.type === 'year')?.value),
  };
}

function getCivilDateKey(date: CivilDateParts): string {
  return `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;
}

function getCivilDateOrdinal(date: CivilDateParts): number {
  return Math.floor(Date.UTC(date.year, date.month - 1, date.day) / 86_400_000);
}

function formatConversationDateLabel(
  date: Date,
  messageDate: CivilDateParts,
  nowDate: CivilDateParts,
  timeZone?: string,
): string {
  const dayDifference = getCivilDateOrdinal(nowDate) - getCivilDateOrdinal(messageDate);
  if (dayDifference === 0) {
    return 'Сегодня';
  }
  if (dayDifference === 1) {
    return 'Вчера';
  }

  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: messageDate.year === nowDate.year ? undefined : 'numeric',
    timeZone,
  }).format(date);
}
