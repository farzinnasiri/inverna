/**
 * Universal Expo platform seam (iOS, Android, Web).
 * Storage, sound, haptics, and notifications all resolve cleanly per platform.
 */
import { installKeyValueStore } from '@/core/storage'
import type { SoundEngine } from '@/core/sound/engine'
import { deviceStorage } from './storage'
import { deviceHaptics, type HapticsAdapter } from './haptics'
import { createPlatformSoundEngine } from './sound'
import { scheduleBedtimeReminder, cancelBedtimeReminder } from './notifications'

let booted = false

export function bootPlatform(): void {
  if (booted) return
  booted = true
  installKeyValueStore(deviceStorage())
}

export const sound: SoundEngine = createPlatformSoundEngine()
export const haptics: HapticsAdapter = deviceHaptics
export const notifications = {
  scheduleBedtimeReminder,
  cancelBedtimeReminder,
}
