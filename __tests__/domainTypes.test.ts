import {
  getConnectionStateLabel,
  hasStableMessageIdentifiers,
  isOutboxItemState,
  isOutboxStatus,
} from '../src/domain/selectors';
import type { ConnectionState, Message, OutboxItemState } from '../src/domain/types';

describe('domain types and pure selectors', () => {
  const message: Pick<Message, 'id' | 'clientMessageId'> = {
    id: 'server-message-42',
    clientMessageId: 'client-message-42',
  };

  it('requires non-empty stable server and client message identifiers', () => {
    expect(hasStableMessageIdentifiers(message)).toBe(true);
    expect(hasStableMessageIdentifiers({ ...message, id: '   ' })).toBe(false);
    expect(hasStableMessageIdentifiers({ ...message, clientMessageId: '' })).toBe(false);
  });

  it('accepts only the defined local outbox states', () => {
    expect(['queued', 'sending', 'retrying', 'failed'].every(isOutboxStatus)).toBe(true);
    expect(isOutboxStatus('sent')).toBe(false);
    expect(isOutboxStatus('delivered')).toBe(false);
  });

  it('accepts valid outbox item states', () => {
    const states: OutboxItemState[] = [
      { status: 'queued', attemptCount: 0, nextAttemptAt: null },
      { status: 'sending', attemptCount: 0, nextAttemptAt: null },
      { status: 'failed', attemptCount: 2, nextAttemptAt: null },
      { status: 'retrying', attemptCount: 1, nextAttemptAt: '2026-10-03T12:00:00.000Z' },
    ];

    expect(states.every(isOutboxItemState)).toBe(true);
  });

  it('rejects invalid outbox item states', () => {
    expect(isOutboxItemState({ status: 'retrying', attemptCount: 1, nextAttemptAt: null })).toBe(false);
    expect(isOutboxItemState({ status: 'retrying', attemptCount: 1, nextAttemptAt: '   ' })).toBe(false);
    expect(isOutboxItemState({ status: 'retrying', attemptCount: 1, nextAttemptAt: 'not-a-timestamp' })).toBe(false);
    expect(isOutboxItemState({ status: 'retrying', attemptCount: 0, nextAttemptAt: '2026-10-03T12:00:00.000Z' })).toBe(false);
    expect(isOutboxItemState({ status: 'queued', attemptCount: -1, nextAttemptAt: null })).toBe(false);
    expect(isOutboxItemState({ status: 'failed', attemptCount: 1.5, nextAttemptAt: null })).toBe(false);
  });

  it('maps every connection-state variant predictably', () => {
    const states: ConnectionState[] = [
      { kind: 'offline' },
      { kind: 'connecting' },
      { kind: 'online' },
      { kind: 'degraded', reason: 'endpoint' },
      { kind: 'retrying', attempt: 2, nextRetryAt: '2026-10-03T12:00:00.000Z' },
    ];

    expect(states.map(getConnectionStateLabel)).toEqual([
      'Нет сети',
      'Подключаемся',
      'На связи',
      'Связь нестабильна',
      'Повторяем подключение',
    ]);
  });
});