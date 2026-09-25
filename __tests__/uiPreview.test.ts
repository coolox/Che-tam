import { INITIAL_CHATS, INITIAL_MESSAGES } from '../src/ui/demoData';
import {
  appendOutgoingMessage,
  clearFamilySelection,
  clearChatSearchQuery,
  clearChatSelection,
  closeChatSearch,
  getCallLogDisplayModel,
  getCallbackCallMode,
  getComposerState,
  getMessagePresentation,
  getMissedCallCount,
  getOrderedChats,
  getTotalUnreadCount,
  openChatSearch,
  searchChats,
  selectTab,
  startFamilySelection,
  startChatSelection,
  toggleFamilySelection,
  toggleChatSelection,
  togglePinnedChat,
  updateChatSearchQuery,
} from '../src/ui/state';
import { darkColors, lightColors } from '../src/ui/tokens';

describe('UI Preview local behavior', () => {
  it('filters chats by family name, last message or local message text', () => {
    expect(searchChats(INITIAL_CHATS, 'бабушка').map(chat => chat.id)).toEqual(['grandma']);
    expect(searchChats(INITIAL_CHATS, 'домашний узел').map(chat => chat.id)).toEqual(['brother']);
    expect(searchChats(INITIAL_CHATS, 'новый рисунок', INITIAL_MESSAGES).map(chat => chat.id)).toEqual(['parents']);
    expect(searchChats(INITIAL_CHATS, 'нет такого').map(chat => chat.id)).toEqual([]);
  });

  it('keeps chat search mode and query transitions in memory only', () => {
    const opened = openChatSearch({ active: false, query: '' });
    expect(opened).toEqual({ active: true, query: '' });

    const typed = updateChatSearchQuery(opened, 'рисунок');
    expect(typed).toEqual({ active: true, query: 'рисунок' });

    expect(clearChatSearchQuery(typed)).toEqual({ active: true, query: '' });
    expect(closeChatSearch()).toEqual({ active: false, query: '' });
  });

  it('toggles pinned chats and orders pinned items first', () => {
    const updated = togglePinnedChat(INITIAL_CHATS, 'sister');
    expect(updated.find(chat => chat.id === 'sister')?.pinned).toBe(true);
    expect(getOrderedChats(updated).slice(0, 3).map(chat => chat.id)).toEqual(['parents', 'sister', 'family']);
  });

  it('handles chat list multi-select transitions locally', () => {
    const started = startChatSelection('parents');
    expect(started).toEqual({ active: true, selectedIds: ['parents'] });

    const withSecond = toggleChatSelection(started.selectedIds, 'sister');
    expect(withSecond).toEqual({ active: true, selectedIds: ['parents', 'sister'] });

    const withoutFirst = toggleChatSelection(withSecond.selectedIds, 'parents');
    expect(withoutFirst).toEqual({ active: true, selectedIds: ['sister'] });

    const exited = toggleChatSelection(withoutFirst.selectedIds, 'sister');
    expect(exited).toEqual({ active: false, selectedIds: [] });
  });

  it('clears chat selection for Back and ArrowLeft cancellation', () => {
    expect(clearChatSelection()).toEqual({ active: false, selectedIds: [] });
  });

  it('derives total unread chat count from demo chats', () => {
    expect(getTotalUnreadCount(INITIAL_CHATS)).toBe(7);
  });

  it('derives missed calls count from demo call log', () => {
    expect(getMissedCallCount([
      {
        id: 'call-test',
        chatId: 'parents',
        name: 'Мама и папа',
        initials: 'МП',
        avatarColor: '#116149',
        direction: 'missed',
        occurredAt: '2026-09-22T12:14:00.000Z',
        callbackType: 'video',
      },
      {
        id: 'call-test-2',
        chatId: 'sister',
        name: 'Лейла',
        initials: 'Л',
        avatarColor: '#7c4f2c',
        direction: 'incoming',
        occurredAt: '2026-09-22T10:14:00.000Z',
        callbackType: 'audio',
      },
    ])).toBe(1);
  });

  it('handles family list multi-select transitions locally', () => {
    const started = startFamilySelection('Айгуль М.');
    expect(started).toEqual({ active: true, selectedIds: ['Айгуль М.'] });

    const withSecond = toggleFamilySelection(started.selectedIds, 'Лейла');
    expect(withSecond).toEqual({ active: true, selectedIds: ['Айгуль М.', 'Лейла'] });

    const withoutFirst = toggleFamilySelection(withSecond.selectedIds, 'Айгуль М.');
    expect(withoutFirst).toEqual({ active: true, selectedIds: ['Лейла'] });

    const exited = toggleFamilySelection(withoutFirst.selectedIds, 'Лейла');
    expect(exited).toEqual({ active: false, selectedIds: [] });
    expect(clearFamilySelection()).toEqual({ active: false, selectedIds: [] });
  });

  it('adds an outgoing composer message to local state', () => {
    const messages = INITIAL_MESSAGES.parents;
    const result = appendOutgoingMessage(messages, '  Будем на связи  ', new Date('2026-09-22T10:00:00.000Z'));
    expect(result.added).toBe(true);
    expect(result.messages).toHaveLength(messages.length + 1);
    expect(result.messages.at(-1)).toMatchObject({ sender: 'me', text: 'Будем на связи', delivered: true });
  });

  it('keeps empty composer drafts out of state', () => {
    const messages = INITIAL_MESSAGES.parents;
    const result = appendOutgoingMessage(messages, '   ');
    expect(result.added).toBe(false);
    expect(result.messages).toBe(messages);
  });

  it('derives composer action and camera visibility from trimmed text', () => {
    expect(getComposerState('   ')).toEqual({ action: 'mic', showCamera: true, trimmedText: '' });
    expect(getComposerState('  Привет  ')).toEqual({ action: 'send', showCamera: false, trimmedText: 'Привет' });
  });

  it('derives receipt, incoming-tail and call-event presentation state', () => {
    const messages = INITIAL_MESSAGES.parents;
    expect(getMessagePresentation(messages, messages[0])).toMatchObject({ incomingTail: true, receipt: 'none' });
    expect(getMessagePresentation(messages, messages[1])).toMatchObject({ receipt: 'read' });
    expect(getMessagePresentation(messages, messages[2])).toMatchObject({ isCallEvent: true, isMissedCall: false });
    expect(getMessagePresentation(messages, messages[3])).toMatchObject({ isCallEvent: true, isMissedCall: true });
  });

  it('derives sent and delivered receipt presentation states for outgoing messages', () => {
    const sentMessage = {
      id: 'receipt-sent',
      chatId: 'parents',
      sender: 'me' as const,
      text: 'Ждёт отправки',
      createdAt: '2026-09-22T09:12:00.000Z',
      delivered: false,
    };
    const deliveredMessage = {
      id: 'receipt-delivered',
      chatId: 'parents',
      sender: 'me' as const,
      text: 'Доставлено',
      createdAt: '2026-09-22T09:13:00.000Z',
      delivered: true,
      read: false,
    };
    const messages = [sentMessage, deliveredMessage];

    expect(getMessagePresentation(messages, sentMessage)).toMatchObject({ receipt: 'sent' });
    expect(getMessagePresentation(messages, deliveredMessage)).toMatchObject({ receipt: 'delivered' });
  });

  it('selects bottom tab state locally', () => {
    expect(selectTab('chats', 'settings')).toBe('settings');
    expect(selectTab('settings', 'family')).toBe('family');
  });

  it('derives empty and non-empty call log display state', () => {
    expect(getCallLogDisplayModel([])).toEqual({ empty: true, emptyText: 'Здесь появятся ваши звонки', rows: [] });
    const rows = [
      {
        id: 'call-test',
        chatId: 'parents',
        name: 'Мама и папа',
        initials: 'МП',
        avatarColor: '#116149',
        direction: 'missed' as const,
        occurredAt: '2026-09-22T12:14:00.000Z',
        callbackType: 'video' as const,
      },
    ];

    expect(getCallLogDisplayModel(rows)).toEqual({ empty: false, emptyText: null, rows });
  });

  it('selects callback call mode from call log action type', () => {
    expect(getCallbackCallMode('audio')).toBe('audio');
    expect(getCallbackCallMode('video')).toBe('video');
  });

  it('keeps light and dark theme token keys aligned', () => {
    expect(Object.keys(darkColors).sort()).toEqual(Object.keys(lightColors).sort());
  });
});
