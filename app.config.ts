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
    buildNumber: '2',
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
    [
      'react-native-audio-api',
      {
        iosBackgroundMode: true,
        iosMicrophonePermission:
          'Lull uses its audio engine strictly for offline sleep soundscape synthesis and never accesses your microphone.',
        androidForegroundService: true,
        androidFSTypes: ['mediaPlayback'],
        androidFSStopWithTask: true,
      },
    ],
    'expo-sqlite',
    [
      'expo-splash-screen',
      {
        // The Lull Line, centred; LaunchVeil picks up at the same size and spot.
        image: './assets/images/splash-mark.png',
        imageWidth: 160,
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
