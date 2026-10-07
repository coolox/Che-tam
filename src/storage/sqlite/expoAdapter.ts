import * as SQLite from 'expo-sqlite';
import type { SqlDatabase, SqlDatabaseFactory, SqlExecutor, SqlResult, SqlValue } from './contracts';

type QueuedOperation<T> = () => Promise<T>;

export function createSqliteOperationQueue(): <T>(operation: QueuedOperation<T>) => Promise<T> {
  let tail: Promise<unknown> = Promise.resolve();

  return <T>(operation: QueuedOperation<T>): Promise<T> => {
    const run = tail.then(operation, operation);
    tail = run.catch(() => undefined);
    return run;
  };
}

/**
 * Creates an Expo SQLite-backed database only when called. Nothing is opened at
 * module import time, which keeps production opening explicit and injectable.
 */
export function createExpoSqliteDatabaseFactory(): SqlDatabaseFactory {
  return async (databaseName) => {
    const database = await SQLite.openDatabaseAsync(databaseName);
    const enqueue = createSqliteOperationQueue();
    await enqueue(async () => { await database.runAsync('PRAGMA foreign_keys = ON'); });

    return {
      execute: async (sql: string, params: readonly SqlValue[] = []): Promise<SqlResult> => {
        return enqueue(async () => {
          const result = await database.runAsync(sql, [...params]);
          return { changes: result.changes };
        });
      },
      query: async <T extends Record<string, SqlValue>>(
        sql: string,
        params: readonly SqlValue[] = [],
      ): Promise<T[]> => enqueue(() => database.getAllAsync<T>(sql, [...params])),
      transaction: async <T>(work: (transaction: SqlExecutor) => Promise<T>): Promise<T> => {
        return enqueue(async () => {
          let value: T | undefined;
          await database.withExclusiveTransactionAsync(async (transaction) => {
            const executor: SqlExecutor = {
              execute: async (sql, params = []) => {
                const result = await transaction.runAsync(sql, [...params]);
                return { changes: result.changes };
              },
              query: async <Row extends Record<string, SqlValue>>(
                sql: string,
                params: readonly SqlValue[] = [],
              ) => transaction.getAllAsync<Row>(sql, [...params]),
            };
            value = await work(executor);
          });
          return value as T;
        });
      },
    } satisfies SqlDatabase;
  };
}
