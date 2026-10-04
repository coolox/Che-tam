import type { AuthErrorCategory, LoginRequest } from './types';

export type ValidationResult = {
  ok: true;
} | {
  ok: false;
  message: string;
};

export function validateInviteInput(inviteText: string): ValidationResult {
  if (inviteText.trim().length === 0) {
    return { ok: false, message: 'Введите приглашение.' };
  }

  return { ok: true };
}

export function validateLoginInput(request: Pick<LoginRequest, 'identity' | 'password'>): ValidationResult {
  if (request.identity.trim().length === 0) {
    return { ok: false, message: 'Введите логин.' };
  }

  if (request.password.length === 0) {
    return { ok: false, message: 'Введите пароль.' };
  }

  return { ok: true };
}

export function getAuthErrorMessage(category: AuthErrorCategory): string {
  switch (category) {
    case 'offline':
      return 'Нет связи. Попробуйте позже.';
    case 'invalid_invite':
      return 'Приглашение не принято.';
    case 'invalid_credentials':
      return 'Логин или пароль не подошли.';
    case 'session_expired':
      return 'Сессия истекла. Войдите снова.';
    case 'device_replaced':
      return 'Аккаунт привязан к другому устройству.';
    case 'unknown':
      return 'Не удалось выполнить вход.';
  }
}
