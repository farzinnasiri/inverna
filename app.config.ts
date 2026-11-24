import type { ConfigContext, ExpoConfig } from 'expo/config'

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Lull',
  slug: 'lull',
  version: '1.0.0',
  platforms: ['ios', 'android', 'web'],
  scheme: 'lull',
  orientation: 'portrait',
  userInterfaceStyle: 'dark',
  backgroundColor: '#000000',
  icon: './assets/images/icon.png',
  ios: {
    bundleIdentifier: 'com.oooflabs.lull',
    buildNumber: '1',
    supportsTablet: true,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      UIBackgroundModes: ['audio'],
      CADisableMinimumFrameDurationOnPhone: true,
    },
  },
  android: {
    package: 'com.oooflabs.lull',
    backgroundColor: '#000000',
    adaptiveIcon: {
      foregroundImage: './assets/images/icon.png',
      backgroundColor: '#000000',
    },
  },
  web: {
    bundler: 'metro',
    output: 'single',
    name: 'Lull',
    shortName: 'Lull',
    backgroundColor: '#000000',
    themeColor: '#000000',
    favicon: './assets/images/favicon.png',
  },
  plugins: [
    'expo-router',
    'expo-audio',
    'expo-sqlite',
    [
      'expo-splash-screen',
      {
        image: './assets/images/icon.png',
        imageWidth: 120,
        backgroundColor: '#000000',
      },
    ],
    [
      'expo-notifications',
      {
        color: '#C2A15F',
        defaultChannel: 'bedtime',
      },
    ],
  ],
  experiments: {
    typedRoutes: false,
  },
})
