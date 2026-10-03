import { useEffect, useReducer, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { createExpoSqliteDatabaseFactory } from '../storage/sqlite/expoAdapter';
import { createLocalMessageStore, LOCAL_LOADING_TEXT, type LocalDataSnapshot } from '../messages/localMessageStore';
import { createAsyncPhoneVerificationPreference, type PhoneVerificationPreference } from '../phoneVerification/preferences';
import { initialPhoneVerificationState, LOCAL_TEST_CODE, phoneVerificationReducer } from '../phoneVerification/reducer';
import PreviewAppShell from './PreviewAppShell';

const store = createLocalMessageStore(createExpoSqliteDatabaseFactory());

function PhoneVerificationGate({ preference, onComplete }: { preference: PhoneVerificationPreference; onComplete: () => void }) {
  const [state, dispatch] = useReducer(phoneVerificationReducer, initialPhoneVerificationState);
  const submit = async () => {
    if (state.status === 'phone') { dispatch({ type: 'requestCode' }); return; }
    if (state.status === 'code') {
      if (state.code !== LOCAL_TEST_CODE) { dispatch({ type: 'submitCode' }); return; }
      dispatch({ type: 'submitCode' });
      await preference.setComplete();
      onComplete();
    }
  };
  return <View accessibilityLabel="Локальная проверка телефона">
    <Text>Локальная настройка телефона</Text>
    <Text>Это локальный шаг настройки: SMS и проверка на сервере не выполняются.</Text>
    {state.status === 'phone' ? <TextInput accessibilityLabel="Номер телефона" keyboardType="phone-pad" value={state.phone} onChangeText={(phone) => dispatch({ type: 'phoneChanged', phone })} /> : null}
    {state.status === 'code' ? <><Text>Локальный тестовый код: 000000</Text><TextInput accessibilityLabel="Локальный тестовый код" keyboardType="number-pad" value={state.code} onChangeText={(code) => dispatch({ type: 'codeChanged', code })} /></> : null}
    {state.error ? <Text accessibilityLabel={`Ошибка: ${state.error}`}>{state.error}</Text> : null}
    <Pressable accessibilityRole="button" accessibilityLabel={state.status === 'phone' ? 'Запросить локальный код' : 'Подтвердить локальный код'} onPress={submit}><Text>{state.status === 'phone' ? 'Получить локальный код' : 'Подтвердить'}</Text></Pressable>
    {state.error ? <Pressable accessibilityRole="button" accessibilityLabel="Повторить ввод" onPress={() => dispatch({ type: 'retry' })}><Text>Попробовать ещё раз</Text></Pressable> : null}
  </View>;
}


export function AppShell() {
  const [verified, setVerified] = useState<boolean | null>(null);
  const [snapshot, setSnapshot] = useState<LocalDataSnapshot>(store.getSnapshot());

  const [preference] = useState(createAsyncPhoneVerificationPreference);
  useEffect(() => { void preference.getComplete().then(setVerified).catch(() => setVerified(false)); }, [preference]);
  useEffect(() => { const unsubscribe = store.subscribe(() => setSnapshot(store.getSnapshot())); void store.bootstrap(); return unsubscribe; }, []);
  if (verified === null) return <Text>{LOCAL_LOADING_TEXT}</Text>;
  if (!verified) return <PhoneVerificationGate preference={preference} onComplete={() => setVerified(true)} />;
  return <PreviewAppShell snapshot={snapshot} onClearUnread={(chatId) => store.clearUnread(chatId)} onRetry={() => store.bootstrap()} />;
}
