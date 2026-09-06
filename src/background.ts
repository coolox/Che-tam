import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';

import { BACKGROUND_TASK_NAME, CHECK_INTERVAL_MINUTES, getConfiguredEndpoint } from './config';
import { runConnectivityCheck } from './checks';
import { getCoarseNetworkType } from './networkInfo';
import { shouldRunScheduledCheck } from './schedulePolicy';
import { loadRecords } from './storage';

TaskManager.defineTask(BACKGROUND_TASK_NAME, async () => {
  try {
    const records = await loadRecords();
    const latestAttempt = records[records.length - 1]?.timestampUtc;
    if (!shouldRunScheduledCheck(latestAttempt)) {
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    const networkType = await getCoarseNetworkType();
    await runConnectivityCheck({
      endpoint: getConfiguredEndpoint(),
      networkType,
    });
    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch (_error) {
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

export async function registerBackgroundChecks(): Promise<void> {
  const status = await BackgroundFetch.getStatusAsync();
  if (
    status === BackgroundFetch.BackgroundFetchStatus.Restricted ||
    status === BackgroundFetch.BackgroundFetchStatus.Denied
  ) {
    return;
  }

  const alreadyRegistered = await TaskManager.isTaskRegisteredAsync(
    BACKGROUND_TASK_NAME,
  );
  if (alreadyRegistered) {
    return;
  }

  await BackgroundFetch.registerTaskAsync(BACKGROUND_TASK_NAME, {
    minimumInterval: CHECK_INTERVAL_MINUTES * 60,
    stopOnTerminate: false,
    startOnBoot: true,
  });
}
