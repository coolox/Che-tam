import type { Message } from '../../ui/types';

const LATEST_SCROLL_OFFSET_THRESHOLD = 48;

export const CONVERSATION_KEYBOARD_AVOIDING_PROPS = {
  automaticOffset: true,
  behavior: 'padding',
} as const;

export type ConversationScrollIntentState = {
  isAtLatest: boolean;
  latestMessageId: string | null;
};

export type ConversationScrollIntentEvent =
  | { type: 'enter' }
  | { type: 'keyboardOpened' }
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
    return { state, scrollToLatest: state.isAtLatest };
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
    return { state: { ...nextState, isAtLatest: true }, scrollToLatest: true };
  }

  return { state: nextState, scrollToLatest: state.isAtLatest };
}
