jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn() }));

import * as SQLite from 'expo-sqlite';
import { createExpoSqliteDatabaseFactory } from '../src/storage/sqlite/expoAdapter';
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
});
