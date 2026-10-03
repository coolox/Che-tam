export type SqlValue = string | number | null;

export type SqlResult = { changes: number };

export interface SqlExecutor {
  execute(sql: string, params?: readonly SqlValue[]): Promise<SqlResult>;
  query<T extends Record<string, SqlValue>>(sql: string, params?: readonly SqlValue[]): Promise<T[]>;
}

export interface SqlDatabase extends SqlExecutor {
  transaction<T>(work: (transaction: SqlExecutor) => Promise<T>): Promise<T>;
}

export type SqlDatabaseFactory = (databaseName: string) => Promise<SqlDatabase>;
