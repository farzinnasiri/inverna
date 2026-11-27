/**
 * Universal Expo platform seam (iOS, Android, Web).
 * Storage, sound, haptics, and notifications all resolve cleanly per platform.
 */
import { installKeyValueStore } from '@/core/storage'
import type { SoundEngine } from '@/core/sound/engine'
import { deviceStorage } from './storage'
import { deviceHaptics, type HapticsAdapter } from './haptics'
import { createPlatformSoundEngine } from './sound'
import { clearReminders, downloadReminderCalendar, onReminderOpened, planReminders } from './notifications'
import { Platform } from 'react-native'
import Constants from 'expo-constants'
import { createStore } from './store'
import type { Store } from './store.types'

let booted = false

export function bootPlatform(): void {
  if (booted) return
  booted = true
  installKeyValueStore(deviceStorage())
}

export const sound: SoundEngine = createPlatformSoundEngine()
export const haptics: HapticsAdapter = deviceHaptics
export const notifications = {
  planReminders,
  clearReminders,
  onReminderOpened,
  downloadReminderCalendar,
}

const extra = (Constants.expoConfig?.extra ?? {}) as { variant?: string; unlockProductId?: string }
/** Inverna Dev skips StoreKit by default; Beta (TestFlight sandbox) and Production enforce real StoreKit 2. */
export const skipPaywall = extra.variant === 'development' || Platform.OS === 'web'
/** Dev and Web builds expose a local-only "Preview free tier" switch for testing locks & paywall without paying. Never enabled in Beta or Production. */
export const canPreviewFreeTier = skipPaywall
export const store: Store = createStore(extra.unlockProductId ?? 'com.oooflabs.inverna.unlock')
