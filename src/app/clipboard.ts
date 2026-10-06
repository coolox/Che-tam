import { Clipboard } from 'react-native';

export type ClipboardWriter = {
  setString(text: string): void | Promise<void>;
};

export const reactNativeClipboardWriter: ClipboardWriter = {
  setString(text) {
    Clipboard.setString(text);
  },
};
