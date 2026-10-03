import {
  connectionReducer,
  getConnectionPresentation,
  initialConnectionStatus,
  type ConnectionStatus,
} from '../src/transport/connectionState';

describe('connection state model', () => {
  it('has deterministic transitions for every connection event', () => {
    expect(initialConnectionStatus).toBe('connecting');
    expect(connectionReducer(initialConnectionStatus, { type: 'networkObserved', available: false })).toBe('offline');
    expect(connectionReducer('offline', { type: 'networkRestored' })).toBe('connecting');
    expect(connectionReducer('connecting', { type: 'connectionStarted' })).toBe('connecting');
    expect(connectionReducer('connecting', { type: 'connectionSucceeded' })).toBe('online');
    expect(connectionReducer('online', { type: 'recoverableConnectionFailure' })).toBe('degraded');
    expect(connectionReducer('degraded', { type: 'retryScheduled' })).toBe('retrying');
    expect(connectionReducer('retrying', { type: 'retryStarted' })).toBe('connecting');
    expect(connectionReducer('online', { type: 'networkLost' })).toBe('offline');
    expect(connectionReducer('retrying', { type: 'networkObserved', available: true })).toBe('connecting');
  });

  it('keeps offline dominant until network restoration', () => {
    const offline = connectionReducer('connecting', { type: 'networkLost' });

    expect(connectionReducer(offline, { type: 'connectionStarted' })).toBe('offline');
    expect(connectionReducer(offline, { type: 'connectionSucceeded' })).toBe('offline');
    expect(connectionReducer(offline, { type: 'recoverableConnectionFailure' })).toBe('offline');
    expect(connectionReducer(offline, { type: 'retryScheduled' })).toBe('offline');
    expect(connectionReducer(offline, { type: 'retryStarted' })).toBe('offline');
    expect(connectionReducer(offline, { type: 'networkRestored' })).toBe('connecting');
  });

  it('returns the exact stable Russian presentation for every status', () => {
    const expected: Record<ConnectionStatus, { text: string; accessibilityLabel: string }> = {
      offline: { text: 'Нет сети', accessibilityLabel: 'Статус связи: нет сети' },
      connecting: { text: 'Восстанавливаем связь', accessibilityLabel: 'Статус связи: восстанавливаем связь' },
      online: { text: 'На связи', accessibilityLabel: 'Статус связи: на связи' },
      degraded: { text: 'Связь нестабильна', accessibilityLabel: 'Статус связи: связь нестабильна' },
      retrying: { text: 'Пробуем восстановить связь', accessibilityLabel: 'Статус связи: пробуем восстановить связь' },
    };

    for (const status of Object.keys(expected) as ConnectionStatus[]) {
      expect(getConnectionPresentation(status)).toEqual({ status, ...expected[status] });
    }
  });
});
