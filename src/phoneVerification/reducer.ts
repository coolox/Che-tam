export const LOCAL_TEST_CODE = '000000';

export type PhoneVerificationState =
  | { status: 'phone'; phone: string; normalizedPhone: null; code: ''; error: string | null }
  | { status: 'code'; phone: string; normalizedPhone: string; code: string; error: string | null }
  | { status: 'complete'; phone: ''; normalizedPhone: null; code: ''; error: null };

export type PhoneVerificationAction =
  | { type: 'phoneChanged'; phone: string }
  | { type: 'requestCode' }
  | { type: 'codeChanged'; code: string }
  | { type: 'submitCode' }
  | { type: 'retry' };

export const initialPhoneVerificationState: PhoneVerificationState = { status: 'phone', phone: '', normalizedPhone: null, code: '', error: null };

export function normalizeRussianPhone(phone: string): string | null {
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 15 ? digits : null;
}

export function phoneVerificationReducer(state: PhoneVerificationState, action: PhoneVerificationAction): PhoneVerificationState {
  if (state.status === 'complete') return state;
  if (action.type === 'retry') return { ...state, error: null };
  if (action.type === 'phoneChanged' && state.status === 'phone') return { ...state, phone: action.phone, error: null };
  if (action.type === 'requestCode' && state.status === 'phone') {
    const normalizedPhone = normalizeRussianPhone(state.phone);
    return normalizedPhone
      ? { status: 'code', phone: '', normalizedPhone, code: '', error: null }
      : { ...state, error: 'Введите номер телефона: от 10 до 15 цифр.' };
  }
  if (action.type === 'codeChanged' && state.status === 'code') return { ...state, code: action.code.replace(/\D/g, '').slice(0, 6), error: null };
  if (action.type === 'submitCode' && state.status === 'code') {
    if (state.code !== LOCAL_TEST_CODE) return { ...state, error: 'Неверный локальный тестовый код.' };
    return { status: 'complete', phone: '', normalizedPhone: null, code: '', error: null };
  }
  return state;
}
