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
import { createLocalMessageStore } from '../src/messages/localMessageStore';
import type { SqlDatabase, SqlExecutor, SqlResult, SqlValue } from '../src/storage/sqlite/contracts';
import { migrateDatabase } from '../src/storage/sqlite/migrate';
import { createSqliteRepositories } from '../src/storage/sqlite/repositories';

class RealSqliteDatabase implements SqlDatabase {
  private readonly database: InstanceType<typeof DatabaseSync>;

  public constructor(path: string) {
    this.database = new DatabaseSync(path);
  }

  public close(): void {
    this.database.close();
  }

  async execute(sql: string, params: readonly SqlValue[] = []): Promise<SqlResult> {
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

const timestamp = '2026-10-03T12:00:00.000Z';

describe('real SQLite local bootstrap', () => {
  it('migrates, seeds readable persisted chats/messages, and enforces absent-chat foreign keys', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'che-tam-sqlite-'));
    const databasePath = join(directory, 'local.db');
    const opened: RealSqliteDatabase[] = [];
    const factory = async () => {
      const database = new RealSqliteDatabase(databasePath);
      opened.push(database);
      return database;
    };

    try {
      const firstStore = createLocalMessageStore(factory, 'che-tam-local.db', { developmentSeedEnabled: true });
      await firstStore.bootstrap();
      expect(firstStore.getSnapshot().status).toBe('ready');
      expect(firstStore.getSnapshot().chats.map(chat => chat.id)).toContain('parents');
      expect(firstStore.getSnapshot().messagesByChat.parents.map(message => message.id)).toContain('parents-1');
      opened.pop()?.close();

      const secondStore = createLocalMessageStore(factory, 'che-tam-local.db', { developmentSeedEnabled: true });
      await secondStore.bootstrap();
      expect(secondStore.getSnapshot().status).toBe('ready');
      expect(secondStore.getSnapshot().chats.map(chat => chat.id)).toEqual(['parents', 'sister', 'grandma', 'brother', 'family', 'cousin']);
      expect(secondStore.getSnapshot().messagesByChat.parents.map(message => message.id)).toEqual([
        'parents-1',
        'parents-2',
        'parents-call-1',
        'parents-call-2',
        'parents-3',
        'parents-4',
        'parents-5',
      ]);
      opened.pop()?.close();

      const database = new RealSqliteDatabase(databasePath);
      await database.execute('PRAGMA foreign_keys = ON');
      await migrateDatabase(database, timestamp);
      const repositories = createSqliteRepositories(database);
      await repositories.upsertProfile({ id: 'real-sqlite-profile', displayName: 'Профиль', avatarUrl: null, updatedAt: timestamp });
      await expect(repositories.upsertMessage({
        id: 'absent-chat-message',
        chatId: 'absent-chat',
        clientMessageId: 'absent-chat-client-message',
        senderId: 'real-sqlite-profile',
        body: 'local body',
        createdAt: timestamp,
        deliveryState: 'queued',
        updatedAt: timestamp,
      })).rejects.toThrow(/FOREIGN KEY constraint failed/i);
      database.close();
    } finally {
      for (const database of opened) database.close();
      rmSync(directory, { force: true, recursive: true });
    }
  });

  it('persists composer drafts across reopening the same local store database', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'che-tam-drafts-'));
    const databasePath = join(directory, 'local.db');
    const opened: RealSqliteDatabase[] = [];
    const factory = async () => {
      const database = new RealSqliteDatabase(databasePath);
      opened.push(database);
      return database;
    };

    try {
      const firstStore = createLocalMessageStore(factory, 'che-tam-local.db', { developmentSeedEnabled: true });
      await firstStore.bootstrap();
      await firstStore.saveComposerDraft('parents', 'Реальный SQLite черновик');
      firstStore.dispose();
      opened.pop()?.close();

      const secondStore = createLocalMessageStore(factory, 'che-tam-local.db', { developmentSeedEnabled: true });
      await secondStore.bootstrap();

      expect(await secondStore.readComposerDraft('parents')).toBe('Реальный SQLite черновик');
      secondStore.dispose();
      opened.pop()?.close();
    } finally {
      for (const database of opened) database.close();
      rmSync(directory, { force: true, recursive: true });
    }
  });
});
