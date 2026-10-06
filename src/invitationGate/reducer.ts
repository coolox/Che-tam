// Non-secret local-only code for deterministic LOCAL_TEST_MODE admission.
export const LOCAL_TEST_INVITE_CODE = 'LOCAL-TEST-INVITE';

export type InvitationGateState =
  | { status: 'editing'; inviteCode: string; displayName: string; error: string | null }
  | { status: 'complete'; inviteCode: ''; displayName: string; error: null };

export type InvitationGateAction =
  | { type: 'inviteCodeChanged'; inviteCode: string }
  | { type: 'displayNameChanged'; displayName: string }
  | { type: 'submit'; localTestModeEnabled: boolean }
  | { type: 'retry' };

export const initialInvitationGateState: InvitationGateState = {
  status: 'editing',
  inviteCode: '',
  displayName: '',
  error: null,
};

export function normalizeDisplayName(displayName: string): string {
  return displayName.trim().replace(/\s+/g, ' ');
}

export function isInvitationGateSubmitDisabled(state: InvitationGateState): boolean {
  return state.status !== 'editing' || state.inviteCode.trim().length === 0 || normalizeDisplayName(state.displayName).length === 0;
}

export function invitationGateReducer(state: InvitationGateState, action: InvitationGateAction): InvitationGateState {
  if (state.status === 'complete') return state;
  if (action.type === 'retry') return { ...state, error: null };
  if (action.type === 'inviteCodeChanged') return { ...state, inviteCode: action.inviteCode, error: null };
  if (action.type === 'displayNameChanged') return { ...state, displayName: action.displayName, error: null };
  if (action.type === 'submit') {
    const displayName = normalizeDisplayName(state.displayName);
    if (state.inviteCode.trim().length === 0) return { ...state, error: 'Введите код приглашения.' };
    if (displayName.length === 0) return { ...state, error: 'Введите имя, которое увидит семья.' };
    if (!action.localTestModeEnabled) {
      return { ...state, error: 'Код приглашения выдаёт Арслан. В этой локальной версии серверной проверки нет.' };
    }
    if (state.inviteCode.trim() !== LOCAL_TEST_INVITE_CODE) return { ...state, error: 'Неверный локальный тестовый код приглашения.' };
    return { status: 'complete', inviteCode: '', displayName, error: null };
  }
  return state;
}
