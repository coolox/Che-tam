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

  it('exposes the 0.6.9 Android overlay version metadata', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const createConfig = require('../app.config.js') as () => {
      version: string;
      android: { package: string; versionCode: number };
    };

    const config = createConfig();

    expect(config.version).toBe('0.6.9');
    expect(config.android.package).toBe('net.hearth.chetam');
    expect(config.android.versionCode).toBe(10);
  });

  it('keeps native Android release metadata aligned for 0.6.9 localtest', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require('fs') as { readFileSync(path: string, encoding: string): string };
    const gradle = fs.readFileSync('android/app/build.gradle', 'utf8');

    expect(gradle).toContain("applicationId 'net.hearth.chetam'");
    expect(gradle).toContain('versionCode 10');
    expect(gradle).toContain('versionName "0.6.9"');
  });

  it('configures the serenity libsodium Expo plugin and autolinks its Android package', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const path = require('path') as {
      join(...segments: string[]): string;
      resolve(...segments: string[]): string;
    };
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createReactNativeConfigAsync } = require('expo-modules-autolinking/build/reactNativeConfig/reactNativeConfig') as {
      createReactNativeConfigAsync(params: {
        appRoot: string;
        sourceDir?: string;
        autolinkingOptions: {
          platform: 'android';
          exclude: string[];
          nativeModulesDir?: string;
          searchPaths: string[];
          legacy_shallowReactNativeLinking?: boolean;
        };
      }): Promise<{
        dependencies: Record<
          string,
          {
            platforms: {
              android?: {
                sourceDir: string;
                packageImportPath: string;
                packageInstance: string;
              };
            };
          }
        >;
      }>;
    };
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createMemoizer } = require('expo-modules-autolinking/build/memoize') as {
      createMemoizer(): {
        withMemoizer<T>(fn: () => Promise<T>): Promise<T>;
      };
    };
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const createConfig = require('../app.config.js') as () => {
      plugins: Array<string | [string, Record<string, unknown>]>;
    };

    const projectRoot = path.resolve('.');
    expect(createConfig().plugins).toContainEqual(['react-native-libsodium', {}]);

    const config = await createMemoizer().withMemoizer(() =>
      createReactNativeConfigAsync({
        appRoot: projectRoot,
        autolinkingOptions: {
          platform: 'android',
          exclude: [],
          searchPaths: [path.join(projectRoot, 'node_modules')],
        },
      })
    );

    const androidConfig = config.dependencies['react-native-libsodium']?.platforms.android;

    expect(androidConfig).toBeDefined();
    expect(androidConfig?.sourceDir).toBe(
      path.join(projectRoot, 'node_modules/react-native-libsodium/android')
    );
    expect(androidConfig?.packageImportPath).toBe('import com.libsodium.LibsodiumPackage;');
    expect(androidConfig?.packageInstance).toBe('new LibsodiumPackage()');
  }, 15000);
});
