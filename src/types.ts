export type CanaryTestType = 'https' | 'websocket';

export type CanaryErrorCategory =
  | 'none'
  | 'timeout'
  | 'dns_or_unreachable'
  | 'tls_or_certificate'
  | 'http_error'
  | 'websocket_error'
  | 'configuration_error'
  | 'unknown';

export type CanaryNetworkType =
  | 'wifi'
  | 'cellular'
  | 'ethernet'
  | 'none'
  | 'unknown';

export interface CanaryRecord {
  timestampUtc: string;
  /** Non-identifying local marker that groups the two records from one probe. */
  checkPairKey?: string;
  testType: CanaryTestType;
  success: boolean;
  httpStatus?: number;
  latencyMs: number;
  networkType: CanaryNetworkType;
  errorCategory: CanaryErrorCategory;
}

export interface CheckPairResult {
  records: CanaryRecord[];
  savedCount: number;
}
