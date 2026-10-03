import type { SqlDatabase, SqlDatabaseFactory, SqlExecutor, SqlResult, SqlValue } from './contracts';

/**
 * Creates an Expo SQLite-backed database only when called. Nothing is opened at
 * module import time, which keeps production opening explicit and injectable.
 */
export function createExpoSqliteDatabaseFactory(): SqlDatabaseFactory {
  return async (databaseName) => {
    const SQLite = await import('expo-sqlite');
    const database = await SQLite.openDatabaseAsync(databaseName);

    return {
      execute: async (sql: string, params: readonly SqlValue[] = []): Promise<SqlResult> => {
        const result = await database.runAsync(sql, [...params]);
        return { changes: result.changes };
      },
      query: async <T extends Record<string, SqlValue>>(
        sql: string,
        params: readonly SqlValue[] = [],
      ): Promise<T[]> => database.getAllAsync<T>(sql, [...params]),
      transaction: async <T>(work: (transaction: SqlExecutor) => Promise<T>): Promise<T> => {
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
      },
    } satisfies SqlDatabase;
  };
}
