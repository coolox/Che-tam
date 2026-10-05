import { useEffect, useReducer, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { createExpoSqliteDatabaseFactory } from '../storage/sqlite/expoAdapter';
import { createLocalMessageStore, LOCAL_LOADING_TEXT, type LocalDataSnapshot } from '../messages/localMessageStore';
import { createAsyncPhoneVerificationPreference, type PhoneVerificationPreference } from '../phoneVerification/preferences';
import { initialPhoneVerificationState, LOCAL_TEST_CODE, normalizeRussianPhone, phoneVerificationReducer, type PhoneVerificationState } from '../phoneVerification/reducer';
import { ThemeProvider, useTheme } from '../ui/theme';
import { radius, spacing, typography, type ThemeColors } from '../ui/tokens';
import PreviewAppShell from './PreviewAppShell';

const store = createLocalMessageStore(createExpoSqliteDatabaseFactory());

export const PHONE_SETUP_RETRY_TEXT = 'Попробовать ещё раз';
export const PHONE_SETUP_PHONE_INPUT_PROPS = {
  accessibilityLabel: 'Номер телефона',
  keyboardType: 'phone-pad',
  placeholder: '+993 …',
} as const;
export const PHONE_SETUP_CODE_INPUT_PROPS = {
  accessibilityLabel: 'Код подтверждения',
  keyboardType: 'number-pad',
  maxLength: 6,
  placeholder: '000000',
} as const;

export type PhoneSetupViewModel = {
  codeError: string | null;
  codeInputVisible: boolean;
  phoneError: string | null;
  phoneInputVisible: boolean;
  primaryDisabled: boolean;
  retryVisible: boolean;
};

export function getPhoneSetupViewModel(state: PhoneVerificationState): PhoneSetupViewModel {
  if (state.status === 'phone') {
    const inlinePhoneError = state.phone.length > 0 && normalizeRussianPhone(state.phone) === null
      ? 'Введите номер телефона: от 10 до 15 цифр.'
      : null;
    return {
      codeError: null,
      codeInputVisible: false,
      phoneError: state.error ?? inlinePhoneError,
      phoneInputVisible: true,
      primaryDisabled: normalizeRussianPhone(state.phone) === null,
      retryVisible: Boolean(state.error),
    };
  }
  if (state.status === 'code') {
    return {
      codeError: state.error,
      codeInputVisible: true,
      phoneError: null,
      phoneInputVisible: false,
      primaryDisabled: state.code.length !== 6,
      retryVisible: Boolean(state.error),
    };
  }
  return {
    codeError: null,
    codeInputVisible: false,
    phoneError: null,
    phoneInputVisible: false,
    primaryDisabled: true,
    retryVisible: false,
  };
}

function PhoneVerificationGate({ preference, onComplete }: { preference: PhoneVerificationPreference; onComplete: () => void }) {
  const [state, dispatch] = useReducer(phoneVerificationReducer, initialPhoneVerificationState);
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = createPhoneStyles(colors, insets.top);
  const viewModel = getPhoneSetupViewModel(state);
  const submit = async () => {
    if (viewModel.primaryDisabled) return;
    if (state.status === 'phone') { dispatch({ type: 'requestCode' }); return; }
    if (state.status === 'code') {
      if (state.code !== LOCAL_TEST_CODE) { dispatch({ type: 'submitCode' }); return; }
      dispatch({ type: 'submitCode' });
      await preference.setComplete();
      onComplete();
    }
  };
  return (
    <View accessibilityLabel="Локальная проверка телефона" style={styles.screen}>
      <View style={styles.panel}>
        <Text style={styles.title}>Локальная настройка телефона</Text>
        <Text style={styles.body}>Это локальный шаг настройки: SMS и проверка на сервере не выполняются.</Text>
        {viewModel.phoneInputVisible ? (
          <View style={styles.field}>
            <TextInput
              accessibilityLabel={PHONE_SETUP_PHONE_INPUT_PROPS.accessibilityLabel}
              keyboardType={PHONE_SETUP_PHONE_INPUT_PROPS.keyboardType}
              onChangeText={(phone) => dispatch({ type: 'phoneChanged', phone })}
              placeholder={PHONE_SETUP_PHONE_INPUT_PROPS.placeholder}
              placeholderTextColor={colors.textMuted}
              style={styles.input}
              value={state.phone}
            />
            {viewModel.phoneError ? <Text accessibilityLabel={`Ошибка номера телефона: ${viewModel.phoneError}`} style={styles.error}>{viewModel.phoneError}</Text> : null}
          </View>
        ) : null}
        {viewModel.codeInputVisible && state.status === 'code' ? (
          <View style={styles.field}>
            <Text style={styles.body}>Локальный тестовый код: 000000</Text>
            <TextInput
              accessibilityLabel={PHONE_SETUP_CODE_INPUT_PROPS.accessibilityLabel}
              keyboardType={PHONE_SETUP_CODE_INPUT_PROPS.keyboardType}
              maxLength={PHONE_SETUP_CODE_INPUT_PROPS.maxLength}
              onChangeText={(code) => dispatch({ type: 'codeChanged', code })}
              placeholder={PHONE_SETUP_CODE_INPUT_PROPS.placeholder}
              placeholderTextColor={colors.textMuted}
              style={styles.input}
              value={state.code}
            />
            {viewModel.codeError ? <Text accessibilityLabel={`Ошибка кода подтверждения: ${viewModel.codeError}`} style={styles.error}>{viewModel.codeError}</Text> : null}
          </View>
        ) : null}
        <Pressable
          accessibilityLabel={state.status === 'phone' ? 'Запросить локальный код' : 'Подтвердить локальный код'}
          accessibilityRole="button"
          accessibilityState={{ disabled: viewModel.primaryDisabled }}
          disabled={viewModel.primaryDisabled}
          onPress={submit}
          style={[styles.primaryButton, viewModel.primaryDisabled && styles.primaryButtonDisabled]}
        >
          <Text style={styles.primaryButtonText}>{state.status === 'phone' ? 'Получить локальный код' : 'Подтвердить'}</Text>
        </Pressable>
        {viewModel.retryVisible ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Повторить ввод" onPress={() => dispatch({ type: 'retry' })} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>{PHONE_SETUP_RETRY_TEXT}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}


export function AppShell() {
  const [verified, setVerified] = useState<boolean | null>(null);
  const [snapshot, setSnapshot] = useState<LocalDataSnapshot>(store.getSnapshot());

  const [preference] = useState(createAsyncPhoneVerificationPreference);
  useEffect(() => { void preference.getComplete().then(setVerified).catch(() => setVerified(false)); }, [preference]);
  useEffect(() => { const unsubscribe = store.subscribe(() => setSnapshot(store.getSnapshot())); void store.bootstrap(); return unsubscribe; }, []);
  if (verified === null) return <Text>{LOCAL_LOADING_TEXT}</Text>;
  if (!verified) return <SafeAreaProvider><ThemeProvider><PhoneVerificationGate preference={preference} onComplete={() => setVerified(true)} /></ThemeProvider></SafeAreaProvider>;
  return <PreviewAppShell snapshot={snapshot} onClearUnread={(chatId) => store.clearUnread(chatId)} onRetry={() => store.bootstrap()} />;
}

const createPhoneStyles = (colors: ThemeColors, topInset: number) => StyleSheet.create({
  screen: {
    backgroundColor: colors.background,
    flex: 1,
    justifyContent: 'center',
    padding: spacing.xl,
    paddingTop: topInset + spacing.xl,
  },
  panel: { gap: spacing.md },
  title: { color: colors.text, fontSize: 32, fontWeight: '800' },
  body: { color: colors.textSecondary, fontSize: typography.md, lineHeight: 23 },
  field: { gap: spacing.xs },
  input: {
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    color: colors.text,
    fontSize: typography.lg,
    minHeight: 52,
    paddingHorizontal: spacing.md,
  },
  error: { color: colors.danger, fontSize: typography.sm, fontWeight: '700' },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: spacing.lg,
  },
  primaryButtonDisabled: { opacity: 0.45 },
  primaryButtonText: { color: colors.surface, fontSize: typography.md, fontWeight: '800' },
  secondaryButton: {
    alignItems: 'center',
    borderColor: colors.accent,
    borderRadius: radius.md,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: spacing.lg,
  },
  secondaryButtonText: { color: colors.accent, fontSize: typography.md, fontWeight: '800' },
});
