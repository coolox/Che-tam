jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn() }));

import * as SQLite from 'expo-sqlite';
import { createExpoSqliteDatabaseFactory, createSqliteOperationQueue } from '../src/storage/sqlite/expoAdapter';
import { migrateDatabase } from '../src/storage/sqlite/migrate';

const openDatabaseAsync = SQLite.openDatabaseAsync as jest.Mock;

describe('Expo SQLite adapter', () => {
  it('enables foreign keys immediately after open and before migrations use the database', async () => {
    const calls: string[] = [];
    const transaction = {
      runAsync: jest.fn(async (sql: string) => { calls.push(sql); return { changes: 0 }; }),
      getAllAsync: jest.fn(async () => []),
    };
    const database = {
      ...transaction,
      withExclusiveTransactionAsync: jest.fn(async (work: (executor: typeof transaction) => Promise<unknown>) => { await work(transaction); }),
    };
    openDatabaseAsync.mockResolvedValue(database);

    const factory = createExpoSqliteDatabaseFactory();
    const adapter = await factory('test.db');
    await migrateDatabase(adapter, '2026-10-03T12:00:00.000Z');

    expect(openDatabaseAsync).toHaveBeenCalledWith('test.db');
    expect(calls[0]).toBe('PRAGMA foreign_keys = ON');
    expect(calls.indexOf('PRAGMA foreign_keys = ON')).toBeLessThan(calls.findIndex((sql) => sql.includes('CREATE TABLE IF NOT EXISTS schema_migrations')));
  });

  it('serializes adapter operations and recovers the queue after a rejected operation', async () => {
    const enqueue = createSqliteOperationQueue();
    const calls: string[] = [];
    let releaseFirst: () => void = () => undefined;

    const first = enqueue(async () => {
      calls.push('first:start');
      await new Promise<void>((resolve) => { releaseFirst = resolve; });
      calls.push('first:end');
      return 'first';
    });
    const second = enqueue(async () => {
      calls.push('second:start');
      throw new Error('Injected queue failure');
    });
    const third = enqueue(async () => {
      calls.push('third:start');
      return 'third';
    });

    await Promise.resolve();
    expect(calls).toEqual(['first:start']);
    releaseFirst();

    await expect(first).resolves.toBe('first');
    await expect(second).rejects.toThrow('Injected queue failure');
    await expect(third).resolves.toBe('third');
    expect(calls).toEqual(['first:start', 'first:end', 'second:start', 'third:start']);
  });
});
