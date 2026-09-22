import { sanitizeErrorCategory } from '../src/errors';

describe('v2 error categories', () => {
  it.each([
    [new Error('timeout after 15000ms'), 'tcp_timeout'],
    [new Error('certificate verify failed'), 'tls_cert_error'],
    [new Error('TLS handshake failed'), 'tls_error'],
    [new Error('DNS ENOTFOUND'), 'dns_nxdomain'],
    [new Error('no address associated with hostname'), 'dns_nxdomain'],
    [new Error('ECONNREFUSED'), 'tcp_refused'],
    [new Error('Network request failed'), 'tcp_unreachable'],
    [new Error('WebSocket error'), 'websocket_error'],
    [new Error('missing endpoint configuration'), 'unknown'],
    [new Error('unexpected'), 'unknown'],
  ] as const)('maps %s to %s', (error, expected) => {
    expect(sanitizeErrorCategory(error)).toBe(expected);
  });

  it('exports only the permitted category vocabulary', () => {
    const permitted = new Set(['dns_nxdomain', 'dns_timeout', 'tcp_refused', 'tcp_timeout', 'tcp_unreachable', 'tls_error', 'tls_timeout', 'tls_cert_error', 'http_error', 'websocket_error', 'no_network', 'unknown']);
    ['timeout', 'certificate verify failed', 'DNS ENOTFOUND', 'ECONNREFUSED', 'WebSocket error', 'configuration missing', 'unexpected'].forEach(message => expect(permitted.has(sanitizeErrorCategory(new Error(message)))).toBe(true));
  });
});
