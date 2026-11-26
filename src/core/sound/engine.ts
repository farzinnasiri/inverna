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
  /**
   * The sound likely to play next: work out what it needs in the background
   * so it starts at once. Touches no audio session.
   */
  prepare?(mix: Mix): void
  setMix(mix: Mix, fadeSeconds?: number): void
  setDescent?(snapshot: DescentSnapshot, rampSeconds?: number): void
  setHarmonicKey?(keyId: HarmonicKeyId): void
  setMaster(volume: number, rampSeconds?: number): void
  /**
   * Schedule a CoreAudio/WebAudio-thread fade-out on the native audio timeline so
   * sleep timers fade cleanly to silence on time even when iOS suspends JS while locked.
   */
  scheduleSleepFade?(delaySeconds: number, fadeSeconds?: number): void
  /** Cancel any pending native sleep-timer fade-out and restore unity gain. */
  cancelSleepFade?(): void
  stop(fadeSeconds?: number, opts?: { hideNotification?: boolean }): void
  cue(name: CueName, volume?: number): void
  setCuesEnabled(enabled: boolean): void
  setNowPlayingMeta?(meta: NowPlayingMeta | null): void
  onExternalPause?(listener: () => void): () => void
  /** OS Play (headphones, lock screen); `mix` is what resumed. */
  onExternalPlay?(listener: (mix: Mix) => void): () => void
  readonly isRunning: boolean
}
