import { sanitizeErrorCategory } from '../src/errors';

describe('sanitizeErrorCategory', () => {
  it.each([
    [new Error('timeout after 15000ms'), 'timeout'],
    [new Error('certificate verify failed'), 'tls_or_certificate'],
    [new Error('Network request failed'), 'dns_or_unreachable'],
    [new Error('WebSocket error'), 'websocket_error'],
    [new Error('missing endpoint configuration'), 'configuration_error'],
    [new Error('unexpected'), 'unknown'],
  ] as const)('maps %s to %s', (error, expected) => {
    expect(sanitizeErrorCategory(error)).toBe(expected);
  });
});
