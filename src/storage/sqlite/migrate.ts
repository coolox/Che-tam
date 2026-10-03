import type { SqlDatabase } from './contracts';
import { CREATE_SCHEMA_MIGRATIONS, SCHEMA_V1_STATEMENTS, SCHEMA_VERSION } from './schema';

export async function migrateDatabase(database: SqlDatabase, appliedAt: string): Promise<void> {
  await database.transaction(async (transaction) => {
    await transaction.execute('PRAGMA foreign_keys = ON');
    await transaction.execute(CREATE_SCHEMA_MIGRATIONS);
    const existing = await transaction.query<{ version: number }>(
      'SELECT version FROM schema_migrations WHERE version = ?',
      [SCHEMA_VERSION],
    );

    if (existing.length > 0) {
      return;
    }

    for (const statement of SCHEMA_V1_STATEMENTS) {
      await transaction.execute(statement);
    }
    await transaction.execute('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)', [
      SCHEMA_VERSION,
      appliedAt,
    ]);
  });
}
