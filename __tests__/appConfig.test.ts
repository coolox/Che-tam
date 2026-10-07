describe('app config localtest serialization', () => {
  const originalLocalTestMode = process.env.EXPO_PUBLIC_LOCAL_TEST_MODE;

  afterEach(() => {
    if (originalLocalTestMode === undefined) {
      delete process.env.EXPO_PUBLIC_LOCAL_TEST_MODE;
    } else {
      process.env.EXPO_PUBLIC_LOCAL_TEST_MODE = originalLocalTestMode;
    }
  });

  it('serializes accepted localtest environment spellings as 1 and all others as 0', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const createConfig = require('../app.config.js') as () => { extra: { EXPO_PUBLIC_LOCAL_TEST_MODE: string } };

    ['1', ' 1 ', 'true', 'TRUE', 'True', ' TrUe '].forEach((value) => {
      process.env.EXPO_PUBLIC_LOCAL_TEST_MODE = value;
      expect(createConfig().extra.EXPO_PUBLIC_LOCAL_TEST_MODE).toBe('1');
    });

    ['', '0', 'false', 'yes', 'on', '2', ' truex '].forEach((value) => {
      process.env.EXPO_PUBLIC_LOCAL_TEST_MODE = value;
      expect(createConfig().extra.EXPO_PUBLIC_LOCAL_TEST_MODE).toBe('0');
    });

    delete process.env.EXPO_PUBLIC_LOCAL_TEST_MODE;
    expect(createConfig().extra.EXPO_PUBLIC_LOCAL_TEST_MODE).toBe('0');
  });

  it('exposes the 0.6.7 Android overlay version metadata', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const createConfig = require('../app.config.js') as () => {
      version: string;
      android: { package: string; versionCode: number };
    };

    const config = createConfig();

    expect(config.version).toBe('0.6.7');
    expect(config.android.package).toBe('net.hearth.chetam');
    expect(config.android.versionCode).toBe(8);
  });

  it('keeps native Android release metadata aligned for 0.6.7 localtest', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require('fs') as { readFileSync(path: string, encoding: string): string };
    const gradle = fs.readFileSync('android/app/build.gradle', 'utf8');

    expect(gradle).toContain("applicationId 'net.hearth.chetam'");
    expect(gradle).toContain('versionCode 8');
    expect(gradle).toContain('versionName "0.6.7"');
  });
});
