export function hasValidCanaryKey(headers, expectedKey) {
  if (!expectedKey) {
    return false;
  }

  const actual = headers['x-canary-key'];
  return typeof actual === 'string' && actual.length > 0 && actual === expectedKey;
}
