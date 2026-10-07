import {
  SWIPE_REPLY_THRESHOLD,
  initialMessageSwipeReplyState,
  reduceMessageSwipeReply,
  shouldCaptureSwipeReplyGesture,
} from '../src/app/screens/messageSwipeReply';

describe('message swipe reply gesture', () => {
  it('captures only deliberate right swipes', () => {
    expect(shouldCaptureSwipeReplyGesture(14, 2)).toBe(true);
    expect(shouldCaptureSwipeReplyGesture(7, 1)).toBe(false);
    expect(shouldCaptureSwipeReplyGesture(18, 20)).toBe(false);
  });

  it('replies after the threshold and triggers haptic once in a gesture', () => {
    let state = initialMessageSwipeReplyState();

    const first = reduceMessageSwipeReply(state, { type: 'move', dx: SWIPE_REPLY_THRESHOLD, dy: 3 });
    expect(first.shouldTriggerHaptic).toBe(true);
    expect(first.state.replyReady).toBe(true);
    state = first.state;

    const second = reduceMessageSwipeReply(state, { type: 'move', dx: SWIPE_REPLY_THRESHOLD + 18, dy: 4 });
    expect(second.shouldTriggerHaptic).toBe(false);
    state = second.state;

    const released = reduceMessageSwipeReply(state, { type: 'release' });
    expect(released.shouldReply).toBe(true);
    expect(released.state).toEqual(initialMessageSwipeReplyState());
  });

  it('does not reply or haptic for short swipes', () => {
    const moved = reduceMessageSwipeReply(initialMessageSwipeReplyState(), { type: 'move', dx: SWIPE_REPLY_THRESHOLD - 1, dy: 0 });
    expect(moved.shouldTriggerHaptic).toBe(false);

    const released = reduceMessageSwipeReply(moved.state, { type: 'release' });
    expect(released.shouldReply).toBe(false);
  });

  it('cancels vertical movement and explicit cancellations', () => {
    const vertical = reduceMessageSwipeReply(initialMessageSwipeReplyState(), { type: 'move', dx: 22, dy: 36 });
    expect(vertical.state.verticalCancelled).toBe(true);
    expect(vertical.shouldTriggerHaptic).toBe(false);

    const released = reduceMessageSwipeReply(vertical.state, { type: 'release' });
    expect(released.shouldReply).toBe(false);

    const ready = reduceMessageSwipeReply(initialMessageSwipeReplyState(), { type: 'move', dx: SWIPE_REPLY_THRESHOLD + 2, dy: 1 });
    const cancelled = reduceMessageSwipeReply(ready.state, { type: 'cancel' });
    expect(cancelled.shouldReply).toBe(false);
    expect(cancelled.state).toEqual(initialMessageSwipeReplyState());
  });
});
