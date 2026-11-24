import type { SoundEngine } from '@/core/sound/engine'
import { createNeuroSoundEngine } from './audio'
import type { AudioContextLike } from './audio/types'

type AudioContextCtor = new () => AudioContextLike

function getWebAudioContextCtor(): AudioContextCtor | null {
  const g = globalThis as unknown as {
    AudioContext?: AudioContextCtor
    webkitAudioContext?: AudioContextCtor
  }
  return g.AudioContext ?? g.webkitAudioContext ?? null
}

export function createPlatformSoundEngine(): SoundEngine {
  return createNeuroSoundEngine({
    createContext: () => {
      const Ctor = getWebAudioContextCtor()
      return Ctor ? new Ctor() : null
    },
  })
}
