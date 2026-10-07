// eslint-disable-next-line @typescript-eslint/no-var-requires
const appConfig = require('../app.json') as { expo: { android?: { softwareKeyboardLayoutMode?: string } } };

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(() => Promise.resolve(null)), setItem: jest.fn(() => Promise.resolve()) },
}));
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { addEventListener: jest.fn(() => jest.fn()) },
}));
jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }));
jest.mock('react-native-keyboard-controller', () => ({
  KeyboardAvoidingView: 'KeyboardAvoidingView',
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}));
const mockScrollToOffset = jest.fn();
jest.mock('react-native', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const React = require('react');
  const actual = jest.requireActual('react-native');
  const MockFlatList = React.forwardRef((props: Record<string, unknown>, ref: React.Ref<unknown>) => {
    React.useImperativeHandle(ref, () => ({ scrollToOffset: mockScrollToOffset }));
    return React.createElement(actual.View, { ...props, testID: 'conversation-flat-list' });
  });
  MockFlatList.displayName = 'FlatList';
  return new Proxy(actual, {
    get(target, property) {
      if (property === 'FlatList') return MockFlatList;
      return target[property];
    },
  });
});

import React from 'react';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const TestRenderer = require('react-test-renderer') as {
  act(callback: () => Promise<void> | void): Promise<void>;
  create(element: React.ReactElement): ReactTestRenderer;
};
import { FlatList } from 'react-native';
import { ConversationScreen } from '../src/app/screens/ConversationScreen';
import {
  CONVERSATION_KEYBOARD_AVOIDING_PROPS,
  LATEST_SCROLL_OFFSET_THRESHOLD,
  reduceConversationScrollIntent,
  type ConversationScrollIntentState,
} from '../src/app/screens/conversationKeyboard';
import { ThemeProvider } from '../src/ui/theme';
import type { Chat, Message } from '../src/ui/types';

type ReactTestInstance = {
  findAllByType(type: unknown): ReactTestInstance[];
  props: Record<string, unknown>;
};

type ReactTestRenderer = {
  root: ReactTestInstance;
  update(element: React.ReactElement): void;
};

const { act } = TestRenderer;

describe('conversation keyboard and latest-message scroll intent', () => {
  const atLatest: ConversationScrollIntentState = {
    isAtLatest: true,
    isKeyboardOpen: false,
    latestMessageId: 'm1',
    pendingScrollAfterLayout: false,
  };

  it('selects Android resize keyboard layout mode', () => {
    expect(appConfig.expo.android?.softwareKeyboardLayoutMode).toBe('resize');
  });

  it('configures Android keyboard avoidance with explicit padding behavior', () => {
    expect(CONVERSATION_KEYBOARD_AVOIDING_PROPS).toMatchObject({
      automaticOffset: true,
      behavior: 'padding',
    });
  });

  it('requests latest scroll for outgoing updates and waits for keyboard-open layout at the bottom', () => {
    const keyboardOpened = reduceConversationScrollIntent(atLatest, { type: 'keyboardOpened' });
    expect(keyboardOpened.scrollToLatest).toBe(false);
    expect(keyboardOpened.state).toEqual({
      isAtLatest: true,
      isKeyboardOpen: true,
      latestMessageId: 'm1',
      pendingScrollAfterLayout: true,
    });
    expect(reduceConversationScrollIntent(keyboardOpened.state, { type: 'layoutSettled' })).toEqual({
      state: {
        isAtLatest: true,
        isKeyboardOpen: true,
        latestMessageId: 'm1',
        pendingScrollAfterLayout: false,
      },
      scrollToLatest: true,
    });

    const result = reduceConversationScrollIntent(atLatest, {
      type: 'messagesChanged',
      latestMessageId: 'm2',
      latestMessageSender: 'me',
    });

    expect(result.scrollToLatest).toBe(false);
    expect(result.state).toEqual({
      isAtLatest: true,
      isKeyboardOpen: false,
      latestMessageId: 'm2',
      pendingScrollAfterLayout: true,
    });
    expect(reduceConversationScrollIntent(result.state, { type: 'layoutSettled' }).scrollToLatest).toBe(true);
  });

  it('defers outgoing message scroll until layout settles while the keyboard is open', () => {
    const keyboardOpen = reduceConversationScrollIntent(atLatest, { type: 'keyboardOpened' }).state;
    const afterKeyboardLayout = reduceConversationScrollIntent(keyboardOpen, { type: 'layoutSettled' }).state;

    const ownMessage = reduceConversationScrollIntent(afterKeyboardLayout, {
      type: 'messagesChanged',
      latestMessageId: 'm2',
      latestMessageSender: 'me',
    });

    expect(ownMessage.scrollToLatest).toBe(false);
    expect(ownMessage.state).toEqual({
      isAtLatest: true,
      isKeyboardOpen: true,
      latestMessageId: 'm2',
      pendingScrollAfterLayout: true,
    });
    expect(reduceConversationScrollIntent(ownMessage.state, { type: 'layoutSettled' }).scrollToLatest).toBe(true);
  });

  it('preserves manual reading position for incoming updates away from latest', () => {
    const scrolledAway = reduceConversationScrollIntent(atLatest, { type: 'scrolled', offsetY: 120 }).state;

    const result = reduceConversationScrollIntent(scrolledAway, {
      type: 'messagesChanged',
      latestMessageId: 'm2',
      latestMessageSender: 'relative',
    });

    expect(scrolledAway.isAtLatest).toBe(false);
    expect(result.scrollToLatest).toBe(false);
    expect(result.state).toEqual({
      isAtLatest: false,
      isKeyboardOpen: false,
      latestMessageId: 'm2',
      pendingScrollAfterLayout: false,
    });
  });

  it('lets outgoing updates override a manual-scroll hold', () => {
    const scrolledAway = reduceConversationScrollIntent(atLatest, { type: 'scrolled', offsetY: 120 }).state;

    const result = reduceConversationScrollIntent(scrolledAway, {
      type: 'messagesChanged',
      latestMessageId: 'm2',
      latestMessageSender: 'me',
    });

    expect(result.scrollToLatest).toBe(false);
    expect(result.state).toEqual({
      isAtLatest: true,
      isKeyboardOpen: false,
      latestMessageId: 'm2',
      pendingScrollAfterLayout: true,
    });
  });

  it('passes inverted-list autoscroll props and scrolls own sends to offset zero after layout', async () => {
    const chat: Chat = {
      id: 'parents',
      name: 'Мама и папа',
      initials: 'МП',
      avatarColor: '#116149',
      lastMessage: 'Первое',
      pinned: false,
      time: '12:00',
      unread: 0,
      trafficLabel: 'Локальные сообщения',
    };
    const firstMessage: Message = {
      id: 'm1',
      chatId: 'parents',
      sender: 'relative',
      text: 'Первое',
      createdAt: '2026-10-07T10:00:00.000Z',
      delivered: true,
      kind: 'text',
    };
    const ownMessage: Message = {
      id: 'm2',
      chatId: 'parents',
      sender: 'me',
      text: 'Ответ',
      createdAt: '2026-10-07T10:01:00.000Z',
      delivered: false,
      deliveryState: 'queued',
      kind: 'text',
    };
    const props = {
      chat,
      composer: '',
      dataErrorDiagnostic: null,
      dataErrorText: null,
      dataStatus: 'ready' as const,
      isLocalTestModeEnabled: false,
      messages: [firstMessage],
      onBack: jest.fn(),
      onComposer: jest.fn(),
      onDeleteMessageForMe: jest.fn(),
      onRetryLocalData: jest.fn(),
      onRetryMessage: jest.fn(),
      onSendMessage: jest.fn(),
      onStartCall: jest.fn(),
    };
    let renderer: ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(React.createElement(ThemeProvider, null, React.createElement(ConversationScreen, props)));
    });
    const list = renderer!.root.findAllByType(FlatList)[0];
    expect(list.props.inverted).toBe(true);
    expect(list.props.maintainVisibleContentPosition).toEqual({
      autoscrollToTopThreshold: LATEST_SCROLL_OFFSET_THRESHOLD,
      minIndexForVisible: 0,
    });

    mockScrollToOffset.mockClear();
    await act(async () => {
      renderer!.update(React.createElement(ThemeProvider, null, React.createElement(ConversationScreen, {
        ...props,
        messages: [firstMessage, ownMessage],
      })));
    });
    expect(mockScrollToOffset).not.toHaveBeenCalled();

    await act(async () => {
      (list.props.onContentSizeChange as () => void)();
    });
    expect(mockScrollToOffset).toHaveBeenCalledWith({ animated: true, offset: 0 });
  });
});
