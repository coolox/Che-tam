// eslint-disable-next-line @typescript-eslint/no-var-requires
const fs = require('fs') as { readFileSync(path: string, encoding: string): string };
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(() => Promise.resolve()) }), { virtual: true });

// eslint-disable-next-line @typescript-eslint/no-var-requires
const expoClipboard = require('expo-clipboard') as { setStringAsync: jest.Mock };

import { expoClipboardWriter } from '../src/app/clipboard';
import {
  closeMessageActionSheet,
  createReplyTarget,
  formatReplyPreview,
  openMessageActionSheet,
  requestMessageDeleteConfirmation,
} from '../src/ui/state';
import type { Chat, Message } from '../src/ui/types';

const chat: Chat = {
  id: 'parents',
  name: 'Мама и папа',
  initials: 'МП',
  avatarColor: '#116149',
  lastMessage: '',
  pinned: false,
  time: '',
  trafficLabel: 'Локальные сообщения',
  unread: 0,
};

const message: Message = {
  id: 'message-1',
  chatId: 'parents',
  sender: 'relative',
  text: 'Точный текст для буфера',
  createdAt: '2026-10-03T12:00:00.000Z',
  delivered: true,
  kind: 'text',
};

describe('message actions and replies', () => {
  beforeEach(() => {
    expoClipboard.setStringAsync.mockClear();
  });

  it('copies exact message text through the installed Expo Clipboard API', async () => {
    await expoClipboardWriter.setString(message.text);

    expect(expoClipboard.setStringAsync).toHaveBeenCalledWith('Точный текст для буфера');
  });

  it('derives local action-sheet and delete-confirmation states without message content in logs', () => {
    const opened = openMessageActionSheet(message);
    expect(opened).toEqual({ visible: true, message, confirmDelete: false });
    expect(requestMessageDeleteConfirmation(opened)).toEqual({ visible: true, message, confirmDelete: true });
    expect(closeMessageActionSheet()).toEqual({ visible: false, message: null, confirmDelete: false });
  });

  it('creates bounded Russian reply target snapshots', () => {
    const longText = ` ${'Привет '.repeat(40)} `;
    expect(formatReplyPreview(longText)).toHaveLength(120);
    expect(formatReplyPreview(longText).endsWith('…')).toBe(true);
    expect(createReplyTarget(message, chat)).toEqual({
      messageId: 'message-1',
      senderName: 'Мама и папа',
      preview: 'Точный текст для буфера',
    });
  });

  it('wires accessible Russian long-press actions in the conversation UI', () => {
    const source = fs.readFileSync('src/app/screens/ConversationScreen.tsx', 'utf8');

    expect(source).toContain('onLongPress={handleLongPress}');
    expect(source).toContain('label="Ответить"');
    expect(source).toContain('label="Копировать"');
    expect(source).toContain('label="Удалить у себя"');
    expect(source).toContain('accessibilityLabel="Убрать ответ"');
    expect(source).toContain('Удалить сообщение у себя?');
    expect(source).toContain('accessibilityLabel="Закрыть действия сообщения"');
  });
});
