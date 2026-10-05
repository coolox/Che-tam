/* eslint-disable @typescript-eslint/no-var-requires */
const { DatabaseSync } = require('node:sqlite') as {
  DatabaseSync: new (path: string) => {
    close(): void;
    exec(sql: string): void;
    prepare(sql: string): {
      all(...params: unknown[]): Record<string, unknown>[];
      run(...params: unknown[]): { changes: number };
    };
  };
};
const { mkdtempSync, rmSync } = require('fs') as {
  mkdtempSync(prefix: string): string;
  rmSync(path: string, options: { force: boolean; recursive: boolean }): void;
};
const { tmpdir } = require('os') as { tmpdir(): string };
const { join } = require('path') as { join(...parts: string[]): string };
import { createLocalMessageStore } from '../src/messages/localMessageStore';
import { createLocalOutboxWorker, type LocalOutboxTransport } from '../src/messages/localOutbox';
import type { NetworkAvailabilitySource } from '../src/hooks/useConnectionStatus';
import type { SqlDatabase, SqlExecutor, SqlResult, SqlValue } from '../src/storage/sqlite/contracts';
import { migrateDatabase } from '../src/storage/sqlite/migrate';
import { createSqliteRepositories, type OutboxEntry } from '../src/storage/sqlite/repositories';

class RealSqliteDatabase implements SqlDatabase {
  private readonly database: InstanceType<typeof DatabaseSync>;
  private failNextMatching: string | null = null;

  public constructor(path: string) {
    this.database = new DatabaseSync(path);
  }

  public close(): void {
    this.database.close();
  }

  public failNext(statementFragment: string): void {
    this.failNextMatching = statementFragment.toLowerCase();
  }

  async execute(sql: string, params: readonly SqlValue[] = []): Promise<SqlResult> {
    const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
    if (this.failNextMatching !== null && normalized.includes(this.failNextMatching)) {
      this.failNextMatching = null;
      throw new Error(`Injected failure for ${normalized}`);
    }
    if (params.length === 0) {
      this.database.exec(sql);
      return { changes: 0 };
    }
    const result = this.database.prepare(sql).run(...params);
    return { changes: result.changes };
  }

  async query<T extends Record<string, SqlValue>>(sql: string, params: readonly SqlValue[] = []): Promise<T[]> {
    return this.database.prepare(sql).all(...params).map(row => ({ ...row })) as T[];
  }

  async transaction<T>(work: (transaction: SqlExecutor) => Promise<T>): Promise<T> {
    this.database.exec('BEGIN');
    try {
      const result = await work(this);
      this.database.exec('COMMIT');
      return result;
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }
}

const baseTime = Date.parse('2026-10-05T10:00:00.000Z');

function createClock() {
  let tick = 0;
  return () => new Date(baseTime + tick++ * 1000);
}

function createFakeAvailabilitySource() {
  const listeners = new Set<(available: boolean) => void>();
  const source: NetworkAvailabilitySource = {
    addEventListener(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return {
    emit(available: boolean) {
      listeners.forEach(listener => listener(available));
    },
    listenerCount() {
      return listeners.size;
    },
    source,
  };
}

async function eventually(assertion: () => Promise<void> | void): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      await assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }
  throw lastError;
}

async function createSeededStore(options: {
  ids: string[];
  initialNetworkAvailable?: boolean;
  transport?: LocalOutboxTransport;
}) {
  const directory = mkdtempSync(join(tmpdir(), 'che-tam-outbox-'));
  const databasePath = join(directory, 'local.db');
  const opened: RealSqliteDatabase[] = [];
  const open = () => {
    const database = new RealSqliteDatabase(databasePath);
    opened.push(database);
    return database;
  };
  const seedDatabase = open();
  await migrateDatabase(seedDatabase, '2026-10-05T10:00:00.000Z');
  const seedRepositories = createSqliteRepositories(seedDatabase);
  await seedRepositories.upsertProfile({ id: 'local-self', displayName: 'Вы', avatarUrl: null, updatedAt: '2026-10-05T10:00:00.000Z' });
  await seedRepositories.upsertChat({ id: 'chat-1', title: 'Семья', kind: 'direct', lastMessageAt: null, unreadCount: 0, updatedAt: '2026-10-05T10:00:00.000Z' });
  seedDatabase.close();

  const ids = [...options.ids];
  const sentClientIds: string[] = [];
  const transport = options.transport ?? {
    send: async (item: OutboxEntry) => {
      sentClientIds.push(item.clientMessageId);
      return { ok: true };
    },
  } satisfies LocalOutboxTransport;
  const availability = createFakeAvailabilitySource();
  const store = createLocalMessageStore(async () => open(), 'local.db', {
    developmentSeedEnabled: false,
    idFactory: () => ids.shift() ?? 'missing-id',
    initialNetworkAvailable: options.initialNetworkAvailable,
    networkAvailabilitySource: availability.source,
    now: createClock(),
    transport,
  });
  await store.bootstrap();

  const cleanup = () => {
    store.dispose();
    for (const database of opened) {
      try { database.close(); } catch { /* already closed */ }
    }
    rmSync(directory, { force: true, recursive: true });
  };
  const inspect = async () => {
    const database = open();
    await database.execute('PRAGMA foreign_keys = ON');
    const repositories = createSqliteRepositories(database);
    return { database, repositories };
  };

  return { availability, cleanup, inspect, open, sentClientIds, transport, store };
}

describe('local outbox on real SQLite', () => {
  it('optimistically stores a sent composer message and receives a deterministic local ack', async () => {
    const context = await createSeededStore({ ids: ['cm-send'] });
    try {
      await context.store.sendTextMessage('chat-1', '  Привет  ');

      expect(context.store.getSnapshot().messagesByChat['chat-1']).toMatchObject([
        { id: 'cm-send', text: 'Привет', delivered: false },
      ]);
      expect(context.store.getSnapshot().chats[0]).toMatchObject({ lastMessage: 'Привет', time: '12:00' });
      context.availability.emit(true);
      await eventually(async () => expect(context.sentClientIds).toEqual(['cm-send']));
      await eventually(() => expect(context.store.getSnapshot().messagesByChat['chat-1']).toMatchObject([
        { id: 'cm-send', text: 'Привет', delivered: true },
      ]));
      const { database, repositories } = await context.inspect();
      expect(await repositories.readOutbox()).toEqual([]);
      expect((await repositories.listMessages('chat-1'))[0]).toMatchObject({ clientMessageId: 'cm-send', deliveryState: 'sent' });
      database.close();
    } finally {
      context.cleanup();
    }
  });

  it('does not start offline sends and drains queued items when the fake source becomes available', async () => {
    const context = await createSeededStore({ ids: ['cm-offline'], initialNetworkAvailable: false });
    try {
      await context.store.sendTextMessage('chat-1', 'На связи позже');
      expect(context.sentClientIds).toEqual([]);
      let inspected = await context.inspect();
      expect((await inspected.repositories.readOutbox()).map(item => item.state)).toEqual(['queued']);
      inspected.database.close();

      expect(context.availability.listenerCount()).toBe(1);
      context.availability.emit(true);
      await eventually(async () => expect(context.sentClientIds).toEqual(['cm-offline']));
      inspected = await context.inspect();
      expect(await inspected.repositories.readOutbox()).toEqual([]);
      inspected.database.close();

      context.store.dispose();
      expect(context.availability.listenerCount()).toBe(0);
    } finally {
      context.cleanup();
    }
  });

  it('processes two queued messages in created order', async () => {
    const context = await createSeededStore({ ids: ['cm-1', 'cm-2'], initialNetworkAvailable: false });
    try {
      await context.store.sendTextMessage('chat-1', 'Первое');
      await context.store.sendTextMessage('chat-1', 'Второе');

      context.availability.emit(true);
      await eventually(async () => expect(context.sentClientIds).toEqual(['cm-1', 'cm-2']));
    } finally {
      context.cleanup();
    }
  });

  it('keeps a queued item across restart and drains it after bootstrap returns online', async () => {
    const context = await createSeededStore({ ids: ['cm-restart'], initialNetworkAvailable: false });
    try {
      await context.store.sendTextMessage('chat-1', 'После перезапуска');
      let inspected = await context.inspect();
      expect((await inspected.repositories.readOutbox()).map(item => item.clientMessageId)).toEqual(['cm-restart']);
      inspected.database.close();
      context.store.dispose();

      const restarted = createLocalMessageStore(async () => context.open(), 'local.db', {
        developmentSeedEnabled: false,
        idFactory: () => 'unused',
        initialNetworkAvailable: false,
        networkAvailabilitySource: context.availability.source,
        now: createClock(),
        transport: context.transport,
      });
      await restarted.bootstrap();
      expect(restarted.getSnapshot().messagesByChat['chat-1']).toMatchObject([
        { id: 'cm-restart', text: 'После перезапуска', delivered: false },
      ]);
      inspected = await context.inspect();
      expect((await inspected.repositories.readOutbox()).map(item => item.clientMessageId)).toEqual(['cm-restart']);
      inspected.database.close();

      context.availability.emit(true);
      await eventually(async () => expect(context.sentClientIds).toEqual(['cm-restart']));
      restarted.dispose();
    } finally {
      context.cleanup();
    }
  });

  it('keeps one message, one outbox item, and one client id when an existing item is handled again', async () => {
    const context = await createSeededStore({ ids: ['cm-once', 'cm-once'], initialNetworkAvailable: false });
    try {
      await context.store.sendTextMessage('chat-1', 'Без дубля');
      await context.store.sendTextMessage('chat-1', 'Без дубля');

      expect(context.store.getSnapshot().messagesByChat['chat-1'].map(message => message.id)).toEqual(['cm-once']);
      const inspected = await context.inspect();
      const messages = await inspected.repositories.listMessages('chat-1');
      const outbox = await inspected.repositories.readOutbox();
      expect(messages.map(message => message.clientMessageId)).toEqual(['cm-once']);
      expect(outbox.map(item => item.clientMessageId)).toEqual(['cm-once']);
      inspected.database.close();
    } finally {
      context.cleanup();
    }
  });

  it('rolls back a failed atomic ack and retries the same client message id without a duplicate', async () => {
    const context = await createSeededStore({ ids: ['cm-atomic'], initialNetworkAvailable: false });
    try {
      await context.store.sendTextMessage('chat-1', 'Атомарно');
      const inspected = await context.inspect();
      inspected.database.failNext('DELETE FROM outbox');
      const repositories = createSqliteRepositories(inspected.database);
      const sentClientIds: string[] = [];
      const worker = createLocalOutboxWorker(repositories, {
        send: async (item) => {
          sentClientIds.push(item.clientMessageId);
          return { ok: true };
        },
      }, { now: createClock(), online: true });

      await expect(worker.kick()).rejects.toThrow('Injected failure');
      expect(sentClientIds).toEqual(['cm-atomic']);
      expect((await repositories.listMessages('chat-1'))[0]).toMatchObject({ clientMessageId: 'cm-atomic', deliveryState: 'queued' });
      expect((await repositories.readOutbox()).map(item => item.clientMessageId)).toEqual(['cm-atomic']);

      await worker.kick();
      expect(sentClientIds).toEqual(['cm-atomic', 'cm-atomic']);
      expect((await repositories.listMessages('chat-1'))[0]).toMatchObject({ clientMessageId: 'cm-atomic', deliveryState: 'sent' });
      expect(await repositories.readOutbox()).toEqual([]);

      worker.dispose();
      inspected.database.close();
    } finally {
      context.cleanup();
    }
  });
});
