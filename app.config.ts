import type { ConfigContext, ExpoConfig } from 'expo/config'

/**
 * Three apps that install side by side, each with its own data:
 *
 * - development: Lull Dev. The dev client that loads live code from Metro.
 *   Installed straight from the build (ad hoc), never on App Store Connect.
 * - beta: Lull Beta. TestFlight, internal testers then external ones after
 *   Apple's beta review. Its own App Store Connect app.
 * - production: Lull. What goes to App Review and the App Store.
 *
 * Builds pick one with APP_VARIANT (set per profile in eas.json). Unset means
 * production, so the web export and anything unconfigured get the real app.
 * See docs/RELEASES.md.
 */
type Variant = 'development' | 'beta' | 'production'

const VARIANTS: Record<
  Variant,
  { name: string; id: string; scheme: string; icon: string; buildNumber: string; versionCode: number }
> = {
  development: {
    name: 'Lull Dev',
    id: 'com.oooflabs.lull.dev',
    scheme: 'lull-dev',
    icon: './assets/images/icon-dev.png',
    buildNumber: '1',
    versionCode: 1,
  },
  beta: {
    name: 'Lull Beta',
    id: 'com.oooflabs.lull.beta',
    scheme: 'lull-beta',
    icon: './assets/images/icon-beta.png',
    // Each App Store Connect app counts its own builds: raise before every upload.
    buildNumber: '1',
    versionCode: 1,
  },
  production: {
    name: 'Lull',
    id: 'com.oooflabs.lull',
    scheme: 'lull',
    icon: './assets/images/icon.png',
    buildNumber: '2',
    versionCode: 1,
  },
}

const raw = process.env.APP_VARIANT ?? 'production'
if (!(raw in VARIANTS)) throw new Error(`APP_VARIANT must be development, beta or production, not "${raw}"`)
const variant = VARIANTS[raw as Variant]

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: variant.name,
  slug: 'lull',
  version: '1.0.0',
  platforms: ['ios', 'android', 'web'],
  scheme: variant.scheme,
  orientation: 'portrait',
  userInterfaceStyle: 'dark',
  backgroundColor: '#000000',
  icon: variant.icon,
  ios: {
    bundleIdentifier: variant.id,
    buildNumber: variant.buildNumber,
    supportsTablet: true,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      UIBackgroundModes: ['audio'],
      CADisableMinimumFrameDurationOnPhone: true,
    },
  },
  android: {
    package: variant.id,
    versionCode: variant.versionCode,
    backgroundColor: '#000000',
    adaptiveIcon: {
      // Android crops adaptive icons to a circle or squircle, which would cut
      // the variant band off; the app's name tells them apart there.
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
