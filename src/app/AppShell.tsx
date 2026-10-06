import { useEffect, useReducer, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { createExpoSqliteDatabaseFactory } from '../storage/sqlite/expoAdapter';
import { netInfoSource } from '../hooks/useConnectionStatus';
import { createLocalMessageStore, LOCAL_LOADING_TEXT, type LocalDataSnapshot } from '../messages/localMessageStore';
import { getLocalTestModeConfig } from '../messages/localTestMode';
import { createDebugLocalAckTransportAvailabilitySource } from '../messages/localOutbox';
import { createAsyncInvitationAdmissionPreference, type InvitationAdmissionPreference } from '../invitationGate/preferences';
import { initialInvitationGateState, invitationGateReducer, isInvitationGateSubmitDisabled, LOCAL_TEST_INVITE_CODE, type InvitationGateState } from '../invitationGate/reducer';
import { ThemeProvider, useTheme } from '../ui/theme';
import { radius, spacing, typography, type ThemeColors } from '../ui/tokens';
import PreviewAppShell from './PreviewAppShell';

const localTestMode = getLocalTestModeConfig();
const connectionStatusSource = createDebugLocalAckTransportAvailabilitySource(localTestMode) ?? netInfoSource;
const store = createLocalMessageStore(createExpoSqliteDatabaseFactory(), 'che-tam-local.db', {
  localTestMode,
  networkAvailabilitySource: netInfoSource,
});

export const INVITATION_GATE_RETRY_TEXT = 'Попробовать ещё раз';
export const INVITATION_GATE_CODE_INPUT_PROPS = {
  accessibilityLabel: 'Код приглашения',
  autoCapitalize: 'characters',
  placeholder: 'Код приглашения',
} as const;
export const INVITATION_GATE_NAME_INPUT_PROPS = {
  accessibilityLabel: 'Как вас зовут',
  autoCapitalize: 'words',
  placeholder: 'Как вас зовут',
} as const;

export type InvitationGateViewModel = {
  error: string | null;
  localTestHint: string | null;
  normalModeExplanation: string;
  primaryDisabled: boolean;
  retryVisible: boolean;
};

export function getInvitationGateViewModel(state: InvitationGateState, localTestModeEnabled: boolean): InvitationGateViewModel {
  return {
    error: state.error,
    localTestHint: localTestModeEnabled ? `Локальный тестовый код: ${LOCAL_TEST_INVITE_CODE}` : null,
    normalModeExplanation: 'Код приглашения выдаёт Арслан лично. В локальной версии нет серверной проверки.',
    primaryDisabled: isInvitationGateSubmitDisabled(state),
    retryVisible: Boolean(state.error),
  };
}

export function InvitationGate({
  localTestModeEnabled,
  preference,
  onComplete,
}: {
  localTestModeEnabled: boolean;
  preference: InvitationAdmissionPreference;
  onComplete: (displayName: string) => void;
}) {
  const [state, dispatch] = useReducer(invitationGateReducer, initialInvitationGateState);
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = createInvitationGateStyles(colors, insets.top);
  const viewModel = getInvitationGateViewModel(state, localTestModeEnabled);
  const submit = async () => {
    if (viewModel.primaryDisabled) return;
    const nextState = invitationGateReducer(state, { type: 'submit', localTestModeEnabled });
    dispatch({ type: 'submit', localTestModeEnabled });
    if (nextState.status === 'complete') {
      await preference.setAdmitted(nextState.displayName);
      onComplete(nextState.displayName);
    }
  };
  return (
    <View accessibilityLabel="Вход по приглашению" style={styles.screen}>
      <View style={styles.panel}>
        <Text style={styles.title}>Вход по приглашению</Text>
        <Text style={styles.body}>{viewModel.normalModeExplanation}</Text>
        {viewModel.localTestHint ? <Text style={styles.body}>{viewModel.localTestHint}</Text> : null}
        <View style={styles.field}>
          <Text style={styles.label}>Код приглашения</Text>
          <TextInput
            accessibilityLabel={INVITATION_GATE_CODE_INPUT_PROPS.accessibilityLabel}
            autoCapitalize={INVITATION_GATE_CODE_INPUT_PROPS.autoCapitalize}
            onChangeText={(inviteCode) => dispatch({ type: 'inviteCodeChanged', inviteCode })}
            placeholder={INVITATION_GATE_CODE_INPUT_PROPS.placeholder}
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            value={state.status === 'editing' ? state.inviteCode : ''}
          />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Как вас зовут</Text>
          <TextInput
            accessibilityLabel={INVITATION_GATE_NAME_INPUT_PROPS.accessibilityLabel}
            autoCapitalize={INVITATION_GATE_NAME_INPUT_PROPS.autoCapitalize}
            onChangeText={(displayName) => dispatch({ type: 'displayNameChanged', displayName })}
            placeholder={INVITATION_GATE_NAME_INPUT_PROPS.placeholder}
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            value={state.displayName}
          />
        </View>
        {viewModel.error ? <Text accessibilityLabel={`Ошибка приглашения: ${viewModel.error}`} style={styles.error}>{viewModel.error}</Text> : null}
        <Pressable
          accessibilityLabel="Продолжить"
          accessibilityRole="button"
          accessibilityState={{ disabled: viewModel.primaryDisabled }}
          disabled={viewModel.primaryDisabled}
          onPress={submit}
          style={[styles.primaryButton, viewModel.primaryDisabled && styles.primaryButtonDisabled]}
        >
          <Text style={styles.primaryButtonText}>Продолжить</Text>
        </Pressable>
        {viewModel.retryVisible ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Повторить ввод" onPress={() => dispatch({ type: 'retry' })} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>{INVITATION_GATE_RETRY_TEXT}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}


export function AppShell() {
  const [admitted, setAdmitted] = useState<boolean | null>(null);
  const [snapshot, setSnapshot] = useState<LocalDataSnapshot>(store.getSnapshot());

  const [preference] = useState(createAsyncInvitationAdmissionPreference);
  useEffect(() => { void preference.getAdmission().then((admission) => setAdmitted(admission.admitted)).catch(() => setAdmitted(false)); }, [preference]);
  useEffect(() => { const unsubscribe = store.subscribe(() => setSnapshot(store.getSnapshot())); void store.bootstrap(); return unsubscribe; }, []);
  if (admitted === null) return <Text>{LOCAL_LOADING_TEXT}</Text>;
  if (!admitted) return <SafeAreaProvider><ThemeProvider><InvitationGate localTestModeEnabled={localTestMode.enabled} preference={preference} onComplete={() => setAdmitted(true)} /></ThemeProvider></SafeAreaProvider>;
  return <PreviewAppShell connectionStatusSource={connectionStatusSource} isLocalTestModeEnabled={localTestMode.enabled} snapshot={snapshot} onClearComposerDraft={(chatId) => store.clearComposerDraft(chatId)} onClearUnread={(chatId) => store.clearUnread(chatId)} onReadComposerDraft={(chatId) => store.readComposerDraft(chatId)} onRetry={() => store.bootstrap()} onRetryMessage={(clientMessageId) => store.retryTextMessage(clientMessageId)} onSaveComposerDraft={(chatId, draft) => store.saveComposerDraft(chatId, draft)} onSendMessage={(chatId, draft) => store.sendTextMessage(chatId, draft)} />;
}

const createInvitationGateStyles = (colors: ThemeColors, topInset: number) => StyleSheet.create({
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
  label: { color: colors.text, fontSize: typography.sm, fontWeight: '800' },
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
