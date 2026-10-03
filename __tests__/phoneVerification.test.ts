jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(), setItem: jest.fn() },
}));

import { createInMemoryPhoneVerificationPreference } from '../src/phoneVerification/preferences';
import { initialPhoneVerificationState, normalizeRussianPhone, phoneVerificationReducer } from '../src/phoneVerification/reducer';

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
});
