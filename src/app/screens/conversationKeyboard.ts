import type { Message } from '../../ui/types';

const LATEST_SCROLL_OFFSET_THRESHOLD = 48;

export const CONVERSATION_KEYBOARD_AVOIDING_PROPS = {
  automaticOffset: true,
  behavior: 'padding',
} as const;

export type ConversationScrollIntentState = {
  isAtLatest: boolean;
  isKeyboardOpen: boolean;
  latestMessageId: string | null;
  pendingScrollAfterLayout: boolean;
};

export type ConversationScrollIntentEvent =
  | { type: 'enter' }
  | { type: 'keyboardClosed' }
  | { type: 'keyboardOpened' }
  | { type: 'layoutSettled' }
  | { type: 'messagesChanged'; latestMessageId: string | null; latestMessageSender: Message['sender'] | null }
  | { type: 'scrolled'; offsetY: number };

export function reduceConversationScrollIntent(
  state: ConversationScrollIntentState,
  event: ConversationScrollIntentEvent,
): { state: ConversationScrollIntentState; scrollToLatest: boolean } {
  if (event.type === 'enter') {
    return { state, scrollToLatest: true };
  }

  if (event.type === 'keyboardOpened') {
    return {
      state: { ...state, isKeyboardOpen: true, pendingScrollAfterLayout: state.isAtLatest },
      scrollToLatest: false,
    };
  }

  if (event.type === 'keyboardClosed') {
    return { state: { ...state, isKeyboardOpen: false, pendingScrollAfterLayout: false }, scrollToLatest: false };
  }

  if (event.type === 'layoutSettled') {
    return {
      state: { ...state, pendingScrollAfterLayout: false },
      scrollToLatest: state.pendingScrollAfterLayout,
    };
  }

  if (event.type === 'scrolled') {
    return {
      state: { ...state, isAtLatest: event.offsetY <= LATEST_SCROLL_OFFSET_THRESHOLD },
      scrollToLatest: false,
    };
  }

  if (event.latestMessageId === state.latestMessageId) {
    return { state, scrollToLatest: false };
  }

  const nextState = { ...state, latestMessageId: event.latestMessageId };
  if (event.latestMessageSender === 'me') {
    return {
      state: { ...nextState, isAtLatest: true, pendingScrollAfterLayout: state.isKeyboardOpen },
      scrollToLatest: !state.isKeyboardOpen,
    };
  }

  return { state: nextState, scrollToLatest: state.isAtLatest };
}
