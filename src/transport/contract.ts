export type TransportAvailability = {
  available: boolean;
};

export type TransportFailureCategory = 'offline' | 'endpoint_failure' | 'address_blocked';

export type TransportFailure = {
  ok: false;
  category: TransportFailureCategory;
};

export type TransportByteCounts = {
  sent?: number;
  received?: number;
};

export type TransportRequest<TBody = unknown> = {
  operationId: string;
  body: TBody;
};

export type TransportResponse<TBody = unknown> = {
  ok: true;
  body: TBody;
  endpointId?: string;
  bytes?: TransportByteCounts;
};

export type TransportResult<TBody = unknown> = TransportResponse<TBody> | TransportFailure;

export type TransportAttempt<TBody = unknown> = () => Promise<TransportResponse<TBody>>;

export interface Transport {
  request<TBody = unknown>(
    request: TransportRequest,
    availability: TransportAvailability,
    attempt: TransportAttempt<TBody>,
  ): Promise<TransportResult<TBody>>;
}

export async function runTransportAttempt<TBody>(
  availability: TransportAvailability,
  attempt: TransportAttempt<TBody>,
): Promise<TransportResult<TBody>> {
  if (!availability.available) {
    return { ok: false, category: 'offline' };
  }

  return attempt();
}
