// eslint-disable-next-line @typescript-eslint/no-var-requires
const fs = require('fs') as {
  readFileSync(path: string, encoding: string): string;
  statSync(path: string): { mode: number };
};

describe('localtest APK build script', () => {
  const scriptPath = 'scripts/build-localtest-apk.sh';

  it('is executable and fail-closes on the serialized localtest flag in assets/app.config', () => {
    const source = fs.readFileSync(scriptPath, 'utf8');
    const mode = fs.statSync(scriptPath).mode;

    expect(mode & 0o111).not.toBe(0);
    expect(source).toContain(
      'EXPO_PUBLIC_LOCAL_TEST_MODE=1 ./gradlew :app:assembleRelease -PreactNativeArchitectures=arm64-v8a',
    );
    expect(source).toContain(
      `unzip -p "$APK" assets/app.config | grep -F '"EXPO_PUBLIC_LOCAL_TEST_MODE":"1"'`,
    );
  });
});
