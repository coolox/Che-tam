import type { ConnectionState, Message, OutboxItemState, OutboxStatus } from './types';

const outboxStatuses: readonly OutboxStatus[] = ['queued', 'sending', 'retrying', 'failed'];

export function hasStableMessageIdentifiers(message: Pick<Message, 'id' | 'clientMessageId'>): boolean {
  return message.id.trim().length > 0 && message.clientMessageId.trim().length > 0;
}

export function isOutboxStatus(value: string): value is OutboxStatus {
  return outboxStatuses.includes(value as OutboxStatus);
}

function isValidIsoTimestamp(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.exec(value);

  if (match === null || !Number.isFinite(Date.parse(value))) {
    return false;
  }

  const [, year, month, day] = match;
  const daysInMonth = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate();
  return Number(day) <= daysInMonth;
}

/** Validates the state fields of an OutboxItem without transport or storage dependencies. */
export function isOutboxItemState(state: OutboxItemState): boolean {
  if (!Number.isInteger(state.attemptCount) || state.attemptCount < 0) {
    return false;
  }

  if (state.status !== 'retrying') {
    return true;
  }

  return (
    state.attemptCount >= 1 &&
    state.nextAttemptAt !== null &&
    state.nextAttemptAt.trim().length > 0 &&
    isValidIsoTimestamp(state.nextAttemptAt)
  );
}

export function getConnectionStateLabel(state: ConnectionState): string {
  switch (state.kind) {
    case 'offline':
      return 'Нет сети';
    case 'connecting':
      return 'Подключаемся';
    case 'online':
      return 'На связи';
    case 'degraded':
      return 'Связь нестабильна';
    case 'retrying':
      return 'Повторяем подключение';
    default: {
      const exhaustive: never = state;
      return exhaustive;
    }
  }
}