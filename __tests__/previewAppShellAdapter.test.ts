// eslint-disable-next-line @typescript-eslint/no-var-requires
const fs = require('fs') as { readFileSync(path: string, encoding: string): string };
import { InMemorySqliteDatabase } from '../src/storage/sqlite/inMemoryAdapter';
import { createLocalMessageStore } from '../src/messages/localMessageStore';

describe('PreviewAppShell local data adapter', () => {
  it('does not import or read the chat/message runtime fixtures', () => {
    const source = fs.readFileSync('src/app/PreviewAppShell.tsx', 'utf8');

    expect(source).not.toMatch(/\bINITIAL_CHATS\b/);
    expect(source).not.toMatch(/\bINITIAL_MESSAGES\b/);
  });

  it('publishes refreshed snapshots to subscribers after persisted unread is cleared', async () => {
    const database = new InMemorySqliteDatabase();
    const store = createLocalMessageStore(async () => database);
    const observedUnread: number[] = [];
    const unsubscribe = store.subscribe(() => {
      const parents = store.getSnapshot().chats.find((chat) => chat.id === 'parents');
      if (parents) observedUnread.push(parents.unread);
    });

    await store.bootstrap();
    await store.clearUnread('parents');
    unsubscribe();

    expect(observedUnread).toContain(2);
    expect(observedUnread.at(-1)).toBe(0);
    expect(store.getSnapshot().messagesByChat.parents.map((message) => message.id)).toEqual([
      'parents-1',
      'parents-2',
      'parents-call-1',
      'parents-call-2',
      'parents-3',
      'parents-4',
      'parents-5',
    ]);
  });
});
