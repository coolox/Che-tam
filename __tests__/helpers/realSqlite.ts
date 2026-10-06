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
import type { SqlDatabase, SqlExecutor, SqlResult, SqlValue } from '../../src/storage/sqlite/contracts';

export class RealSqliteDatabase implements SqlDatabase {
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

export function withTempSqlitePath<T>(prefix: string, work: (databasePath: string) => Promise<T>): Promise<T> {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  return work(join(directory, 'local.db')).finally(() => {
    rmSync(directory, { force: true, recursive: true });
  });
}
