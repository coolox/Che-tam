import * as Sharing from 'expo-sharing';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import './src/background';
import { runConnectivityCheck } from './src/checks';
import { getConfiguredEndpoint } from './src/config';
import { createJournalExport } from './src/exportJournal';
import { getCoarseNetworkType } from './src/networkInfo';
import { countFailuresSince, findLastSuccess, loadRecords } from './src/storage';
import { CanaryRecord } from './src/types';
import { registerBackgroundChecks } from './src/background';

function formatDate(value?: string): string {
  if (!value) {
    return 'нет данных';
  }
  return new Date(value).toLocaleString('ru-RU', {
    timeZone: 'UTC',
    hour12: false,
  });
}

function resultText(records: CanaryRecord[]): string {
  if (records.length === 0) {
    return 'Ожидает первой проверки';
  }
  const latest = records.slice(-2);
  if (latest.every(record => record.success)) {
    return 'Связь есть';
  }
  if (latest.some(record => record.success)) {
    return 'Частичная связь';
  }
  return 'Связи нет';
}

export default function App() {
  const [records, setRecords] = useState<CanaryRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>('');

  const reload = useCallback(async () => {
    setRecords(await loadRecords());
  }, []);

  useEffect(() => {
    void reload();
    void registerBackgroundChecks();
  }, [reload]);

  const lastSuccess = useMemo(() => findLastSuccess(records), [records]);
  const failures24h = useMemo(() => {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    return countFailuresSince(records, since);
  }, [records]);
  const latest = records[records.length - 1];

  const runManualCheck = useCallback(async () => {
    setBusy(true);
    setMessage('');
    try {
      const networkType = await getCoarseNetworkType();
      const result = await runConnectivityCheck({
        endpoint: getConfiguredEndpoint(),
        networkType,
      });
      await reload();
      const okCount = result.records.filter(record => record.success).length;
      setMessage(`Проверка завершена: ${okCount} из 2 успешны`);
    } catch (_error) {
      setMessage('Проверка не выполнена');
    } finally {
      setBusy(false);
    }
  }, [reload]);

  const exportJournal = useCallback(async () => {
    setBusy(true);
    setMessage('');
    try {
      const uri = await createJournalExport();
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/json',
          dialogTitle: 'Экспорт журнала',
        });
      }
      setMessage('Журнал подготовлен для отправки');
    } catch (_error) {
      setMessage('Не удалось подготовить журнал');
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Hearth Canary</Text>

        <View style={styles.panel}>
          <Text style={styles.label}>Текущий результат</Text>
          <Text style={styles.result}>{resultText(records)}</Text>
          <Text style={styles.detail}>
            Последняя запись: {formatDate(latest?.timestampUtc)} UTC
          </Text>
          <Text style={styles.detail}>
            Тип сети: {latest?.networkType ?? 'нет данных'}
          </Text>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.label}>Последний успех</Text>
            <Text style={styles.statValue}>{formatDate(lastSuccess?.timestampUtc)}</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.label}>Ошибки за 24 часа</Text>
            <Text style={styles.statValue}>{failures24h}</Text>
          </View>
        </View>

        {message ? <Text style={styles.message}>{message}</Text> : null}

        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={runManualCheck}
            style={({ pressed }) => [
              styles.primaryButton,
              (busy || pressed) && styles.buttonPressed,
            ]}>
            {busy ? <ActivityIndicator color="#fff" /> : null}
            <Text style={styles.primaryButtonText}>Проверить сейчас</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={exportJournal}
            style={({ pressed }) => [
              styles.secondaryButton,
              (busy || pressed) && styles.buttonPressed,
            ]}>
            <Text style={styles.secondaryButtonText}>Экспорт журнала</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f7f5f0',
  },
  container: {
    flexGrow: 1,
    padding: 24,
    gap: 18,
  },
  title: {
    color: '#17201b',
    fontSize: 28,
    fontWeight: '700',
  },
  panel: {
    backgroundColor: '#ffffff',
    borderColor: '#d9d5cb',
    borderRadius: 8,
    borderWidth: 1,
    padding: 18,
    gap: 8,
  },
  label: {
    color: '#58625c',
    fontSize: 13,
    fontWeight: '600',
  },
  result: {
    color: '#0d3b2e',
    fontSize: 30,
    fontWeight: '700',
  },
  detail: {
    color: '#3e4842',
    fontSize: 15,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  statBox: {
    flex: 1,
    minHeight: 104,
    backgroundColor: '#ffffff',
    borderColor: '#d9d5cb',
    borderRadius: 8,
    borderWidth: 1,
    padding: 16,
    gap: 8,
  },
  statValue: {
    color: '#17201b',
    fontSize: 18,
    fontWeight: '700',
  },
  message: {
    color: '#26332c',
    fontSize: 15,
  },
  actions: {
    marginTop: 'auto',
    gap: 12,
  },
  primaryButton: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    backgroundColor: '#116149',
    borderRadius: 8,
    paddingHorizontal: 16,
  },
  secondaryButton: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderColor: '#116149',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 16,
  },
  buttonPressed: {
    opacity: 0.7,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButtonText: {
    color: '#116149',
    fontSize: 16,
    fontWeight: '700',
  },
});
