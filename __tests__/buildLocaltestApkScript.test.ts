// eslint-disable-next-line @typescript-eslint/no-var-requires
const fs = require('fs') as {
  readFileSync(path: string, encoding: string): string;
  statSync(path: string): { mode: number };
};

describe('localtest APK build script', () => {
  const scriptPath = 'scripts/build-localtest-apk.sh';
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8')) as { version: string };

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

  it('normalizes a relative APK argument against ROOT_DIR before entering android', () => {
    const source = fs.readFileSync(scriptPath, 'utf8');
    const relativeArgumentIndex = source.indexOf('*) APK="$ROOT_DIR/$1" ;;');
    const absoluteArgumentIndex = source.indexOf('/*) APK="$1" ;;');
    const cdAndroidIndex = source.indexOf('cd "$ROOT_DIR/android"');

    expect(relativeArgumentIndex).toBeGreaterThan(-1);
    expect(absoluteArgumentIndex).toBeGreaterThan(-1);
    expect(relativeArgumentIndex).toBeLessThan(cdAndroidIndex);
    expect(absoluteArgumentIndex).toBeLessThan(cdAndroidIndex);
  });

  it('derives the default APK artifact version from package.json and preserves argument override', () => {
    const source = fs.readFileSync(scriptPath, 'utf8');

    expect(source).toContain('PACKAGE_VERSION="$(node -e "process.stdout.write(require(process.argv[1]).version)" "$ROOT_DIR/package.json")"');
    expect(source).toContain('APK="$ROOT_DIR/artifacts/che-tam-v${PACKAGE_VERSION}-localtest-arm64.apk"');
    expect(source).not.toContain(`che-tam-v${packageJson.version}-localtest-arm64.apk`);
    expect(source.indexOf('PACKAGE_VERSION=')).toBeGreaterThan(source.indexOf('else'));
    expect(source.indexOf('PACKAGE_VERSION=')).toBeLessThan(source.indexOf('fi'));
  });
});
