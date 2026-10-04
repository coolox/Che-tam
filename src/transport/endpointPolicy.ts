import type { TransportByteCounts, TransportFailureCategory } from './contract';

export type EndpointId = string;

export type EndpointRecord = {
  id: EndpointId;
  priority: number;
};

export type EndpointSelectionState = {
  endpoints: EndpointRecord[];
  lastKnownGoodEndpointId: EndpointId | null;
  unavailableEndpointIds: EndpointId[];
};

export type EndpointCounters = Record<EndpointId, { sent: number; received: number }>;

export type EndpointPolicySnapshot = EndpointSelectionState & {
  counters: EndpointCounters;
};

export type KeyValueStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};

export type EndpointListSource = {
  loadEndpoints(): Promise<EndpointRecord[]>;
};

export type EndpointAttemptResult =
  | { ok: true; endpointId: EndpointId; bytes?: TransportByteCounts }
  | { ok: false; endpointId: EndpointId; category: TransportFailureCategory; markUnavailable?: boolean; bytes?: TransportByteCounts };

const emptySnapshot: EndpointPolicySnapshot = {
  endpoints: [],
  lastKnownGoodEndpointId: null,
  unavailableEndpointIds: [],
  counters: {},
};

export class EndpointPolicyRepository {
  constructor(
    private readonly storage: KeyValueStorage,
    private readonly storageKey = 'transport.endpointPolicy.v1',
  ) {}

  async load(): Promise<EndpointPolicySnapshot> {
    const raw = await this.storage.getItem(this.storageKey);

    if (raw === null) {
      return { ...emptySnapshot };
    }

    try {
      return normalizeSnapshot(JSON.parse(raw));
    } catch {
      return { ...emptySnapshot };
    }
  }

  async save(snapshot: EndpointPolicySnapshot): Promise<void> {
    await this.storage.setItem(this.storageKey, JSON.stringify(normalizeSnapshot(snapshot)));
  }
}

export async function updateEndpointList(
  repository: EndpointPolicyRepository,
  source: EndpointListSource,
): Promise<{ updated: boolean; snapshot: EndpointPolicySnapshot }> {
  const current = await repository.load();
  const nextEndpoints = await source.loadEndpoints();

  if (!isValidEndpointList(nextEndpoints)) {
    return { updated: false, snapshot: current };
  }

  const approvedIds = new Set(nextEndpoints.map(endpoint => endpoint.id));
  const unavailableEndpointIds = current.unavailableEndpointIds.filter(id => approvedIds.has(id));
  const lastKnownGoodEndpointId = approvedIds.has(current.lastKnownGoodEndpointId ?? '')
    ? current.lastKnownGoodEndpointId
    : null;
  const counters = Object.fromEntries(Object.entries(current.counters).filter(([id]) => approvedIds.has(id)));
  const snapshot = normalizeSnapshot({
    endpoints: nextEndpoints,
    lastKnownGoodEndpointId,
    unavailableEndpointIds,
    counters,
  });

  await repository.save(snapshot);

  return { updated: true, snapshot };
}

export function selectEndpoint(snapshot: EndpointPolicySnapshot): EndpointRecord | null {
  const unavailableIds = new Set(snapshot.unavailableEndpointIds);
  const lastKnownGood = snapshot.lastKnownGoodEndpointId;

  if (lastKnownGood !== null && !unavailableIds.has(lastKnownGood)) {
    const endpoint = snapshot.endpoints.find(candidate => candidate.id === lastKnownGood);

    if (endpoint !== undefined) {
      return endpoint;
    }
  }

  return [...snapshot.endpoints]
    .filter(endpoint => !unavailableIds.has(endpoint.id))
    .sort((left, right) => left.priority - right.priority || left.id.localeCompare(right.id))[0] ?? null;
}

export async function recordEndpointResult(
  repository: EndpointPolicyRepository,
  result: EndpointAttemptResult,
): Promise<EndpointPolicySnapshot> {
  const current = await repository.load();
  const unavailableIds = new Set(current.unavailableEndpointIds);
  const counters = addBytes(current.counters, result.endpointId, result.bytes);

  if (result.ok) {
    unavailableIds.delete(result.endpointId);
    const snapshot = normalizeSnapshot({
      ...current,
      lastKnownGoodEndpointId: result.endpointId,
      unavailableEndpointIds: [...unavailableIds],
      counters,
    });
    await repository.save(snapshot);
    return snapshot;
  }

  if (result.markUnavailable === true) {
    unavailableIds.add(result.endpointId);
  }

  const snapshot = normalizeSnapshot({ ...current, unavailableEndpointIds: [...unavailableIds], counters });
  await repository.save(snapshot);
  return snapshot;
}

export type DnsPolicyInput = {
  answers: string[];
  tamperingDetected?: boolean;
};

export function classifyDnsPolicy(input: DnsPolicyInput): TransportFailureCategory | null {
  if (input.tamperingDetected === true) {
    return 'address_blocked';
  }

  return input.answers.some(answer => ['127.0.0.1', '0.0.0.0', '::1', '::'].includes(answer))
    ? 'address_blocked'
    : null;
}

function addBytes(counters: EndpointCounters, endpointId: EndpointId, bytes?: TransportByteCounts): EndpointCounters {
  const current = counters[endpointId] ?? { sent: 0, received: 0 };
  const sent = isNonNegativeNumber(bytes?.sent) ? current.sent + bytes.sent : current.sent;
  const received = isNonNegativeNumber(bytes?.received) ? current.received + bytes.received : current.received;

  return { ...counters, [endpointId]: { sent, received } };
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isValidEndpointList(endpoints: EndpointRecord[]): boolean {
  const ids = new Set<string>();

  for (const endpoint of endpoints) {
    if (
      endpoint.id.length === 0 ||
      ids.has(endpoint.id) ||
      !Number.isInteger(endpoint.priority) ||
      endpoint.priority < 0
    ) {
      return false;
    }

    ids.add(endpoint.id);
  }

  return true;
}

function normalizeSnapshot(value: unknown): EndpointPolicySnapshot {
  if (!isSnapshotLike(value)) {
    return { ...emptySnapshot };
  }

  const endpointIds = new Set(value.endpoints.map(endpoint => endpoint.id));
  const unavailableEndpointIds = value.unavailableEndpointIds
    .filter(id => endpointIds.has(id))
    .sort((left, right) => left.localeCompare(right));
  const counters = Object.fromEntries(
    Object.entries(value.counters)
      .filter(([id]) => endpointIds.has(id))
      .map(([id, counter]) => [
        id,
        {
          sent: isNonNegativeNumber(counter.sent) ? counter.sent : 0,
          received: isNonNegativeNumber(counter.received) ? counter.received : 0,
        },
      ]),
  );

  return {
    endpoints: [...value.endpoints].sort((left, right) => left.id.localeCompare(right.id)),
    lastKnownGoodEndpointId: endpointIds.has(value.lastKnownGoodEndpointId ?? '') ? value.lastKnownGoodEndpointId : null,
    unavailableEndpointIds,
    counters,
  };
}

function isSnapshotLike(value: unknown): value is EndpointPolicySnapshot {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as EndpointPolicySnapshot;

  return (
    Array.isArray(candidate.endpoints) &&
    isValidEndpointList(candidate.endpoints) &&
    (candidate.lastKnownGoodEndpointId === null || typeof candidate.lastKnownGoodEndpointId === 'string') &&
    Array.isArray(candidate.unavailableEndpointIds) &&
    candidate.unavailableEndpointIds.every(id => typeof id === 'string') &&
    typeof candidate.counters === 'object' &&
    candidate.counters !== null
  );
}
