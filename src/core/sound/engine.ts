import type { DescentSnapshot } from './arc'
import type { Mix } from './catalog'
import type { HarmonicKeyId } from './harmonics'

/**
 * Short, soft feedback sounds for games. Never sharp, never loud, and
 * automatically quantized into the active soundscape's musical scale.
 * - tap:    a piece moves / a tile is picked up (quiet felt note)
 * - place:  something settles into place (warm root-fifth dyad)
 * - clear:  a small success (ascending pentatonic interval)
 * - chime:  a puzzle is solved (rare; serene 3-note candle-bell arpeggio)
 * - undo:   a step back (soft downward interval)
 */
export type CueName = 'tap' | 'place' | 'clear' | 'chime' | 'undo'

/**
 * Platform-agnostic real-time neuroacoustic sound engine contract.
 *
 * Powered by one unified Web Audio synthesis graph:
 * - Web: browser `AudioContext`
 * - iOS / Android: `react-native-audio-api` (native C++ CoreAudio / Oboe)
 */
export interface SoundEngine {
  /** Must be called from a user gesture before anything is audible (autoplay rules). */
  unlock(): Promise<void>
  /** Crossfade to a new mix over `fadeSeconds` (default 1.5s). */
  setMix(mix: Mix, fadeSeconds?: number): void
  /** Apply live 60-minute Iso-descent parameters (AM rate, depth, warmth, breath, cue darkness). */
  setDescent?(snapshot: DescentSnapshot, rampSeconds?: number): void
  /** Lock harmonic game cues to a specific key (even while ambient playback is paused). */
  setHarmonicKey?(keyId: HarmonicKeyId): void
  /** Master volume 0..1 with an optional ramp. */
  setMaster(volume: number, rampSeconds?: number): void
  /** Fade everything to silence and release resources. */
  stop(fadeSeconds?: number): void
  /** Play a short scale-quantized game cue. `volume` 0..1 scales it further. No-op when muted. */
  cue(name: CueName, volume?: number): void
  /** Cues on/off (ambient mix unaffected). */
  setCuesEnabled(enabled: boolean): void
  /** Optional native Lock Screen / Dynamic Island Now Playing metadata. */
  setNowPlayingMeta?(meta: { title: string; subtitle?: string } | null): void
  /** Optional listener invoked when OS Lock Screen / Control Center pauses playback. */
  onExternalPause?(listener: () => void): () => void
  /** Optional listener invoked when OS Lock Screen / Control Center resumes playback. */
  onExternalPlay?(listener: () => void): () => void
  readonly isRunning: boolean
}
