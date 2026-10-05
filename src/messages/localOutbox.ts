import { calculateRetryDelayMs } from '../transport/backoff';
import type { OutboxEntry, SqliteRepositories } from '../storage/sqlite/repositories';
import { getLocalTestModeConfig, type LocalTestModeConfig } from './localTestMode';

export type LocalOutboxTransportResult = { ok: true } | { ok: false; category: 'offline' | 'timeout' | 'failed' | 'terminal' };

export type LocalOutboxTransport = {
  send(item: OutboxEntry): Promise<LocalOutboxTransportResult>;
};

export type LocalOutboxWorker = {
  dispose(): void;
  kick(): Promise<void>;
  setOnline(online: boolean): void;
};

export type LocalOutboxWorkerOptions = {
  onMessageAcked?: (clientMessageId: string) => void;
  onMessageUpdated?: (clientMessageId: string) => void;
  now?: () => Date;
  online?: boolean;
  retryJitter?: () => number;
  setTimeout?: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
  clearTimeout?: (handle: ReturnType<typeof setTimeout>) => void;
  timeoutMs?: number;
};

const DEFAULT_SEND_TIMEOUT_MS = 30_000;

export function createDebugLocalAckTransport(localTestMode: LocalTestModeConfig = getLocalTestModeConfig()): LocalOutboxTransport | null {
  if (!localTestMode.enabled) return null;
  return { send: async () => ({ ok: true }) };
}

export function createLocalOutboxWorker(
  repositories: SqliteRepositories,
  transport: LocalOutboxTransport | null,
  options: LocalOutboxWorkerOptions = {},
): LocalOutboxWorker {
  const now = options.now ?? (() => new Date());
  const jitter = options.retryJitter ?? (() => 0.5);
  const onMessageAcked = options.onMessageAcked;
  const setTimer = options.setTimeout ?? ((callback, delayMs) => setTimeout(callback, delayMs));
  const clearTimer = options.clearTimeout ?? ((handle) => clearTimeout(handle));
  const timeoutMs = options.timeoutMs ?? DEFAULT_SEND_TIMEOUT_MS;
  let online = options.online ?? true;
  const onMessageUpdated = options.onMessageUpdated ?? onMessageAcked;
  let disposed = false;
  let running = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const inFlight = new Set<string>();

  const isoNow = () => now().toISOString();
  const schedule = (delayMs: number) => {
    if (disposed || timer) return;
    timer = setTimer(() => {
      timer = null;
      void pump();
    }, Math.max(0, delayMs));
  };

  const scheduleNextWake = async () => {
    if (disposed || !online || !transport) return;
    const wakeAt = await repositories.readNextOutboxWakeAt();
    if (!wakeAt) return;
    schedule(new Date(wakeAt).getTime() - now().getTime());
  };

  const sendWithTimeout = async (item: OutboxEntry): Promise<LocalOutboxTransportResult> => {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const timeoutPromise = new Promise<LocalOutboxTransportResult>((resolve) => {
      timeout = setTimer(() => resolve({ ok: false, category: 'timeout' }), timeoutMs);
    });
    const sendPromise = transport?.send(item) ?? Promise.resolve<LocalOutboxTransportResult>({ ok: false, category: 'failed' });
    const result = await Promise.race([sendPromise, timeoutPromise]);
    if (timeout) clearTimer(timeout);
    return result;
  };

  const pump = async (): Promise<void> => {
    if (disposed || running || !online || !transport) return;
    running = true;
    try {
      while (!disposed && online) {
        const item = await repositories.readNextSendableOutbox();
        if (disposed) return;
        if (!item) {
          await scheduleNextWake();
          return;
        }
        if (item.nextAttemptAt && new Date(item.nextAttemptAt).getTime() > now().getTime()) {
          schedule(new Date(item.nextAttemptAt).getTime() - now().getTime());
          return;
        }
        if (inFlight.has(item.clientMessageId)) return;
        inFlight.add(item.clientMessageId);
        const result = await sendWithTimeout(item);
        if (disposed) return;
        inFlight.delete(item.clientMessageId);
        if (result.ok) {
          await repositories.ackOutboxMessageSent(item.clientMessageId, isoNow());
          try {
            onMessageUpdated?.(item.clientMessageId);
          } catch {
            // UI refresh is best-effort; the SQLite ack above remains authoritative.
          }
          continue;
        }
        if (result.category === 'terminal') {
          await repositories.markOutboxMessageNotSent(item.clientMessageId, isoNow());
          try {
            onMessageUpdated?.(item.clientMessageId);
          } catch {
            // UI refresh is best-effort; the SQLite transition above remains authoritative.
          }
          continue;
        }
        const attemptCount = item.attemptCount + 1;
        const nextAttemptAt = new Date(now().getTime() + calculateRetryDelayMs(attemptCount, jitter)).toISOString();
        await repositories.markOutboxRetrying(item.clientMessageId, attemptCount, nextAttemptAt, isoNow());
        if (disposed) return;
        await scheduleNextWake();
        return;
      }
    } catch (error) {
      if (!disposed) throw error;
    } finally {
      running = false;
    }
  };

  return {
    dispose() {
      disposed = true;
      if (timer) clearTimer(timer);
      timer = null;
    },
    kick() {
      return pump();
    },
    setOnline(nextOnline) {
      online = nextOnline;
      if (online) void pump();
    },
  };
}
