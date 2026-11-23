import type { SoundEngine } from '@/core/sound/engine'

/**
 * PLACEHOLDER — replaced by the Web Audio implementation.
 * A silent engine that satisfies the contract so the app runs.
 */
export function createWebSoundEngine(): SoundEngine {
  let running = false
  return {
    async unlock() {
      running = true
    },
    setMix() {},
    setMaster() {},
    stop() {
      running = false
    },
    cue() {},
    setCuesEnabled() {},
    get isRunning() {
      return running
    },
  }
}
