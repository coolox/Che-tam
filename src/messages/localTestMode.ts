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

function isEnabledLocalTestModeValue(value: string | undefined): boolean {
  const normalizedValue = value?.trim().toLocaleLowerCase('en-US');
  return normalizedValue === '1' || normalizedValue === 'true';
}

export function resolveLocalTestMode(env: LocalTestModeEnv = {}): LocalTestModeConfig {
  return { enabled: isEnabledLocalTestModeValue(env.EXPO_PUBLIC_LOCAL_TEST_MODE) };
}

export function getLocalTestModeConfig(runtimeConfig: LocalTestModeRuntimeConfig = Constants): LocalTestModeConfig {
  const value = runtimeConfig.expoConfig?.extra?.EXPO_PUBLIC_LOCAL_TEST_MODE;
  return resolveLocalTestMode({ EXPO_PUBLIC_LOCAL_TEST_MODE: typeof value === 'string' ? value : undefined });
}
