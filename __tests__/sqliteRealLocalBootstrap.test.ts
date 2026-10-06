/* eslint-disable @typescript-eslint/no-var-requires */
const { mkdtempSync, rmSync } = require('fs') as {
  mkdtempSync(prefix: string): string;
  rmSync(path: string, options: { force: boolean; recursive: boolean }): void;
};
const { tmpdir } = require('os') as { tmpdir(): string };
const { join } = require('path') as { join(...parts: string[]): string };
import { createLocalMessageStore } from '../src/messages/localMessageStore';
import { migrateDatabase } from '../src/storage/sqlite/migrate';
import { createSqliteRepositories } from '../src/storage/sqlite/repositories';
import { RealSqliteDatabase } from './helpers/realSqlite';

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
        replyToMessageId: null,
        replySenderName: null,
        replyPreview: null,
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
