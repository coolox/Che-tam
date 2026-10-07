export const SWIPE_REPLY_THRESHOLD = 72;
export const SWIPE_REPLY_MAX_OFFSET = 88;
const HORIZONTAL_CAPTURE_DISTANCE = 10;
const HORIZONTAL_DOMINANCE = 1.4;
const VERTICAL_CANCEL_DISTANCE = 18;

export type MessageSwipeReplyState = {
  hapticFired: boolean;
  replyReady: boolean;
  translateX: number;
  verticalCancelled: boolean;
};

export type MessageSwipeReplyEvent =
  | { type: 'move'; dx: number; dy: number }
  | { type: 'release' }
  | { type: 'cancel' };

export type MessageSwipeReplyResult = {
  shouldReply: boolean;
  shouldTriggerHaptic: boolean;
  state: MessageSwipeReplyState;
};

export const initialMessageSwipeReplyState = (): MessageSwipeReplyState => ({
  hapticFired: false,
  replyReady: false,
  translateX: 0,
  verticalCancelled: false,
});

export function shouldCaptureSwipeReplyGesture(dx: number, dy: number): boolean {
  if (dx <= HORIZONTAL_CAPTURE_DISTANCE) return false;
  return dx > Math.abs(dy) * HORIZONTAL_DOMINANCE;
}

export function reduceMessageSwipeReply(
  state: MessageSwipeReplyState,
  event: MessageSwipeReplyEvent,
): MessageSwipeReplyResult {
  if (event.type === 'cancel') {
    return { shouldReply: false, shouldTriggerHaptic: false, state: initialMessageSwipeReplyState() };
  }

  if (event.type === 'release') {
    const shouldReply = state.replyReady && !state.verticalCancelled;
    return { shouldReply, shouldTriggerHaptic: false, state: initialMessageSwipeReplyState() };
  }

  if (state.verticalCancelled) {
    return { shouldReply: false, shouldTriggerHaptic: false, state: { ...state, translateX: 0, replyReady: false } };
  }

  const verticalCancelled = Math.abs(event.dy) > VERTICAL_CANCEL_DISTANCE && Math.abs(event.dy) > Math.max(event.dx, 1);
  if (verticalCancelled || event.dx <= 0) {
    return {
      shouldReply: false,
      shouldTriggerHaptic: false,
      state: { ...state, replyReady: false, translateX: 0, verticalCancelled },
    };
  }

  const translateX = Math.min(event.dx, SWIPE_REPLY_MAX_OFFSET);
  const replyReady = event.dx >= SWIPE_REPLY_THRESHOLD;
  const shouldTriggerHaptic = replyReady && !state.hapticFired;

  return {
    shouldReply: false,
    shouldTriggerHaptic,
    state: {
      hapticFired: state.hapticFired || shouldTriggerHaptic,
      replyReady,
      translateX,
      verticalCancelled: false,
    },
  };
}
