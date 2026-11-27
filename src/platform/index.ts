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
/** Inverna Dev skips the paywall; Beta (sandbox) and the App Store app don't. */
export const skipPaywall = extra.variant === 'development'
export const store: Store = createStore(extra.unlockProductId ?? 'com.oooflabs.inverna.unlock')
