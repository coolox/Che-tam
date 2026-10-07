module.exports = {
  dependencies: {
    'sodium-react-native-direct': {
      platforms: {
        android: {
          sourceDir: 'android',
          packageImportPath: 'import com.sodiumreactnative.SodiumReactNativePackage;',
          packageInstance: 'new SodiumReactNativePackage()',
        },
      },
    },
  },
};
