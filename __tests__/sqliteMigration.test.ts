import { InMemorySqliteDatabase } from '../src/storage/sqlite/inMemoryAdapter';
import { migrateDatabase } from '../src/storage/sqlite/migrate';

const timestamp = '2026-10-03T12:00:00.000Z';

describe('SQLite schema migration', () => {
  it('creates all eight application tables, indexes, and exactly one version-1 migration on a clean install', async () => {
    const database = new InMemorySqliteDatabase();
    await migrateDatabase(database, timestamp);

    expect(database.tableNames()).toEqual([
      'chats', 'endpoint_cache', 'message_receipts', 'messages', 'outbox', 'profiles', 'schema_migrations', 'sync_cursors',
    ]);
    expect(database.indexNames()).toEqual(['idx_chats_last_message_at', 'idx_messages_chat_created_at']);
    expect(await database.query('SELECT version FROM schema_migrations WHERE version = ?', [1])).toEqual([{ version: 1, applied_at: timestamp }]);
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
