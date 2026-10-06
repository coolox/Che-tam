const appJson = require('./app.json');

function serializeLocalTestMode(value) {
  const normalizedValue = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return normalizedValue === '1' || normalizedValue === 'true' ? '1' : '0';
}

module.exports = () => ({
  ...appJson.expo,
  extra: {
    ...appJson.expo.extra,
    canaryEndpoint: process.env.EXPO_PUBLIC_CANARY_ENDPOINT ?? 'https://example.invalid/hearth-canary/',
    canaryControlDns: process.env.EXPO_PUBLIC_CANARY_CONTROL_DNS ?? 'https://turkmenportal.com/',
    canaryControlHttp: process.env.EXPO_PUBLIC_CANARY_CONTROL_HTTP ?? 'https://www.apple.com/',
    EXPO_PUBLIC_LOCAL_TEST_MODE: serializeLocalTestMode(process.env.EXPO_PUBLIC_LOCAL_TEST_MODE),
  },
});
