import { CanaryErrorCategory } from './types';

export function sanitizeErrorCategory(error: unknown): CanaryErrorCategory {
  const normalized = (error instanceof Error ? error.message : String(error ?? '')).toLowerCase();
  if (normalized.includes('certificate') || normalized.includes('sslpeerunverified') || normalized.includes('cert')) return 'tls_cert_error';
  if (normalized.includes('tls') || normalized.includes('ssl') || normalized.includes('handshake')) return normalized.includes('timeout') ? 'tls_timeout' : 'tls_error';
  if (normalized.includes('dns') || normalized.includes('enotfound') || normalized.includes('no address associated')) return normalized.includes('timeout') ? 'dns_timeout' : 'dns_nxdomain';
  if (normalized.includes('timeout') || normalized.includes('timed out') || normalized.includes('abort')) return 'tcp_timeout';
  if (normalized.includes('econnrefused') || normalized.includes('connection refused')) return 'tcp_refused';
  if (normalized.includes('no network') || normalized.includes('offline')) return 'no_network';
  if (normalized.includes('network request failed') || normalized.includes('failed to fetch') || normalized.includes('unreachable') || normalized.includes('ehostunreach')) return 'tcp_unreachable';
  if (normalized.includes('websocket')) return 'websocket_error';
  return 'unknown';
}
