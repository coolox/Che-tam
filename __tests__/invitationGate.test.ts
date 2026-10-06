jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(() => Promise.resolve(null)), setItem: jest.fn(() => Promise.resolve()) },
}));
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));
jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }));
jest.mock('react-native-keyboard-controller', () => ({
  KeyboardAvoidingView: 'KeyboardAvoidingView',
  KeyboardProvider: ({ children }: { children: unknown }) => children,
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({ children }: { children: unknown }) => children,
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}));

import React from 'react';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const TestRenderer = require('react-test-renderer') as {
  act(callback: () => Promise<void> | void): Promise<void>;
  create(element: React.ReactElement): ReactTestRenderer;
};
import { Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { createInMemoryInvitationAdmissionPreference } from '../src/invitationGate/preferences';
import {
  initialInvitationGateState,
  invitationGateReducer,
  LOCAL_TEST_INVITE_CODE,
  normalizeDisplayName,
} from '../src/invitationGate/reducer';
import {
  getInvitationGateViewModel,
  InvitationGate,
  INVITATION_GATE_CODE_INPUT_PROPS,
  INVITATION_GATE_NAME_INPUT_PROPS,
  INVITATION_GATE_RETRY_TEXT,
} from '../src/app/AppShell';
import { ThemeProvider } from '../src/ui/theme';

type ReactTestInstance = {
  findAllByType(type: unknown): ReactTestInstance[];
  findAllByProps(props: Record<string, unknown>): ReactTestInstance[];
  props: Record<string, unknown>;
};

type ReactTestRenderer = {
  root: ReactTestInstance;
};

const { act } = TestRenderer;

function collectText(node: ReactTestInstance): string {
  return node.findAllByType(Text).map((text: ReactTestInstance) => text.props.children).flat().join('\n');
}

describe('local invitation gate', () => {
  it('validates input, rejects normal local mode, and accepts only the documented localtest code', () => {
    expect(LOCAL_TEST_INVITE_CODE).toBe('ТЕСТ');
    expect(normalizeDisplayName('  Айгуль   М.  ')).toBe('Айгуль М.');

    let state = invitationGateReducer(initialInvitationGateState, { type: 'inviteCodeChanged', inviteCode: 'WRONG' });
    state = invitationGateReducer(state, { type: 'submit', localTestModeEnabled: true });
    expect(state).toMatchObject({ status: 'editing', error: 'Введите имя, которое увидит семья.' });

    state = invitationGateReducer(state, { type: 'displayNameChanged', displayName: ' Айгуль ' });
    state = invitationGateReducer(state, { type: 'submit', localTestModeEnabled: false });
    expect(state).toMatchObject({ status: 'editing', error: 'Код приглашения выдаёт Арслан. В этой локальной версии серверной проверки нет.' });

    state = invitationGateReducer(state, { type: 'submit', localTestModeEnabled: true });
    expect(state).toMatchObject({ status: 'editing', error: 'Неверный локальный тестовый код приглашения.' });

    state = invitationGateReducer(state, { type: 'inviteCodeChanged', inviteCode: LOCAL_TEST_INVITE_CODE });
    state = invitationGateReducer(state, { type: 'submit', localTestModeEnabled: true });
    expect(state).toEqual({ status: 'complete', inviteCode: '', displayName: 'Айгуль', error: null });
  });

  it('accepts the documented localtest invite code after Unicode trim and case normalization only in localtest mode', () => {
    ['ТЕСТ', 'тест', '  ТЕСТ  ', 'TEST', 'test', ' Test '].forEach((inviteCode) => {
      let state = invitationGateReducer(initialInvitationGateState, { type: 'inviteCodeChanged', inviteCode });
      state = invitationGateReducer(state, { type: 'displayNameChanged', displayName: ' Айгуль ' });
      expect(invitationGateReducer(state, { type: 'submit', localTestModeEnabled: true })).toEqual({
        status: 'complete',
        inviteCode: '',
        displayName: 'Айгуль',
        error: null,
      });
      expect(invitationGateReducer(state, { type: 'submit', localTestModeEnabled: false })).toMatchObject({
        status: 'editing',
        error: 'Код приглашения выдаёт Арслан. В этой локальной версии серверной проверки нет.',
      });
    });
  });

  it('rejects invalid localtest invite values', () => {
    ['WRONG', 'ТЕСТ1', 'TEST1', 'ТЕС'].forEach((inviteCode) => {
      let state = invitationGateReducer(initialInvitationGateState, { type: 'inviteCodeChanged', inviteCode });
      state = invitationGateReducer(state, { type: 'displayNameChanged', displayName: 'Айгуль' });
      expect(invitationGateReducer(state, { type: 'submit', localTestModeEnabled: true })).toMatchObject({
        status: 'editing',
        error: 'Неверный локальный тестовый код приглашения.',
      });
    });
  });

  it('persists admission with display name through the preference boundary', async () => {
    const preference = createInMemoryInvitationAdmissionPreference();
    await expect(preference.getAdmission()).resolves.toEqual({ admitted: false, displayName: null });
    await preference.setAdmitted('Айгуль М.');
    await expect(preference.getAdmission()).resolves.toEqual({ admitted: true, displayName: 'Айгуль М.' });
  });

  it('exposes invitation view model and input props without phone or network alternatives', () => {
    expect(INVITATION_GATE_CODE_INPUT_PROPS).toEqual({
      accessibilityLabel: 'Код приглашения',
      autoCapitalize: 'characters',
      placeholder: 'Код приглашения',
    });
    expect(INVITATION_GATE_NAME_INPUT_PROPS).toEqual({
      accessibilityLabel: 'Как вас зовут',
      autoCapitalize: 'words',
      placeholder: 'Как вас зовут',
    });
    expect(INVITATION_GATE_RETRY_TEXT).toBe('Попробовать ещё раз');

    expect(getInvitationGateViewModel(initialInvitationGateState, false)).toMatchObject({
      localTestHint: null,
      normalModeExplanation: 'Код приглашения выдаёт Арслан лично. В локальной версии нет серверной проверки.',
      primaryDisabled: true,
    });
    expect(getInvitationGateViewModel(initialInvitationGateState, true)).toMatchObject({
      localTestHint: `Тестовый код: ${LOCAL_TEST_INVITE_CODE}`,
      primaryDisabled: true,
    });
  });

  it('renders the invitation gate copy and excludes the old phone flow from active source', async () => {
    const preference = createInMemoryInvitationAdmissionPreference();
    let completedName: string | null = null;
    let renderer: ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(SafeAreaProvider, null,
          React.createElement(ThemeProvider, null,
            React.createElement(InvitationGate, {
              localTestModeEnabled: true,
              preference,
              onComplete: (displayName: string) => { completedName = displayName; },
            }),
          ),
        ),
      );
    });

    const root = renderer!.root;
    const text = collectText(root);
    expect(text).toContain('Вход по приглашению');
    expect(text).toContain('Код приглашения');
    expect(text).toContain('Как вас зовут');
    expect(text).toContain(`Тестовый код: ${LOCAL_TEST_INVITE_CODE}`);
    expect(text).not.toContain('Номер телефона');
    expect(text).not.toContain('SMS');
    expect(text).not.toContain('СМС');

    const inputs = root.findAllByType('TextInput');
    const changeFirstInput = inputs[0].props.onChangeText as (value: string) => void;
    const changeSecondInput = inputs[1].props.onChangeText as (value: string) => void;
    await act(async () => {
      changeFirstInput(LOCAL_TEST_INVITE_CODE);
      changeSecondInput(' Айгуль ');
    });
    const button = root.findAllByProps({ accessibilityLabel: 'Продолжить' })[0];
    const pressSubmit = button.props.onPress as () => Promise<void>;
    await act(async () => {
      await pressSubmit();
    });

    expect(completedName).toBe('Айгуль');
    await expect(preference.getAdmission()).resolves.toEqual({ admitted: true, displayName: 'Айгуль' });
  });
});
