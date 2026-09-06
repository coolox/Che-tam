import { REQUEST_TIMEOUT_MS, toWebSocketEndpoint } from './config';
import { sanitizeErrorCategory } from './errors';
import { appendRecords } from './storage';
import {
  CanaryErrorCategory,
  CanaryNetworkType,
  CanaryRecord,
  CanaryTestType,
  CheckPairResult,
} from './types';

function nowIso(): string {
  return new Date().toISOString();
}

function makeRecord(params: {
  testType: CanaryTestType;
  success: boolean;
  startedAtMs: number;
  networkType: CanaryNetworkType;
  httpStatus?: number;
  errorCategory?: CanaryErrorCategory;
}): CanaryRecord {
  return {
    timestampUtc: nowIso(),
    testType: params.testType,
    success: params.success,
    httpStatus: params.httpStatus,
    latencyMs: Math.max(0, Math.round(Date.now() - params.startedAtMs)),
    networkType: params.networkType,
    errorCategory: params.errorCategory ?? 'none',
  };
}

export async function runHttpsCheck(
  endpoint: string,
  networkType: CanaryNetworkType,
): Promise<CanaryRecord> {
  const startedAtMs = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return makeRecord({
      testType: 'https',
      success: response.ok,
      startedAtMs,
      networkType,
      httpStatus: response.status,
      errorCategory: response.ok ? 'none' : 'http_error',
    });
  } catch (error) {
    clearTimeout(timeout);
    return makeRecord({
      testType: 'https',
      success: false,
      startedAtMs,
      networkType,
      errorCategory: sanitizeErrorCategory(error),
    });
  }
}

export async function runWebSocketCheck(
  endpoint: string,
  networkType: CanaryNetworkType,
): Promise<CanaryRecord> {
  const startedAtMs = Date.now();

  try {
    const wsUrl = toWebSocketEndpoint(endpoint);
    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(wsUrl);
      const timeout = setTimeout(() => {
        socket.close();
        reject(new Error('WebSocket timeout'));
      }, REQUEST_TIMEOUT_MS);

      socket.onopen = () => {
        clearTimeout(timeout);
        socket.close();
        resolve();
      };
      socket.onerror = () => {
        clearTimeout(timeout);
        reject(new Error('WebSocket error'));
      };
    });

    return makeRecord({
      testType: 'websocket',
      success: true,
      startedAtMs,
      networkType,
    });
  } catch (error) {
    return makeRecord({
      testType: 'websocket',
      success: false,
      startedAtMs,
      networkType,
      errorCategory: sanitizeErrorCategory(error),
    });
  }
}

export async function runConnectivityCheck(params: {
  endpoint: string | undefined;
  networkType: CanaryNetworkType;
}): Promise<CheckPairResult> {
  const { endpoint, networkType } = params;
  const records = endpoint
    ? await Promise.all([
        runHttpsCheck(endpoint, networkType),
        runWebSocketCheck(endpoint, networkType),
      ])
    : [
        makeRecord({
          testType: 'https',
          success: false,
          startedAtMs: Date.now(),
          networkType,
          errorCategory: 'configuration_error',
        }),
        makeRecord({
          testType: 'websocket',
          success: false,
          startedAtMs: Date.now(),
          networkType,
          errorCategory: 'configuration_error',
        }),
      ];
  const savedCount = await appendRecords(records);
  return { records, savedCount };
}
