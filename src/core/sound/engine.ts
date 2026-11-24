import type { DescentSnapshot } from './arc'
import type { Mix, SoundIconId, SoundSceneId } from './catalog'
import type { HarmonicKeyId } from './harmonics'

export type CueName = 'tap' | 'place' | 'clear' | 'chime' | 'undo'

export interface NowPlayingMeta {
  title: string
  subtitle?: string
  /** Drives exact 1-to-1 per-soundscape Dynamic Island & Lock Screen artwork. */
  icon?: SoundIconId
  scene?: SoundSceneId
}

export interface SoundEngine {
  unlock(): Promise<void>
  setMix(mix: Mix, fadeSeconds?: number): void
  setDescent?(snapshot: DescentSnapshot, rampSeconds?: number): void
  setHarmonicKey?(keyId: HarmonicKeyId): void
  setMaster(volume: number, rampSeconds?: number): void
  stop(fadeSeconds?: number, opts?: { hideNotification?: boolean }): void
  cue(name: CueName, volume?: number): void
  setCuesEnabled(enabled: boolean): void
  setNowPlayingMeta?(meta: NowPlayingMeta | null): void
  onExternalPause?(listener: () => void): () => void
  onExternalPlay?(listener: () => void): () => void
  readonly isRunning: boolean
}
