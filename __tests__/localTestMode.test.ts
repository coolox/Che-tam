import { InMemorySqliteDatabase } from '../src/storage/sqlite/inMemoryAdapter';
import { createLocalMessageStore } from '../src/messages/localMessageStore';
import { createDebugLocalAckTransport } from '../src/messages/localOutbox';
import { resolveLocalTestMode } from '../src/messages/localTestMode';

async function eventually(assertion: () => Promise<void> | void): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      await assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }
  throw lastError;
}

describe('explicit local test mode', () => {
  it('resolves true only for EXPO_PUBLIC_LOCAL_TEST_MODE=1', () => {
    expect(resolveLocalTestMode({}).enabled).toBe(false);
    expect(resolveLocalTestMode({ EXPO_PUBLIC_LOCAL_TEST_MODE: '' }).enabled).toBe(false);
    expect(resolveLocalTestMode({ EXPO_PUBLIC_LOCAL_TEST_MODE: 'true' }).enabled).toBe(false);
    expect(resolveLocalTestMode({ EXPO_PUBLIC_LOCAL_TEST_MODE: '1' }).enabled).toBe(true);
  });

  it('keeps no-flag bootstrap empty and has no fake ack transport', async () => {
    const localTestMode = resolveLocalTestMode({});
    const database = new InMemorySqliteDatabase();
    const store = createLocalMessageStore(async () => database, 'che-tam-local.db', { localTestMode });

    await store.bootstrap();

    expect(store.getSnapshot()).toEqual({ status: 'ready', chats: [], messagesByChat: {}, errorText: null });
    expect(createDebugLocalAckTransport(localTestMode)).toBeNull();
  });

  it('seeds chats and acknowledges through fake local transport only when flag is 1', async () => {
    const localTestMode = resolveLocalTestMode({ EXPO_PUBLIC_LOCAL_TEST_MODE: '1' });
    const database = new InMemorySqliteDatabase();
    const store = createLocalMessageStore(async () => database, 'che-tam-local.db', {
      idFactory: () => 'cm-local-test',
      initialNetworkAvailable: true,
      localTestMode,
      now: () => new Date('2026-10-05T10:00:00.000Z'),
    });

    await store.bootstrap();
    expect(store.getSnapshot().status).toBe('ready');
    expect(store.getSnapshot().chats.map(chat => chat.id)).toEqual(['parents', 'sister', 'grandma', 'brother', 'family', 'cousin']);
    expect(createDebugLocalAckTransport(localTestMode)).not.toBeNull();

    await store.sendTextMessage('parents', '  Проверка  ');

    await eventually(() => expect(store.getSnapshot().messagesByChat.parents.at(-1)).toMatchObject({
      clientMessageId: 'cm-local-test',
      deliveryState: 'sent',
      text: 'Проверка',
    }));
  });
});
