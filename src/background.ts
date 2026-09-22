// Android scheduling is implemented by CanaryMonitorService + AndroidX WorkManager.
// Expo BackgroundFetch is intentionally not registered: it is not WorkManager and must not be
// described as a 15-minute background guarantee.
export async function registerBackgroundChecks(): Promise<void> {}
