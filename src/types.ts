export type CanaryTestType =
  | 'control_dns'
  | 'control_http'
  | 'dns_resolve'
  | 'http_domain'
  | 'ws_domain'
  | 'missed_cycle';

export type CanaryErrorCategory =
  | 'dns_nxdomain'
  | 'dns_timeout'
  | 'tcp_refused'
  | 'tcp_timeout'
  | 'tcp_unreachable'
  | 'tls_error'
  | 'tls_timeout'
  | 'tls_cert_error'
  | 'http_error'
  | 'websocket_error'
  | 'no_network'
  | 'unknown';

export type CanaryNetworkType = 'wifi' | 'cellular' | 'ethernet' | 'none' | 'unknown';

export interface CanaryPhases {
  dnsMs: number | null;
  tcpMs: number | null;
  tlsMs: number | null;
  httpMs: number | null;
}

export interface CanaryRecord {
  timestampUtc: string;
  /** Local key shared by every result in one five-test run. */
  checkRunKey: string;
  testType: CanaryTestType;
  target: string;
  success: boolean;
  httpStatus: number | null;
  latencyMs: number;
  phases: CanaryPhases;
  /** System resolver result for the monitored domain; never used as a connection target. */
  resolvedIp: string | null;
  networkType: CanaryNetworkType;
  carrier: string | null;
  appState: 'foreground' | 'background' | 'native_service' | 'workmanager';
  errorCategory: CanaryErrorCategory;
  errorDetail: string | null;
}

export interface CheckRunResult {
  records: CanaryRecord[];
  savedCount: number;
}
