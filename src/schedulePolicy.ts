import { CHECK_INTERVAL_MS } from './config';

export function shouldRunScheduledCheck(
  lastAttemptUtc: string | undefined,
  now = new Date(),
): boolean {
  if (!lastAttemptUtc) {
    return true;
  }
  const lastMs = Date.parse(lastAttemptUtc);
  if (Number.isNaN(lastMs)) {
    return true;
  }
  return now.getTime() - lastMs >= CHECK_INTERVAL_MS;
}

export function estimateMonthlyTrafficKb(): number {
  const checksPerMonth = 30 * 24 * 6;
  const estimatedHttpsKb = 0.6;
  const estimatedWsKb = 0.4;
  return checksPerMonth * (estimatedHttpsKb + estimatedWsKb);
}
