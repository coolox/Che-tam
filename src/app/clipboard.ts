export type ClipboardWriter = {
  setString(text: string): void | Promise<void>;
};

type ExpoClipboardModule = {
  setStringAsync(text: string): Promise<void>;
};

function getExpoClipboard(): ExpoClipboardModule {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const clipboard = require('expo-clipboard') as ExpoClipboardModule;
  return clipboard;
}

export const expoClipboardWriter: ClipboardWriter = {
  setString(text) {
    return getExpoClipboard().setStringAsync(text);
  },
};
