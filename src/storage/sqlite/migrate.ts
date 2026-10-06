import type { SqlDatabase } from './contracts';
import { CREATE_SCHEMA_MIGRATIONS, SQLITE_MIGRATIONS } from './schema';

type SqliteMigration = {
  version: number;
  statements: readonly string[];
};

function validateMigrations(migrations: readonly SqliteMigration[]): void {
  const seen = new Set<number>();
  migrations.forEach((migration, index) => {
    const expected = index + 1;
    if (migration.version !== expected) {
      throw new Error(`SQLite migrations must be contiguous from 1; expected ${expected}, got ${migration.version}`);
    }
    if (seen.has(migration.version)) {
      throw new Error(`Duplicate SQLite migration version ${migration.version}`);
    }
    seen.add(migration.version);
  });
}

export function listSqliteMigrationVersions(): number[] {
  validateMigrations(SQLITE_MIGRATIONS);
  return SQLITE_MIGRATIONS.map((migration) => migration.version);
}

export async function migrateDatabase(database: SqlDatabase, appliedAt: string): Promise<void> {
  validateMigrations(SQLITE_MIGRATIONS);
  await database.execute('PRAGMA foreign_keys = ON');
  await database.transaction(async (transaction) => {
    await transaction.execute(CREATE_SCHEMA_MIGRATIONS);
    const existing = await transaction.query<{ version: number }>('SELECT version FROM schema_migrations');
    const appliedVersions = new Set(existing.map((row) => row.version));

    for (const migration of SQLITE_MIGRATIONS) {
      if (appliedVersions.has(migration.version)) continue;
      for (const statement of migration.statements) {
        await transaction.execute(statement);
      }
      await transaction.execute('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)', [
        migration.version,
        appliedAt,
      ]);
      appliedVersions.add(migration.version);
    }
  });
}
