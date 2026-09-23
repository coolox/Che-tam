import { INITIAL_CHATS, INITIAL_MESSAGES } from '../src/ui/demoData';
import { appendOutgoingMessage, getOrderedChats, searchChats, selectTab, togglePinnedChat } from '../src/ui/state';

describe('UI Preview local behavior', () => {
  it('filters chats by family name or last message', () => {
    expect(searchChats(INITIAL_CHATS, 'бабушка').map(chat => chat.id)).toEqual(['grandma']);
    expect(searchChats(INITIAL_CHATS, 'домашний узел').map(chat => chat.id)).toEqual(['brother']);
    expect(searchChats(INITIAL_CHATS, 'нет такого').map(chat => chat.id)).toEqual([]);
  });

  it('toggles pinned chats and orders pinned items first', () => {
    const updated = togglePinnedChat(INITIAL_CHATS, 'sister');
    expect(updated.find(chat => chat.id === 'sister')?.pinned).toBe(true);
    expect(getOrderedChats(updated).slice(0, 3).map(chat => chat.id)).toEqual(['parents', 'sister', 'family']);
  });

  it('adds an outgoing composer message to local state', () => {
    const messages = INITIAL_MESSAGES.parents;
    const result = appendOutgoingMessage(messages, '  Будем на связи  ', new Date('2026-09-22T10:00:00.000Z'));
    expect(result.added).toBe(true);
    expect(result.messages).toHaveLength(messages.length + 1);
    expect(result.messages.at(-1)).toMatchObject({ sender: 'me', text: 'Будем на связи', delivered: true });
  });

  it('keeps empty composer drafts out of state', () => {
    const messages = INITIAL_MESSAGES.parents;
    const result = appendOutgoingMessage(messages, '   ');
    expect(result.added).toBe(false);
    expect(result.messages).toBe(messages);
  });

  it('selects bottom tab state locally', () => {
    expect(selectTab('chats', 'settings')).toBe('settings');
    expect(selectTab('settings', 'family')).toBe('family');
  });
});
