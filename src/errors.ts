import { CanaryErrorCategory } from './types';

export function sanitizeErrorCategory(error: unknown): CanaryErrorCategory {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const normalized = message.toLowerCase();

  if (normalized.includes('timeout') || normalized.includes('timed out')) {
    return 'timeout';
  }
  if (
    normalized.includes('certificate') ||
    normalized.includes('ssl') ||
    normalized.includes('tls') ||
    normalized.includes('cert')
  ) {
    return 'tls_or_certificate';
  }
  if (
    normalized.includes('dns') ||
    normalized.includes('network request failed') ||
    normalized.includes('failed to fetch') ||
    normalized.includes('unreachable') ||
    normalized.includes('enotfound') ||
    normalized.includes('econnrefused') ||
    normalized.includes('ehostunreach')
  ) {
    return 'dns_or_unreachable';
  }
  if (normalized.includes('websocket')) {
    return 'websocket_error';
  }
  if (normalized.includes('configuration') || normalized.includes('endpoint')) {
    return 'configuration_error';
  }

  return 'unknown';
}
