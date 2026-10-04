import { getAuthErrorMessage } from './validation';
import type { AuthState } from './types';

export type AuthViewModel = {
  state: 'checking' | 'anonymous' | 'authenticated';
  message: string;
  accountId?: string;
  profileId?: string;
  deviceId?: string;
};

export function buildAuthViewModel(state: AuthState): AuthViewModel {
  if (state.status === 'authenticated' && state.session) {
    return {
      state: 'authenticated',
      message: 'Вход выполнен.',
      accountId: state.session.accountId,
      profileId: state.session.profileId,
      deviceId: state.session.deviceId,
    };
  }

  if (state.status === 'checking') {
    return {
      state: 'checking',
      message: 'Проверяем сессию.',
    };
  }

  return {
    state: 'anonymous',
    message: state.error ? getAuthErrorMessage(state.error) : 'Нужно войти.',
  };
}
