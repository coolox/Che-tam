jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(() => Promise.resolve(null)), setItem: jest.fn(() => Promise.resolve()) },
}));
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { addEventListener: jest.fn(() => jest.fn()) },
}));
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));
jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }));
jest.mock('react-native-keyboard-controller', () => ({
  KeyboardAvoidingView: 'KeyboardAvoidingView',
  KeyboardProvider: ({ children }: { children: unknown }) => children,
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({ children }: { children: unknown }) => children,
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const fs = require('fs') as { readFileSync(path: string, encoding: string): string };

import React from 'react';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const TestRenderer = require('react-test-renderer') as {
  act(callback: () => Promise<void> | void): Promise<void>;
  create(element: React.ReactElement): ReactTestRenderer;
};
import { AppState, Text, TextInput } from 'react-native';
import { INITIAL_CHATS, INITIAL_MESSAGES } from '../src/ui/demoData';
import PreviewAppShell, {
  CALL_UNAVAILABLE_TEXT,
  COMPOSER_DRAFT_SAVE_DEBOUNCE_MS,
  getHeaderToFirstContentRowGap,
  getSettingsAvatarModel,
  isFreshComposerDraftLoad,
  resolveCallLogAction,
  resolveFamilyCallAction,
} from '../src/app/PreviewAppShell';
import {
  appendOutgoingMessage,
  clearFamilySelection,
  clearChatSearchQuery,
  clearChatSelection,
  closeChatSearch,
  filterChatsBySearchResult,
  getCallLogDisplayModel,
  getCallbackCallMode,
  getChatPreviewDisplayModel,
  getComposerState,
  getDeliveryIndicatorPresentation,
  getDeliveryIndicatorState,
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
import type { TabKey } from '../src/ui/types';
import type { LocalDataSnapshot } from '../src/messages/localMessageStore';

type ReactTestInstance = {
  findAll(predicate: (node: ReactTestInstance) => boolean): ReactTestInstance[];
  findAllByProps(props: Record<string, unknown>): ReactTestInstance[];
  findAllByType(type: unknown): ReactTestInstance[];
  props: Record<string, any>;
  type: unknown;
};

type ReactTestRenderer = {
  root: ReactTestInstance;
  update(element: React.ReactElement): void;
  unmount(): void;
};

const { act } = TestRenderer;

function collectNodeText(node: ReactTestInstance): string {
  return node.findAllByType(Text).map((text: ReactTestInstance) => text.props.children).flat(Number.POSITIVE_INFINITY).join('');
}

function findPressableByText(root: ReactTestInstance, text: string): ReactTestInstance {
  return root.findAll(node => node.props.accessibilityRole === 'button' && collectNodeText(node).includes(text))[0];
}

function findPressableByLabel(root: ReactTestInstance, accessibilityLabel: string): ReactTestInstance {
  return root.findAllByProps({ accessibilityLabel, accessibilityRole: 'button' })[0];
}

function createReadySnapshot(overrides: Partial<LocalDataSnapshot> = {}): LocalDataSnapshot {
  return {
    status: 'ready',
    chats: INITIAL_CHATS,
    messagesByChat: INITIAL_MESSAGES,
    errorText: null,
    errorDiagnostic: null,
    ...overrides,
  } as LocalDataSnapshot;
}

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

  it('filters existing ordered chat rows by repository search result ids', () => {
    const ordered = getOrderedChats(INITIAL_CHATS);

    expect(filterChatsBySearchResult(ordered, ['sister', 'parents']).map(chat => chat.id)).toEqual(['parents', 'sister']);
    expect(filterChatsBySearchResult(ordered, [])).toEqual([]);
    expect(filterChatsBySearchResult(ordered, null)).toBe(ordered);
  });

  it('wires the Chats header search icon to the active search UI and close controls', () => {
    const source = fs.readFileSync('src/app/PreviewAppShell.tsx', 'utf8');

    expect(source).toContain('onOpenSearch={startChatSearch}');
    expect(source).toContain('onCancelSearch={cancelChatSearch}');
    expect(source).toContain('onClearSearch={clearChatSearch}');
    expect(source).toContain('accessibilityLabel="Открыть поиск"');
    expect(source).toContain('accessibilityLabel="Закрыть поиск"');
    expect(source).toContain('accessibilityLabel="Очистить поиск"');
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

  it('marks chat preview drafts without changing the base message preview', () => {
    const chat = { ...INITIAL_CHATS[0], composerDraft: '  Позвонить вечером  ', lastMessage: 'Последнее сообщение' };

    expect(getChatPreviewDisplayModel(chat)).toEqual({
      accessibilityLabel: 'Черновик: Позвонить вечером',
      isDraft: true,
      text: 'Позвонить вечером',
    });
    expect(getChatPreviewDisplayModel({ ...chat, composerDraft: '' })).toEqual({
      accessibilityLabel: 'Последнее сообщение',
      isDraft: false,
      text: 'Последнее сообщение',
    });
  });

  it('renders chat draft prefix with the theme danger token', () => {
    const previewSource = fs.readFileSync('src/app/PreviewAppShell.tsx', 'utf8');

    expect(previewSource).toContain('getChatPreviewDisplayModel(chat)');
    expect(previewSource).toContain('<Text style={styles.chatDraftPrefix}>Черновик: </Text>');
    expect(previewSource).toContain('chatDraftPrefix: { color: colors.danger');
  });

  it('ignores stale composer draft loads when the selected chat changes quickly', () => {
    expect(isFreshComposerDraftLoad(1, 2, 'parents', 'sister')).toBe(false);
    expect(isFreshComposerDraftLoad(2, 2, 'sister', 'sister')).toBe(true);
    expect(isFreshComposerDraftLoad(2, 3, 'sister', 'parents')).toBe(false);
    expect(isFreshComposerDraftLoad(3, 3, 'parents', 'parents')).toBe(true);
  });

  it('debounces composer draft persistence and keeps typed text ahead of incoming draft snapshots', async () => {
    jest.useFakeTimers();
    let resolveDraft: (value: string | null) => void = () => undefined;
    const saves: { chatId: string; draft: string }[] = [];
    const props = {
      snapshot: createReadySnapshot(),
      onClearComposerDraft: jest.fn(async () => undefined),
      onClearUnread: jest.fn(async () => undefined),
      onDeleteMessageForMe: jest.fn(async () => undefined),
      onReadComposerDraft: jest.fn(() => new Promise<string | null>((resolve) => { resolveDraft = resolve; })),
      onRetry: jest.fn(async () => undefined),
      onRetryMessage: jest.fn(async () => ({ retried: false })),
      onSaveComposerDraft: jest.fn(async (chatId: string, draft: string) => { saves.push({ chatId, draft }); }),
      onSearchChats: jest.fn(async () => []),
      onSendMessage: jest.fn(async () => ({ sent: false, clientMessageId: null })),
    };
    let renderer: ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(React.createElement(PreviewAppShell, props));
    });
    await act(async () => {
      findPressableByText(renderer!.root, 'Посмотреть демо').props.onPress();
    });
    await act(async () => {
      findPressableByText(renderer!.root, INITIAL_CHATS[0].name).props.onPress();
    });

    const input = renderer!.root.findAllByType(TextInput).find(node => node.props.accessibilityLabel === 'Текст сообщения') as ReactTestInstance;
    await act(async () => {
      for (let index = 1; index <= 30; index += 1) {
        (input.props.onChangeText as (value: string) => void)(`Черновик ${index}`);
      }
      renderer!.update(React.createElement(PreviewAppShell, {
        ...props,
        snapshot: createReadySnapshot({ chats: INITIAL_CHATS.map(chat => (chat.id === 'parents' ? { ...chat, composerDraft: 'Старый снимок' } : chat)) }),
      }));
      resolveDraft('Старый черновик');
      await Promise.resolve();
    });

    const updatedInput = renderer!.root.findAllByType(TextInput).find(node => node.props.accessibilityLabel === 'Текст сообщения') as ReactTestInstance;
    expect(updatedInput.props.value).toBe('Черновик 30');
    expect(saves).toHaveLength(0);

    await act(async () => {
      jest.advanceTimersByTime(COMPOSER_DRAFT_SAVE_DEBOUNCE_MS);
      await Promise.resolve();
    });

    expect(saves).toEqual([{ chatId: 'parents', draft: 'Черновик 30' }]);
    await act(async () => {
      renderer!.unmount();
    });
    jest.useRealTimers();
  });

  it('flushes pending composer drafts when leaving a chat and when the app backgrounds', async () => {
    jest.useFakeTimers();
    let appStateListener: ((state: string) => void) | null = null;
    const appStateSpy = jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
      appStateListener = listener as (state: string) => void;
      return { remove: jest.fn() };
    });
    const saves: { chatId: string; draft: string }[] = [];
    const props = {
      snapshot: createReadySnapshot(),
      onClearComposerDraft: jest.fn(async () => undefined),
      onClearUnread: jest.fn(async () => undefined),
      onDeleteMessageForMe: jest.fn(async () => undefined),
      onReadComposerDraft: jest.fn(async () => null),
      onRetry: jest.fn(async () => undefined),
      onRetryMessage: jest.fn(async () => ({ retried: false })),
      onSaveComposerDraft: jest.fn(async (chatId: string, draft: string) => { saves.push({ chatId, draft }); }),
      onSearchChats: jest.fn(async () => []),
      onSendMessage: jest.fn(async () => ({ sent: false, clientMessageId: null })),
    };
    let renderer: ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(React.createElement(PreviewAppShell, props));
    });
    await act(async () => {
      findPressableByText(renderer!.root, 'Посмотреть демо').props.onPress();
    });
    await act(async () => {
      findPressableByText(renderer!.root, INITIAL_CHATS[0].name).props.onPress();
    });
    let input = renderer!.root.findAllByType(TextInput).find(node => node.props.accessibilityLabel === 'Текст сообщения') as ReactTestInstance;

    await act(async () => {
      (input.props.onChangeText as (value: string) => void)('Перед уходом');
      findPressableByLabel(renderer!.root, 'Назад').props.onPress();
      await Promise.resolve();
    });
    expect(saves).toEqual([{ chatId: 'parents', draft: 'Перед уходом' }]);

    await act(async () => {
      findPressableByText(renderer!.root, INITIAL_CHATS[0].name).props.onPress();
    });
    input = renderer!.root.findAllByType(TextInput).find(node => node.props.accessibilityLabel === 'Текст сообщения') as ReactTestInstance;
    await act(async () => {
      (input.props.onChangeText as (value: string) => void)('Перед фоном');
      appStateListener?.('background');
      await Promise.resolve();
    });

    expect(saves).toEqual([
      { chatId: 'parents', draft: 'Перед уходом' },
      { chatId: 'parents', draft: 'Перед фоном' },
    ]);
    await act(async () => {
      renderer!.unmount();
    });
    appStateSpy.mockRestore();
    jest.useRealTimers();
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

  it('uses a single local delivery indicator without deriving delivered/read receipts', () => {
    const queuedMessage = {
      id: 'local-queued',
      chatId: 'parents',
      clientMessageId: 'cm-local-queued',
      sender: 'me' as const,
      text: 'Ждёт',
      createdAt: '2026-09-22T09:12:00.000Z',
      delivered: true,
      read: true,
      deliveryState: 'queued' as const,
      kind: 'text' as const,
    };
    const notSentMessage = { ...queuedMessage, id: 'local-not-sent', clientMessageId: 'cm-local-not-sent', deliveryState: 'not_sent' as const };
    const sentMessage = { ...queuedMessage, id: 'local-sent', clientMessageId: 'cm-local-sent', deliveryState: 'sent' as const };

    expect(getDeliveryIndicatorState(getMessagePresentation([queuedMessage], queuedMessage))).toBe('queued');
    expect(getDeliveryIndicatorState(getMessagePresentation([notSentMessage], notSentMessage))).toBe('not_sent');
    expect(getDeliveryIndicatorState(getMessagePresentation([sentMessage], sentMessage))).toBe('sent');
    expect(getMessagePresentation([sentMessage], sentMessage)).toMatchObject({ localDeliveryState: 'sent', receipt: 'sent' });
  });

  it('maps every delivery indicator state to exactly one existing icon slot', () => {
    expect(getDeliveryIndicatorPresentation('queued')).toEqual({ icon: 'clock', iconCount: 1, accent: false });
    expect(getDeliveryIndicatorPresentation('sent')).toEqual({ icon: 'check', iconCount: 1, accent: false });
    expect(getDeliveryIndicatorPresentation('delivered')).toEqual({ icon: 'checkCheck', iconCount: 1, accent: false });
    expect(getDeliveryIndicatorPresentation('read')).toEqual({ icon: 'checkCheck', iconCount: 1, accent: true });
    expect(getDeliveryIndicatorPresentation('not_sent')).toEqual({ icon: 'alert', iconCount: 1, accent: false });
    expect(getDeliveryIndicatorPresentation('none')).toEqual({ icon: 'none', iconCount: 0, accent: false });
  });

  it('wires Russian accessibility labels directly on local status controls', () => {
    const source = fs.readFileSync('src/app/screens/ConversationScreen.tsx', 'utf8');

    expect(source).toContain('accessibilityLabel="В очереди"');
    expect(source).toContain('accessibilityLabel="Отправлено"');
    expect(source).toContain("accessibilityLabel={state === 'read' ? 'Прочитано' : 'Доставлено'}");
    expect(source).toContain('accessibilityLabel="Не отправлено"');
    expect(source).toContain('accessibilityLabel="Повторить отправку"');
    expect(source).toContain('>Повторить<');
    expect(source).toContain('<DeliveryIndicator message={message} onRetryMessage={onRetryMessage} state={getDeliveryIndicatorState(presentation)} />');
    expect(source).not.toContain('<ReceiptIcon');
    expect(source).not.toContain('<LocalDeliveryControl');
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

  it('resolves Family and Calls actions to the local call screen or visible fallback', () => {
    expect(resolveFamilyCallAction(INITIAL_CHATS, 'Мама и папа', 'audio')).toEqual({ type: 'open', chatId: 'parents', mode: 'audio' });
    expect(resolveFamilyCallAction(INITIAL_CHATS, 'Лейла', 'video')).toEqual({ type: 'open', chatId: 'sister', mode: 'video' });
    expect(resolveFamilyCallAction(INITIAL_CHATS, 'Нет такого', 'audio')).toEqual({ type: 'fallback', text: CALL_UNAVAILABLE_TEXT });

    expect(resolveCallLogAction(INITIAL_CHATS, {
      id: 'call-test',
      chatId: 'parents',
      name: 'Мама и папа',
      initials: 'МП',
      avatarColor: '#116149',
      direction: 'missed',
      occurredAt: '2026-09-22T12:14:00.000Z',
      callbackType: 'video',
    })).toEqual({ type: 'open', chatId: 'parents', mode: 'video' });
    expect(resolveCallLogAction(INITIAL_CHATS, {
      id: 'call-missing',
      chatId: 'missing',
      name: 'Нет чата',
      initials: 'НЧ',
      avatarColor: '#116149',
      direction: 'incoming',
      occurredAt: '2026-09-22T12:14:00.000Z',
      callbackType: 'audio',
    })).toEqual({ type: 'fallback', text: CALL_UNAVAILABLE_TEXT });
  });

  it('keeps the Settings profile avatar visible with existing self initials and color', () => {
    expect(getSettingsAvatarModel()).toEqual({ color: '#116149', initials: 'АМ' });
  });

  it('threads the local test-mode Settings label behind an explicit boolean prop', () => {
    const previewSource = fs.readFileSync('src/app/PreviewAppShell.tsx', 'utf8');
    const appSource = fs.readFileSync('src/app/AppShell.tsx', 'utf8');

    expect(previewSource).toContain('isLocalTestModeEnabled ? <Text accessibilityLabel="Тестовая сборка" style={styles.bodyText}>Тестовая сборка</Text> : null');
    expect(appSource).toContain('isLocalTestModeEnabled={localTestMode.enabled}');
  });

  it('gates local data raw diagnostics behind explicit local test mode on both error surfaces', () => {
    const previewSource = fs.readFileSync('src/app/PreviewAppShell.tsx', 'utf8');
    const conversationSource = fs.readFileSync('src/app/screens/ConversationScreen.tsx', 'utf8');

    expect(previewSource).toContain('errorDiagnostic={dataErrorDiagnostic}');
    expect(previewSource).toContain('enabled={isLocalTestModeEnabled}');
    expect(previewSource).toContain('accessibilityLabel={`Диагностика локальной ошибки: ${diagnostic.name}: ${diagnostic.message}`}');
    expect(conversationSource).toContain('diagnostic={dataErrorDiagnostic} enabled={isLocalTestModeEnabled}');
    expect(conversationSource).toContain('accessibilityLabel={`Диагностика локальной ошибки: ${diagnostic.name}: ${diagnostic.message}`}');
  });

  it('keeps an exact 8dp gap from the header to the first row on every tab', () => {
    const tabs: TabKey[] = ['chats', 'calls', 'family', 'settings'];
    expect(tabs.map(tab => getHeaderToFirstContentRowGap(tab))).toEqual([8, 8, 8, 8]);
  });

  it('keeps light and dark theme token keys aligned', () => {
    expect(Object.keys(darkColors).sort()).toEqual(Object.keys(lightColors).sort());
  });
});
