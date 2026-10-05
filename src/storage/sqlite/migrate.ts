import type { SqlDatabase } from './contracts';
import { CREATE_SCHEMA_MIGRATIONS, SCHEMA_V1_STATEMENTS, SCHEMA_V2_STATEMENTS } from './schema';

export async function migrateDatabase(database: SqlDatabase, appliedAt: string): Promise<void> {
  await database.execute('PRAGMA foreign_keys = ON');
  await database.transaction(async (transaction) => {
    await transaction.execute(CREATE_SCHEMA_MIGRATIONS);
    const existing = await transaction.query<{ version: number }>('SELECT version FROM schema_migrations');
    const appliedVersions = new Set(existing.map((row) => row.version));

    if (!appliedVersions.has(1)) {
      for (const statement of SCHEMA_V1_STATEMENTS) {
        await transaction.execute(statement);
      }
      await transaction.execute('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)', [
        1,
        appliedAt,
      ]);
    }

    if (!appliedVersions.has(2)) {
      for (const statement of SCHEMA_V2_STATEMENTS) {
        await transaction.execute(statement);
      }
      await transaction.execute('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)', [
        2,
        appliedAt,
      ]);
    }
  });
}
