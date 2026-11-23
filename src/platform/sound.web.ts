import { createWebSoundEngine } from './web/sound'
import type { SoundEngine } from '@/core/sound/engine'

export function createPlatformSoundEngine(): SoundEngine {
  return createWebSoundEngine()
}
