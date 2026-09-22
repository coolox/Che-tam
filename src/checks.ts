import { REQUEST_TIMEOUT_MS, toWebSocketEndpoint } from './config';
import { sanitizeErrorCategory } from './errors';
import { appendRecords } from './storage';
import {
  CanaryErrorCategory,
  CanaryNetworkType,
  CanaryRecord,
  CanaryTestType,
  CheckRunResult,
} from './types';

const EMPTY_PHASES = { dnsMs: null, tcpMs: null, tlsMs: null, httpMs: null };

function targetHost(value?: string): string {
  if (!value) return 'not_configured';
  try { return new URL(value).hostname; } catch { return value; }
}

function makeRecord(params: {
  checkRunKey: string; testType: CanaryTestType; target: string; success: boolean; startedAtMs: number;
  networkType: CanaryNetworkType; appState: CanaryRecord['appState']; carrier?: string | null;
  httpStatus?: number | null; resolvedIp?: string | null; errorCategory?: CanaryErrorCategory;
  errorDetail?: string | null; phases?: CanaryRecord['phases'];
}): CanaryRecord {
  return {
    timestampUtc: new Date().toISOString(), checkRunKey: params.checkRunKey, testType: params.testType,
    target: params.target, success: params.success, httpStatus: params.httpStatus ?? null,
    latencyMs: Math.max(0, Math.round(Date.now() - params.startedAtMs)), phases: params.phases ?? EMPTY_PHASES,
    resolvedIp: params.resolvedIp ?? null, networkType: params.networkType, carrier: params.carrier ?? null,
    appState: params.appState, errorCategory: params.errorCategory ?? 'unknown', errorDetail: params.errorDetail ?? null,
  };
}

async function runHttpCheck(params: {
  checkRunKey: string; testType: 'control_dns' | 'control_http' | 'http_domain'; endpoint?: string;
  networkType: CanaryNetworkType; appState: CanaryRecord['appState']; carrier?: string | null;
}): Promise<CanaryRecord> {
  const startedAtMs = Date.now();
  if (!params.endpoint) return makeRecord({ ...params, target: 'not_configured', success: false, startedAtMs, errorCategory: 'unknown', errorDetail: 'HTTPS target is not configured' });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(params.endpoint, { method: 'GET', cache: 'no-store', signal: controller.signal });
    clearTimeout(timeout);
    return makeRecord({ ...params, target: targetHost(params.endpoint), success: response.ok, startedAtMs, httpStatus: response.status, phases: { ...EMPTY_PHASES, httpMs: Math.max(0, Date.now() - startedAtMs) }, errorCategory: response.ok ? 'unknown' : 'http_error' });
  } catch (error) {
    clearTimeout(timeout);
    return makeRecord({ ...params, target: targetHost(params.endpoint), success: false, startedAtMs, errorCategory: sanitizeErrorCategory(error), errorDetail: 'HTTP request failed' });
  }
}

/** JavaScript fallback only. Android manual/background execution always calls native runNow(). */
function unavailableDnsRecord(params: { checkRunKey: string; networkType: CanaryNetworkType; appState: CanaryRecord['appState']; carrier?: string | null; endpoint?: string }): CanaryRecord {
  const startedAtMs = Date.now();
  return makeRecord({ ...params, testType: 'dns_resolve', target: targetHost(params.endpoint), success: false, startedAtMs, errorCategory: 'unknown', errorDetail: 'system resolver result requires the native Android monitor' });
}

export async function runConnectivityCheck(params: {
  endpoint?: string; controlDns?: string; controlHttp?: string; networkType: CanaryNetworkType;
  carrier?: string | null; appState?: CanaryRecord['appState'];
}): Promise<CheckRunResult> {
  const checkRunKey = new Date().toISOString();
  const appState = params.appState ?? 'foreground';
  const records = await Promise.all([
    runHttpCheck({ checkRunKey, testType: 'control_dns', endpoint: params.controlDns, networkType: params.networkType, carrier: params.carrier, appState }),
    runHttpCheck({ checkRunKey, testType: 'control_http', endpoint: params.controlHttp, networkType: params.networkType, carrier: params.carrier, appState }),
    Promise.resolve(unavailableDnsRecord({ checkRunKey, endpoint: params.endpoint, networkType: params.networkType, carrier: params.carrier, appState })),
    runHttpCheck({ checkRunKey, testType: 'http_domain', endpoint: params.endpoint, networkType: params.networkType, carrier: params.carrier, appState }),
    runWebSocketCheck({ checkRunKey, endpoint: params.endpoint, networkType: params.networkType, carrier: params.carrier, appState }),
  ]);
  const savedCount = await appendRecords(records);
  return { records, savedCount };
}

export async function runWebSocketCheck(params: { checkRunKey: string; endpoint?: string; networkType: CanaryNetworkType; carrier?: string | null; appState: CanaryRecord['appState'] }): Promise<CanaryRecord> {
  const startedAtMs = Date.now();
  if (!params.endpoint) return makeRecord({ ...params, testType: 'ws_domain', target: 'not_configured', success: false, startedAtMs, errorCategory: 'unknown', errorDetail: 'WebSocket target is not configured' });
  try {
    const wsUrl = toWebSocketEndpoint(params.endpoint);
    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(wsUrl);
      const timeout = setTimeout(() => { socket.close(); reject(new Error('WebSocket timeout')); }, REQUEST_TIMEOUT_MS);
      socket.onopen = () => { clearTimeout(timeout); socket.close(); resolve(); };
      socket.onerror = () => { clearTimeout(timeout); reject(new Error('WebSocket error')); };
    });
    return makeRecord({ ...params, testType: 'ws_domain', target: targetHost(params.endpoint), success: true, startedAtMs });
  } catch (error) {
    return makeRecord({ ...params, testType: 'ws_domain', target: targetHost(params.endpoint), success: false, startedAtMs, errorCategory: sanitizeErrorCategory(error), errorDetail: 'WebSocket domain request failed' });
  }
}
