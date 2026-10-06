import { createLocalMessageStore } from '../src/messages/localMessageStore';
import { migrateDatabase, listSqliteMigrationVersions } from '../src/storage/sqlite/migrate';
import { SCHEMA_VERSION } from '../src/storage/sqlite/schema';
import { RealSqliteDatabase, withTempSqlitePath } from './helpers/realSqlite';

const timestamp = '2026-10-03T12:00:00.000Z';
const legacyTimestamp = '2026-09-22T12:00:00.000Z';
const localTestNow = new Date('2026-10-05T22:34:00.000Z');
const localTestSentAt = localTestNow.toISOString();

const legacyV1StatementsFrom0c20088 = [
  `CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS profiles (
    id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    avatar_url TEXT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS chats (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    kind TEXT NOT NULL,
    last_message_at TEXT NULL,
    unread_count INTEGER NOT NULL DEFAULT 0 CHECK(unread_count >= 0),
    updated_at TEXT NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS idx_chats_last_message_at ON chats(last_message_at DESC, id ASC)',
  `CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    chat_id TEXT NOT NULL REFERENCES chats(id),
    client_message_id TEXT NOT NULL UNIQUE,
    sender_id TEXT NOT NULL REFERENCES profiles(id),
    body TEXT NOT NULL,
    created_at TEXT NOT NULL,
    delivery_state TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS idx_messages_chat_created_at ON messages(chat_id, created_at ASC, id ASC)',
  `CREATE TABLE IF NOT EXISTS message_receipts (
    message_id TEXT NOT NULL REFERENCES messages(id),
    profile_id TEXT NOT NULL REFERENCES profiles(id),
    state TEXT NOT NULL,
    received_at TEXT NOT NULL,
    PRIMARY KEY(message_id, profile_id, state)
  )`,
  `CREATE TABLE IF NOT EXISTS sync_cursors (
    scope TEXT PRIMARY KEY,
    cursor TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS endpoint_cache (
    endpoint_id TEXT PRIMARY KEY,
    url TEXT NOT NULL,
    priority INTEGER NOT NULL,
    last_known_good_at TEXT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS outbox (
    client_message_id TEXT PRIMARY KEY REFERENCES messages(client_message_id),
    chat_id TEXT NOT NULL REFERENCES chats(id),
    payload TEXT NOT NULL,
    state TEXT NOT NULL,
    attempt_count INTEGER NOT NULL DEFAULT 0 CHECK(attempt_count >= 0),
    next_attempt_at TEXT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
] as const;

const release062DemoChatsFrom9596486 = [
  { id: 'parents', title: 'Мама и папа', lastMessageAt: '2026-09-22T09:13:00.000Z', unreadCount: 2 },
  { id: 'sister', title: 'Лейла', lastMessageAt: '2026-09-22T08:42:00.000Z', unreadCount: 0 },
  { id: 'grandma', title: 'Бабушка Нина', lastMessageAt: '2026-09-21T15:20:00.000Z', unreadCount: 1 },
  { id: 'brother', title: 'Руслан', lastMessageAt: '2026-09-21T13:00:00.000Z', unreadCount: 0 },
  { id: 'family', title: 'Семейный круг', lastMessageAt: '2026-09-21T12:30:00.000Z', unreadCount: 4 },
  { id: 'cousin', title: 'Дина', lastMessageAt: '2026-09-20T17:40:00.000Z', unreadCount: 0 },
] as const;

const release062DemoMessagesFrom9596486 = [
  { id: 'parents-1', chatId: 'parents', senderId: 'local-relative', body: 'Как дети? Получилось подключиться к Wi-Fi?', createdAt: '2026-09-22T08:15:00.000Z', deliveryState: 'delivered' },
  { id: 'parents-2', chatId: 'parents', senderId: 'local-self', body: 'Да, вечером покажем новый рисунок по видеозвонку.', createdAt: '2026-09-22T08:17:00.000Z', deliveryState: 'read' },
  { id: 'parents-call-1', chatId: 'parents', senderId: 'local-relative', body: 'Голосовой звонок · 1 мин', createdAt: '2026-09-22T08:44:00.000Z', deliveryState: 'delivered' },
  { id: 'parents-call-2', chatId: 'parents', senderId: 'local-relative', body: 'Пропущенный звонок — нажмите, чтобы перезвонить', createdAt: '2026-09-22T08:52:00.000Z', deliveryState: 'delivered' },
  { id: 'parents-3', chatId: 'parents', senderId: 'local-relative', body: 'Созвонимся после ужина, если связь будет ровная.', createdAt: '2026-09-22T09:10:00.000Z', deliveryState: 'delivered' },
  { id: 'parents-4', chatId: 'parents', senderId: 'local-self', body: 'Проверяю связь перед ужином.', createdAt: '2026-09-22T09:12:00.000Z', deliveryState: 'queued' },
  { id: 'parents-5', chatId: 'parents', senderId: 'local-self', body: 'Сообщение доставлено, ждём ответа.', createdAt: '2026-09-22T09:13:00.000Z', deliveryState: 'delivered' },
  { id: 'sister-1', chatId: 'sister', senderId: 'local-relative', body: 'Отправила расписание на выходные.', createdAt: '2026-09-22T08:42:00.000Z', deliveryState: 'delivered' },
  { id: 'grandma-1', chatId: 'grandma', senderId: 'local-relative', body: 'Жду фото детей, когда будет Wi-Fi.', createdAt: '2026-09-21T15:20:00.000Z', deliveryState: 'delivered' },
  { id: 'brother-1', chatId: 'brother', senderId: 'local-relative', body: 'Проверил домашний узел, индикатор зелёный.', createdAt: '2026-09-21T13:00:00.000Z', deliveryState: 'delivered' },
  { id: 'family-1', chatId: 'family', senderId: 'local-relative', body: 'В субботу общий звонок в 19:00.', createdAt: '2026-09-21T12:30:00.000Z', deliveryState: 'delivered' },
  { id: 'cousin-1', chatId: 'cousin', senderId: 'local-relative', body: 'Сохранила рецепт, спасибо!', createdAt: '2026-09-20T17:40:00.000Z', deliveryState: 'delivered' },
] as const;

type LegacyFixture = {
  name: string;
  expectedMigrationVersions: number[];
  expectedRetainedRows: Record<string, string[]>;
  expectedDrafts?: { chat_id: string; text: string; updated_at: string }[];
  migrate(database: RealSqliteDatabase): Promise<void>;
};

async function seedLegacyV1Database(database: RealSqliteDatabase): Promise<void> {
  for (const statement of legacyV1StatementsFrom0c20088) {
    await database.execute(statement);
  }
  await database.execute('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)', [1, legacyTimestamp]);
  await database.execute('INSERT INTO profiles(id, display_name, avatar_url, updated_at) VALUES (?, ?, ?, ?)', [
    'legacy-profile',
    'Legacy Profile',
    null,
    legacyTimestamp,
  ]);
  await database.execute('INSERT INTO chats(id, title, kind, last_message_at, unread_count, updated_at) VALUES (?, ?, ?, ?, ?, ?)', [
    'legacy-chat',
    'Legacy Chat',
    'direct',
    legacyTimestamp,
    3,
    legacyTimestamp,
  ]);
  await database.execute(
    'INSERT INTO messages(id, chat_id, client_message_id, sender_id, body, created_at, delivery_state, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ['legacy-message', 'legacy-chat', 'legacy-client-message', 'legacy-profile', 'legacy body', legacyTimestamp, 'queued', legacyTimestamp],
  );
}

const legacyFixtures: readonly LegacyFixture[] = [
  {
    name: 'pre-v1-v0',
    expectedMigrationVersions: [0, ...listSqliteMigrationVersions()],
    expectedRetainedRows: { v0_user_data: ['legacy-0'] },
    async migrate(database) {
      await database.execute(`CREATE TABLE schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      )`);
      await database.execute('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)', [0, legacyTimestamp]);
      await database.execute('CREATE TABLE v0_user_data (id TEXT PRIMARY KEY, value TEXT NOT NULL)');
      await database.execute('INSERT INTO v0_user_data(id, value) VALUES (?, ?)', ['legacy-0', 'keep-v0']);
    },
  },
  {
    name: 'v1-0c20088',
    expectedMigrationVersions: listSqliteMigrationVersions(),
    expectedRetainedRows: { profiles: ['legacy-profile'], chats: ['legacy-chat'], messages: ['legacy-message'] },
    async migrate(database) {
      await seedLegacyV1Database(database);
    },
  },
  {
    name: 'v2-chat-drafts-already-migrated',
    expectedMigrationVersions: listSqliteMigrationVersions(),
    expectedRetainedRows: { profiles: ['legacy-profile'], chats: ['legacy-chat'], messages: ['legacy-message'] },
    expectedDrafts: [{ chat_id: 'legacy-chat', text: 'Legacy draft', updated_at: legacyTimestamp }],
    async migrate(database) {
      await seedLegacyV1Database(database);
      await database.execute(`CREATE TABLE IF NOT EXISTS chat_drafts (
        chat_id TEXT PRIMARY KEY REFERENCES chats(id) ON DELETE CASCADE,
        text TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`);
      await database.execute('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)', [2, legacyTimestamp]);
      await database.execute('INSERT INTO chat_drafts(chat_id, text, updated_at) VALUES (?, ?, ?)', [
        'legacy-chat',
        'Legacy draft',
        legacyTimestamp,
      ]);
    },
  },
];

async function createRelease062DemoSeedFrom9596486(database: RealSqliteDatabase): Promise<void> {
  for (const statement of legacyV1StatementsFrom0c20088) {
    await database.execute(statement);
  }
  await database.execute('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)', [1, legacyTimestamp]);
  await database.execute('INSERT INTO profiles(id, display_name, avatar_url, updated_at) VALUES (?, ?, ?, ?)', [
    'local-self',
    'Вы',
    null,
    legacyTimestamp,
  ]);
  await database.execute('INSERT INTO profiles(id, display_name, avatar_url, updated_at) VALUES (?, ?, ?, ?)', [
    'local-relative',
    'Семья',
    null,
    legacyTimestamp,
  ]);
  for (const chat of release062DemoChatsFrom9596486) {
    await database.execute('INSERT INTO chats(id, title, kind, last_message_at, unread_count, updated_at) VALUES (?, ?, ?, ?, ?, ?)', [
      chat.id,
      chat.title,
      'local',
      chat.lastMessageAt,
      chat.unreadCount,
      legacyTimestamp,
    ]);
  }
  for (const message of release062DemoMessagesFrom9596486) {
    await database.execute(
      'INSERT INTO messages(id, chat_id, client_message_id, sender_id, body, created_at, delivery_state, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [
        message.id,
        message.chatId,
        `fixture-${message.id}`,
        message.senderId,
        message.body,
        message.createdAt,
        message.deliveryState,
        legacyTimestamp,
      ],
    );
  }
}

async function expectReplySchemaV3(database: RealSqliteDatabase): Promise<void> {
  expect((await database.query<{ name: string }>('PRAGMA table_info(messages)')).map(row => row.name)).toEqual(expect.arrayContaining([
    'reply_to_message_id',
    'reply_sender_name',
    'reply_preview',
  ]));
  expect(await database.query('SELECT name FROM sqlite_master WHERE type = ? AND name = ?', ['index', 'idx_messages_reply_to_message_id'])).toEqual([
    { name: 'idx_messages_reply_to_message_id' },
  ]);
}

async function run0c20088BootstrapBehavior(database: RealSqliteDatabase): Promise<void> {
  await database.execute('PRAGMA foreign_keys = ON');
  await database.transaction(async (transaction) => {
    await transaction.execute(legacyV1StatementsFrom0c20088[0]);
    const existing = await transaction.query<{ version: number }>(
      'SELECT version FROM schema_migrations WHERE version = ?',
      [1],
    );
    if (existing.length === 0) {
      for (const statement of legacyV1StatementsFrom0c20088.slice(1)) {
        await transaction.execute(statement);
      }
      await transaction.execute('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)', [1, legacyTimestamp]);
    }
  });

  expect((await database.query<{ id: string }>('SELECT id FROM chats ORDER BY last_message_at IS NULL ASC, last_message_at DESC, id ASC')).map(row => row.id)).toEqual([
    'parents',
    'sister',
    'grandma',
    'brother',
    'family',
    'cousin',
  ]);
  expect((await database.query<{ id: string }>('SELECT id FROM messages WHERE chat_id = ? ORDER BY created_at ASC, id ASC', ['parents'])).map(row => row.id)).toEqual([
    'parents-1',
    'parents-2',
    'parents-call-1',
    'parents-call-2',
    'parents-3',
    'parents-4',
    'parents-5',
  ]);
  expect(await database.query('SELECT name FROM sqlite_master WHERE type = ? AND name = ?', ['table', 'chat_drafts'])).toEqual([]);
}

describe('legacy SQLite upgrades on real node:sqlite', () => {
  it.each(legacyFixtures)('upgrades $name to the current schema without losing retained rows', async (fixture) => {
    await withTempSqlitePath('che-tam-legacy-upgrade-', async (databasePath) => {
      const database = new RealSqliteDatabase(databasePath);
      await fixture.migrate(database);
      await migrateDatabase(database, timestamp);

      expect(await database.query('SELECT version, applied_at FROM schema_migrations ORDER BY version ASC')).toEqual(
        fixture.expectedMigrationVersions.map(version => ({ version, applied_at: version === 0 ? legacyTimestamp : expect.any(String) })),
      );
      expect(await database.query('SELECT name FROM sqlite_master WHERE type = ? AND name = ?', ['table', 'chat_drafts'])).toEqual([{ name: 'chat_drafts' }]);
      await expectReplySchemaV3(database);
      expect(Math.max(...(await database.query<{ version: number }>('SELECT version FROM schema_migrations')).map(row => row.version))).toBe(SCHEMA_VERSION);

      for (const [table, ids] of Object.entries(fixture.expectedRetainedRows)) {
        expect((await database.query<{ id: string }>(`SELECT id FROM ${table} ORDER BY id ASC`)).map(row => row.id)).toEqual(ids);
      }
      if (fixture.expectedDrafts) {
        expect(await database.query('SELECT chat_id, text, updated_at FROM chat_drafts ORDER BY chat_id ASC')).toEqual(fixture.expectedDrafts);
      }
      database.close();
    });
  });

  it('boots the local message store from the exact 0c20088 v1 database with no local error', async () => {
    await withTempSqlitePath('che-tam-legacy-bootstrap-', async (databasePath) => {
      const seedDatabase = new RealSqliteDatabase(databasePath);
      await legacyFixtures[1].migrate(seedDatabase);
      seedDatabase.close();

      const opened: RealSqliteDatabase[] = [];
      const store = createLocalMessageStore(async () => {
        const database = new RealSqliteDatabase(databasePath);
        opened.push(database);
        return database;
      }, 'local.db', { developmentSeedEnabled: false, transport: null });

      try {
        await store.bootstrap();
        expect(store.getSnapshot()).toMatchObject({ status: 'ready', errorText: null });
        expect(store.getSnapshot().chats.map(chat => chat.id)).toEqual(['legacy-chat']);
        expect(store.getSnapshot().messagesByChat['legacy-chat'].map(message => message.id)).toEqual(['legacy-message']);
        expect(store.getSnapshot().messagesByChat['legacy-chat'][0].replyTo).toBeUndefined();
      } finally {
        store.dispose();
        for (const database of opened) database.close();
      }
    });
  });

  it('records a passing non-reproduction for the 9596486 release seed through 0c20088 and current local-test bootstrap', async () => {
    await withTempSqlitePath('che-tam-9596486-localtest-nonrepro-', async (databasePath) => {
      const seedDatabase = new RealSqliteDatabase(databasePath);
      await createRelease062DemoSeedFrom9596486(seedDatabase);
      await run0c20088BootstrapBehavior(seedDatabase);
      seedDatabase.close();

      const opened: RealSqliteDatabase[] = [];
      const store = createLocalMessageStore(async () => {
        const database = new RealSqliteDatabase(databasePath);
        opened.push(database);
        return database;
      }, 'local.db', {
        idFactory: () => 'local-test-current-message',
        initialNetworkAvailable: true,
        localTestMode: { enabled: true },
        now: () => localTestNow,
      });

      try {
        await store.bootstrap();
        expect(store.getSnapshot()).toMatchObject({ status: 'ready', errorText: null });
        expect(store.getSnapshot().chats.map(chat => chat.id)).toEqual(['parents', 'sister', 'grandma', 'brother', 'family', 'cousin']);
        expect(store.getSnapshot().messagesByChat.parents.map(message => message.id)).toEqual([
          'parents-1',
          'parents-2',
          'parents-call-1',
          'parents-call-2',
          'parents-3',
          'parents-4',
          'parents-5',
        ]);

        await expect(store.saveComposerDraft('parents', 'Проверка локального теста')).resolves.toBeUndefined();
        expect(await store.readComposerDraft('parents')).toBe('Проверка локального теста');
        await expect(store.sendTextMessage('parents', 'Проверка локального теста')).resolves.toEqual({
          sent: true,
          clientMessageId: 'local-test-current-message',
        });

        await new Promise(resolve => setTimeout(resolve, 0));
        expect(store.getSnapshot().messagesByChat.parents.at(-1)).toMatchObject({
          id: 'local-test-current-message',
          clientMessageId: 'local-test-current-message',
          deliveryState: 'sent',
          text: 'Проверка локального теста',
        });

        const verifyDatabase = new RealSqliteDatabase(databasePath);
        expect(await verifyDatabase.query('SELECT version, applied_at FROM schema_migrations ORDER BY version ASC')).toEqual([
          { version: 1, applied_at: legacyTimestamp },
          { version: 2, applied_at: legacyTimestamp },
          { version: 3, applied_at: legacyTimestamp },
        ]);
        expect(await verifyDatabase.query('SELECT name FROM sqlite_master WHERE type = ? AND name = ?', ['table', 'chat_drafts'])).toEqual([{ name: 'chat_drafts' }]);
        await expectReplySchemaV3(verifyDatabase);
        expect((await verifyDatabase.query<{ id: string }>('SELECT id FROM chats ORDER BY last_message_at IS NULL ASC, last_message_at DESC, id ASC')).map(row => row.id)).toEqual([
          'parents',
          'sister',
          'grandma',
          'brother',
          'family',
          'cousin',
        ]);
        expect(await verifyDatabase.query('SELECT state FROM outbox WHERE client_message_id = ?', ['local-test-current-message'])).toEqual([]);
        expect(await verifyDatabase.query('SELECT delivery_state, updated_at FROM messages WHERE client_message_id = ?', ['local-test-current-message'])).toEqual([
          { delivery_state: 'sent', updated_at: localTestSentAt },
        ]);
        verifyDatabase.close();
      } finally {
        store.dispose();
        for (const database of opened) database.close();
      }
    });
  });
});
