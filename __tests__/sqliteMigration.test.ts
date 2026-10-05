import { InMemorySqliteDatabase } from '../src/storage/sqlite/inMemoryAdapter';
import { migrateDatabase } from '../src/storage/sqlite/migrate';
import type { SqlExecutor, SqlResult, SqlValue } from '../src/storage/sqlite/contracts';

const timestamp = '2026-10-03T12:00:00.000Z';

describe('SQLite schema migration', () => {
  it('enables SQLite foreign keys outside the migration transaction', async () => {
    class TrackingDatabase extends InMemorySqliteDatabase {
      public pragmaLocations: string[] = [];
      private transactionDepth = 0;

      override async transaction<T>(work: (transaction: SqlExecutor) => Promise<T>): Promise<T> {
        this.transactionDepth += 1;
        try {
          return await super.transaction(work);
        } finally {
          this.transactionDepth -= 1;
        }
      }

      override async execute(sql: string, params: readonly SqlValue[] = []): Promise<SqlResult> {
        if (sql.replace(/\s+/g, ' ').trim().toLowerCase() === 'pragma foreign_keys = on') {
          this.pragmaLocations.push(this.transactionDepth > 0 ? 'inside' : 'outside');
        }
        return super.execute(sql, params);
      }
    }

    const database = new TrackingDatabase();
    await migrateDatabase(database, timestamp);

    expect(database.pragmaLocations).toEqual(['outside']);
  });

  it('creates all eight application tables, indexes, and exactly one version-1 migration on a clean install', async () => {
    const database = new InMemorySqliteDatabase();
    await migrateDatabase(database, timestamp);

    expect(database.tableNames()).toEqual([
      'chats', 'endpoint_cache', 'message_receipts', 'messages', 'outbox', 'profiles', 'schema_migrations', 'sync_cursors',
    ]);
    expect(database.indexNames()).toEqual(['idx_chats_last_message_at', 'idx_messages_chat_created_at']);
    expect(await database.query('SELECT version FROM schema_migrations WHERE version = ?', [1])).toEqual([{ version: 1, applied_at: timestamp }]);
  });

  it('allows unknown message chat IDs until the foreign-key pragma, then rejects them', async () => {
    const database = new InMemorySqliteDatabase();
    await database.execute('CREATE TABLE IF NOT EXISTS chats (id TEXT PRIMARY KEY)');
    await database.execute('CREATE TABLE IF NOT EXISTS messages (chat_id TEXT NOT NULL REFERENCES chats(id))');

    await expect(database.execute('INSERT INTO messages(chat_id) VALUES (?)', ['missing-before-pragma'])).resolves.toEqual({ changes: 1 });
    await database.execute('PRAGMA foreign_keys = ON');
    await expect(database.execute('INSERT INTO messages(chat_id) VALUES (?)', ['missing-after-pragma'])).rejects.toThrow('FOREIGN KEY constraint failed');
  });

  it('is idempotent and retains rows written after the first migration', async () => {
    const database = new InMemorySqliteDatabase();
    await migrateDatabase(database, timestamp);
    await database.execute('INSERT INTO profiles(id, display_name, avatar_url, updated_at) VALUES (?, ?, ?, ?)', ['p1', 'Ada', null, timestamp]);
    await migrateDatabase(database, '2026-10-04T12:00:00.000Z');

    expect(await database.query('SELECT * FROM profiles')).toEqual([{ id: 'p1', display_name: 'Ada', avatar_url: null, updated_at: timestamp }]);
    expect(await database.query('SELECT version FROM schema_migrations WHERE version = ?', [1])).toHaveLength(1);
  });

  it('preserves the intentionally minimal v0_user_data fixture while adding version 1 schema', async () => {
    const database = new InMemorySqliteDatabase();
    database.seedV0User('legacy-1', 'keep-me');
    await migrateDatabase(database, timestamp);

    expect(database.v0Users()).toEqual([{ id: 'legacy-1', value: 'keep-me' }]);
    expect(await database.query('SELECT version FROM schema_migrations WHERE version = ?', [0])).toHaveLength(1);
    expect(await database.query('SELECT version FROM schema_migrations WHERE version = ?', [1])).toHaveLength(1);
  });
});
