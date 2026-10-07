// eslint-disable-next-line @typescript-eslint/no-var-requires
const fs = require('fs') as { readFileSync(path: string, encoding: string): string };
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(), setItem: jest.fn() },
}));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(() => Promise.resolve()) }), { virtual: true });
jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }));
jest.mock('react-native-keyboard-controller', () => ({
  KeyboardAvoidingView: 'KeyboardAvoidingView',
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const expoClipboard = require('expo-clipboard') as { setStringAsync: jest.Mock };

import { expoClipboardWriter } from '../src/app/clipboard';
import { copyMessageFromActionSheet, COPY_MESSAGE_FAILURE_TEXT } from '../src/app/screens/ConversationScreen';
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

  it('keeps Expo Clipboard and Haptics on versions bundled with the installed Expo SDK', () => {
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8')) as { dependencies: Record<string, string> };
    const bundledModules = JSON.parse(fs.readFileSync('node_modules/expo/bundledNativeModules.json', 'utf8')) as Record<string, string>;

    expect(packageJson.dependencies['expo-clipboard']).toBe(bundledModules['expo-clipboard']);
    expect(packageJson.dependencies['expo-haptics']).toBe(bundledModules['expo-haptics']);
  });

  it('has no source import of deprecated React Native Clipboard', () => {
    const sourceFiles = ['src/app/clipboard.ts', 'src/app/screens/ConversationScreen.tsx'];

    sourceFiles.forEach((file) => {
      const source = fs.readFileSync(file, 'utf8');
      expect(source).not.toMatch(/import\s+\{[^}]*\bClipboard\b[^}]*\}\s+from\s+['"]react-native['"]/);
      expect(source).not.toMatch(/ReactNative\.Clipboard|\bClipboard\.setString\b/);
    });
  });

  it('closes message actions after a successful async copy through the injected writer', async () => {
    const writer = { setString: jest.fn(() => Promise.resolve()) };
    const onSuccess = jest.fn();
    const onFailure = jest.fn();

    await expect(copyMessageFromActionSheet({
      clipboardWriter: writer,
      onFailure,
      onSuccess,
      state: openMessageActionSheet(message),
    })).resolves.toBe(true);

    expect(writer.setString).toHaveBeenCalledWith('Точный текст для буфера');
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onFailure).not.toHaveBeenCalled();
  });

  it('keeps message actions open and exposes Russian error text when copy fails', async () => {
    const writer = { setString: jest.fn(() => Promise.reject(new Error('native unavailable'))) };
    const onSuccess = jest.fn();
    const onFailure = jest.fn();

    await expect(copyMessageFromActionSheet({
      clipboardWriter: writer,
      onFailure,
      onSuccess,
      state: openMessageActionSheet(message),
    })).resolves.toBe(false);

    expect(onSuccess).not.toHaveBeenCalled();
    expect(onFailure).toHaveBeenCalledWith(COPY_MESSAGE_FAILURE_TEXT);

    const source = fs.readFileSync('src/app/screens/ConversationScreen.tsx', 'utf8');
    expect(source).toContain('accessibilityLiveRegion="polite"');
    expect(source).toContain('accessibilityRole="alert"');
    expect(source).toContain(COPY_MESSAGE_FAILURE_TEXT);
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
