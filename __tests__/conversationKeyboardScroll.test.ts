// eslint-disable-next-line @typescript-eslint/no-var-requires
const appConfig = require('../app.json') as { expo: { android?: { softwareKeyboardLayoutMode?: string } } };

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(), setItem: jest.fn() },
}));
jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }));
jest.mock('react-native-keyboard-controller', () => ({
  KeyboardAvoidingView: 'KeyboardAvoidingView',
}));

import {
  reduceConversationScrollIntent,
  type ConversationScrollIntentState,
} from '../src/app/screens/ConversationScreen';

describe('conversation keyboard and latest-message scroll intent', () => {
  const atLatest: ConversationScrollIntentState = { isAtLatest: true, latestMessageId: 'm1' };

  it('selects Android resize keyboard layout mode', () => {
    expect(appConfig.expo.android?.softwareKeyboardLayoutMode).toBe('resize');
  });

  it('requests latest scroll for outgoing updates and keyboard open at the bottom', () => {
    expect(reduceConversationScrollIntent(atLatest, { type: 'keyboardOpened' }).scrollToLatest).toBe(true);

    const result = reduceConversationScrollIntent(atLatest, {
      type: 'messagesChanged',
      latestMessageId: 'm2',
      latestMessageSender: 'me',
    });

    expect(result.scrollToLatest).toBe(true);
    expect(result.state).toEqual({ isAtLatest: true, latestMessageId: 'm2' });
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
    expect(result.state).toEqual({ isAtLatest: false, latestMessageId: 'm2' });
  });

  it('lets outgoing updates override a manual-scroll hold', () => {
    const scrolledAway = reduceConversationScrollIntent(atLatest, { type: 'scrolled', offsetY: 120 }).state;

    const result = reduceConversationScrollIntent(scrolledAway, {
      type: 'messagesChanged',
      latestMessageId: 'm2',
      latestMessageSender: 'me',
    });

    expect(result.scrollToLatest).toBe(true);
    expect(result.state).toEqual({ isAtLatest: true, latestMessageId: 'm2' });
  });
});
