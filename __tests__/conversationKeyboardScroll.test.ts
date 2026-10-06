// eslint-disable-next-line @typescript-eslint/no-var-requires
const appConfig = require('../app.json') as { expo: { android?: { softwareKeyboardLayoutMode?: string } } };

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(), setItem: jest.fn() },
}));
jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }));

import {
  CONVERSATION_KEYBOARD_AVOIDING_PROPS,
  reduceConversationScrollIntent,
  type ConversationScrollIntentState,
} from '../src/app/screens/conversationKeyboard';

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

    expect(result.scrollToLatest).toBe(true);
    expect(result.state).toEqual({
      isAtLatest: true,
      isKeyboardOpen: false,
      latestMessageId: 'm2',
      pendingScrollAfterLayout: false,
    });
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

    expect(result.scrollToLatest).toBe(true);
    expect(result.state).toEqual({
      isAtLatest: true,
      isKeyboardOpen: false,
      latestMessageId: 'm2',
      pendingScrollAfterLayout: false,
    });
  });
});
