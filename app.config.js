const appJson = require('./app.json');

module.exports = () => ({
  ...appJson.expo,
  extra: {
    ...appJson.expo.extra,
    canaryEndpoint: process.env.EXPO_PUBLIC_CANARY_ENDPOINT ?? 'https://example.invalid/hearth-canary/',
    canaryControlDns: process.env.EXPO_PUBLIC_CANARY_CONTROL_DNS ?? 'https://turkmenportal.com/',
    canaryControlHttp: process.env.EXPO_PUBLIC_CANARY_CONTROL_HTTP ?? 'https://www.apple.com/',
  },
});
