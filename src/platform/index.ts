/**
 * Platform seam. The UI talks to `platform`, never to browser APIs directly
 * for storage, sound or haptics. A React Native build swaps this one file.
 */
import { installKeyValueStore } from '@/core/storage'
import type { SoundEngine } from '@/core/sound/engine'
import { webStorage } from './web/storage'
import { webHaptics, type Haptics } from './web/haptics'
import { createWebSoundEngine } from './web/sound'

let booted = false

export function bootPlatform(): void {
  if (booted) return
  booted = true
  installKeyValueStore(webStorage())
}

export const sound: SoundEngine = createWebSoundEngine()
export const haptics: Haptics = webHaptics
