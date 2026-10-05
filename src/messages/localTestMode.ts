import Constants from 'expo-constants';

export type LocalTestModeEnv = {
  EXPO_PUBLIC_LOCAL_TEST_MODE?: string;
};

export type LocalTestModeConfig = {
  enabled: boolean;
};

export type LocalTestModeRuntimeConfig = {
  expoConfig?: {
    extra?: {
      EXPO_PUBLIC_LOCAL_TEST_MODE?: unknown;
    } | null;
  } | null;
};

export function resolveLocalTestMode(env: LocalTestModeEnv = {}): LocalTestModeConfig {
  return { enabled: env.EXPO_PUBLIC_LOCAL_TEST_MODE === '1' };
}

export function getLocalTestModeConfig(runtimeConfig: LocalTestModeRuntimeConfig = Constants): LocalTestModeConfig {
  const value = runtimeConfig.expoConfig?.extra?.EXPO_PUBLIC_LOCAL_TEST_MODE;
  return resolveLocalTestMode({ EXPO_PUBLIC_LOCAL_TEST_MODE: typeof value === 'string' ? value : undefined });
}
