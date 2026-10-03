export type ConnectionStatus = 'offline' | 'connecting' | 'online' | 'degraded' | 'retrying';

export type ConnectionEvent =
  | { type: 'networkObserved'; available: boolean }
  | { type: 'networkLost' }
  | { type: 'networkRestored' }
  | { type: 'connectionStarted' }
  | { type: 'connectionSucceeded' }
  | { type: 'recoverableConnectionFailure' }
  | { type: 'retryScheduled' }
  | { type: 'retryStarted' };

export const initialConnectionStatus: ConnectionStatus = 'connecting';

export type ConnectionPresentation = {
  status: ConnectionStatus;
  text: string;
  accessibilityLabel: string;
};

const presentationByStatus: Record<ConnectionStatus, Omit<ConnectionPresentation, 'status'>> = {
  offline: { text: 'Нет сети', accessibilityLabel: 'Статус связи: нет сети' },
  connecting: { text: 'Восстанавливаем связь', accessibilityLabel: 'Статус связи: восстанавливаем связь' },
  online: { text: 'На связи', accessibilityLabel: 'Статус связи: на связи' },
  degraded: { text: 'Связь нестабильна', accessibilityLabel: 'Статус связи: связь нестабильна' },
  retrying: { text: 'Пробуем восстановить связь', accessibilityLabel: 'Статус связи: пробуем восстановить связь' },
};

export function connectionReducer(
  status: ConnectionStatus = initialConnectionStatus,
  event: ConnectionEvent,
): ConnectionStatus {
  switch (event.type) {
    case 'networkObserved':
      return event.available ? 'connecting' : 'offline';
    case 'networkLost':
      return 'offline';
    case 'networkRestored':
    case 'connectionStarted':
    case 'retryStarted':
      return status === 'offline' && event.type !== 'networkRestored' ? 'offline' : 'connecting';
    case 'connectionSucceeded':
      return status === 'offline' ? 'offline' : 'online';
    case 'recoverableConnectionFailure':
      return status === 'offline' ? 'offline' : 'degraded';
    case 'retryScheduled':
      return status === 'offline' ? 'offline' : 'retrying';
  }
}

export function getConnectionPresentation(status: ConnectionStatus): ConnectionPresentation {
  return { status, ...presentationByStatus[status] };
}
