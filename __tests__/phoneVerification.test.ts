jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(), setItem: jest.fn() },
}));
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));
jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }));
jest.mock('react-native-keyboard-controller', () => ({
  KeyboardAvoidingView: 'KeyboardAvoidingView',
  KeyboardProvider: ({ children }: { children: unknown }) => children,
}));

import { createInMemoryPhoneVerificationPreference } from '../src/phoneVerification/preferences';
import { initialPhoneVerificationState, normalizeRussianPhone, phoneVerificationReducer } from '../src/phoneVerification/reducer';
import {
  getPhoneSetupViewModel,
  PHONE_SETUP_CODE_INPUT_PROPS,
  PHONE_SETUP_PHONE_INPUT_PROPS,
  PHONE_SETUP_RETRY_TEXT,
} from '../src/app/AppShell';

describe('local phone verification', () => {
  it('validates the phone, gates code submission, rejects a wrong code, and removes sensitive values on completion', () => {
    expect(normalizeRussianPhone('+7 (999) 123-45-67')).toBe('79991234567');
    let state = phoneVerificationReducer(initialPhoneVerificationState, { type: 'phoneChanged', phone: '12' });
    state = phoneVerificationReducer(state, { type: 'requestCode' });
    expect(state).toMatchObject({ status: 'phone', error: 'Введите номер телефона: от 10 до 15 цифр.' });
    expect(phoneVerificationReducer(initialPhoneVerificationState, { type: 'submitCode' })).toEqual(initialPhoneVerificationState);
    state = phoneVerificationReducer(state, { type: 'phoneChanged', phone: '+7 999 123 45 67' });
    state = phoneVerificationReducer(state, { type: 'requestCode' });
    expect(state.status).toBe('code');
    if (state.status !== 'code') throw new Error('Expected code state');
    state = phoneVerificationReducer(state, { type: 'codeChanged', code: '123456' });
    state = phoneVerificationReducer(state, { type: 'submitCode' });
    expect(state).toMatchObject({ status: 'code', error: 'Неверный локальный тестовый код.' });
    state = phoneVerificationReducer(state, { type: 'codeChanged', code: '000000' });
    state = phoneVerificationReducer(state, { type: 'submitCode' });
    expect(state).toEqual({ status: 'complete', phone: '', normalizedPhone: null, code: '', error: null });
  });

  it('persists and restores only boolean completion', async () => {
    const preference = createInMemoryPhoneVerificationPreference();
    expect(await preference.getComplete()).toBe(false);
    await preference.setComplete();
    expect(await preference.getComplete()).toBe(true);
  });

  it('exposes local setup input props and visible state without showing retry for inline validation', () => {
    expect(PHONE_SETUP_PHONE_INPUT_PROPS).toEqual({
      accessibilityLabel: 'Номер телефона',
      keyboardType: 'phone-pad',
      placeholder: '+993 …',
    });
    expect(PHONE_SETUP_CODE_INPUT_PROPS).toEqual({
      accessibilityLabel: 'Код подтверждения',
      keyboardType: 'number-pad',
      maxLength: 6,
      placeholder: '000000',
    });
    expect(PHONE_SETUP_RETRY_TEXT).toBe('Попробовать ещё раз');

    let state = phoneVerificationReducer(initialPhoneVerificationState, { type: 'phoneChanged', phone: '12' });
    expect(getPhoneSetupViewModel(state)).toMatchObject({
      phoneInputVisible: true,
      phoneError: 'Введите номер телефона: от 10 до 15 цифр.',
      primaryDisabled: true,
      retryVisible: false,
    });

    state = phoneVerificationReducer(state, { type: 'phoneChanged', phone: '+993 12 345 6789' });
    expect(getPhoneSetupViewModel(state)).toMatchObject({ phoneError: null, primaryDisabled: false });
    state = phoneVerificationReducer(state, { type: 'requestCode' });
    if (state.status !== 'code') throw new Error('Expected code state');
    expect(getPhoneSetupViewModel(state)).toMatchObject({ codeInputVisible: true, primaryDisabled: true, retryVisible: false });
    state = phoneVerificationReducer(state, { type: 'codeChanged', code: '1234567' });
    expect(state.code).toBe('123456');
    state = phoneVerificationReducer(state, { type: 'submitCode' });
    expect(getPhoneSetupViewModel(state)).toMatchObject({
      codeError: 'Неверный локальный тестовый код.',
      primaryDisabled: false,
      retryVisible: true,
    });
  });
});
