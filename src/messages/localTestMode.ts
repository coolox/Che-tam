export type LocalTestModeEnv = {
  EXPO_PUBLIC_LOCAL_TEST_MODE?: string;
};

export type LocalTestModeConfig = {
  enabled: boolean;
};

export function resolveLocalTestMode(env: LocalTestModeEnv = {}): LocalTestModeConfig {
  return { enabled: env.EXPO_PUBLIC_LOCAL_TEST_MODE === '1' };
}

export function getLocalTestModeConfig(): LocalTestModeConfig {
  return resolveLocalTestMode(process.env);
}
