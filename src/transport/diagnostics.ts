import { calculateRetryDelayMs } from './backoff';
import { selectEndpoint, type EndpointPolicySnapshot } from './endpointPolicy';
import type { TransportFailureCategory } from './contract';

export type TransportDiagnosticsViewModel = {
  connectionCategory: string;
  selectedEndpointId: string | null;
  lastKnownGoodEndpointId: string | null;
  byteCounters: Array<{ endpointId: string; sent: number; received: number }>;
  nextRetryDelayMs: number | null;
};

const categoryText: Record<TransportFailureCategory | 'available', string> = {
  available: 'Связь доступна',
  offline: 'Нет сети',
  endpoint_failure: 'Точка связи недоступна',
  address_blocked: 'Адрес заблокирован',
};

export function buildTransportDiagnosticsViewModel(input: {
  snapshot: EndpointPolicySnapshot;
  category: TransportFailureCategory | 'available';
  retryAttempt?: number;
  jitter?: () => number;
}): TransportDiagnosticsViewModel {
  const selectedEndpoint = selectEndpoint(input.snapshot);
  const nextRetryDelayMs =
    input.retryAttempt === undefined
      ? null
      : calculateRetryDelayMs(input.retryAttempt, input.jitter ?? (() => 0.5));

  return {
    connectionCategory: categoryText[input.category],
    selectedEndpointId: selectedEndpoint?.id ?? null,
    lastKnownGoodEndpointId: input.snapshot.lastKnownGoodEndpointId,
    byteCounters: Object.entries(input.snapshot.counters)
      .map(([endpointId, counter]) => ({ endpointId, sent: counter.sent, received: counter.received }))
      .sort((left, right) => left.endpointId.localeCompare(right.endpointId)),
    nextRetryDelayMs,
  };
}
