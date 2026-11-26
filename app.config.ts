import type { ConfigContext, ExpoConfig } from 'expo/config'

/**
 * Three apps that install side by side, each with its own data:
 *
 * - development: Inverna Dev. The dev client that loads live code from Metro.
 *   Installed straight from the build (ad hoc), never on App Store Connect.
 * - beta: Inverna Beta. TestFlight, internal testers then external ones after
 *   Apple's beta review. Its own App Store Connect app.
 * - production: Inverna. What goes to App Review and the App Store.
 *
 * Builds pick one with APP_VARIANT (set per profile in eas.json). Unset means
 * production, so the web export and anything unconfigured get the real app.
 * See docs/RELEASES.md.
 */
type Variant = 'development' | 'beta' | 'production'

const VARIANTS: Record<
  Variant,
  { name: string; id: string; scheme: string; icon: string; iosIcon: string; buildNumber: string; versionCode: number }
> = {
  development: {
    name: 'Inverna Dev',
    id: 'com.oooflabs.inverna.dev',
    scheme: 'inverna-dev',
    icon: './assets/images/icon-dev.png',
    iosIcon: './assets/images/Inverna-Dev.icon',
    buildNumber: '1',
    versionCode: 1,
  },
  beta: {
    name: 'Inverna Beta',
    id: 'com.oooflabs.inverna.beta',
    scheme: 'inverna-beta',
    icon: './assets/images/icon-beta.png',
    iosIcon: './assets/images/Inverna-Beta.icon',
    // Each App Store Connect app counts its own builds: raise before every upload.
    buildNumber: '1',
    versionCode: 1,
  },
  production: {
    name: 'Inverna',
    id: 'com.oooflabs.inverna',
    scheme: 'inverna',
    icon: './assets/images/icon.png',
    iosIcon: './assets/images/Inverna.icon',
    buildNumber: '1',
    versionCode: 1,
  },
}

const raw = process.env.APP_VARIANT ?? 'production'
if (!(raw in VARIANTS)) throw new Error(`APP_VARIANT must be development, beta or production, not "${raw}"`)
const variant = VARIANTS[raw as Variant]

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: variant.name,
  slug: 'inverna',
  version: '1.0.0',
  platforms: ['ios', 'android', 'web'],
  scheme: variant.scheme,
  orientation: 'portrait',
  userInterfaceStyle: 'dark',
  backgroundColor: '#000000',
  icon: variant.icon,
  ios: {
    // Icon Composer bundle: iOS 26 renders default, dark, clear (Liquid Glass) and tinted from it.
    icon: variant.iosIcon,
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
      foregroundImage: './assets/images/adaptive-icon.png',
      monochromeImage: './assets/images/monochrome-icon.png',
      backgroundColor: '#0A0C10',
    },
  },
  web: {
    bundler: 'metro',
    output: 'single',
    name: 'Inverna',
    shortName: 'Inverna',
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
        // No microphone permission: Inverna never records. If an upload ever
        // flags a missing purpose string, it comes back with this wording.
        androidForegroundService: true,
        androidFSTypes: ['mediaPlayback'],
        androidFSStopWithTask: true,
      },
    ],
    'expo-sqlite',
    [
      'expo-splash-screen',
      {
        // The Inverna mark, centred; LaunchVeil picks up at the same size and spot.
        image: './assets/images/splash-mark.png',
        imageWidth: 120,
        backgroundColor: '#000000',
      },
    ],
    [
      'expo-notifications',
      {
        color: '#C2A15F',
        defaultChannel: 'bedtime',
        // Local reminders only: no push, so no APNs entitlement.
        enableRemoteNotifications: false,
      },
    ],
  ],
  experiments: {
    typedRoutes: false,
  },
})
