import type { Mix } from './catalog'

/**
 * Short, soft feedback sounds for games. Never sharp, never loud.
 * - tap:    a piece moves / a tile is picked up (very quiet)
 * - place:  something settles into place
 * - clear:  a small success (a row clears, a pair matches)
 * - chime:  a puzzle is solved (rare; warm two-note bell)
 * - undo:   a step back
 */
export type CueName = 'tap' | 'place' | 'clear' | 'chime' | 'undo'

/**
 * Platform-agnostic sound engine contract.
 *
 * Web implementation: Web Audio API (src/platform/web/sound).
 * Native migration path: `react-native-audio-api` mirrors the Web Audio API,
 * so the web implementation ports almost line for line.
 */
export interface SoundEngine {
  /** Must be called from a user gesture before anything is audible (autoplay rules). */
  unlock(): Promise<void>
  /** Crossfade to a new mix over `fadeSeconds` (default 1.5s). */
  setMix(mix: Mix, fadeSeconds?: number): void
  /** Master volume 0..1 with an optional ramp. */
  setMaster(volume: number, rampSeconds?: number): void
  /** Fade everything to silence and release resources. */
  stop(fadeSeconds?: number): void
  /** Play a short game cue. `volume` 0..1 scales it further. No-op when muted. */
  cue(name: CueName, volume?: number): void
  /** Cues on/off (ambient mix unaffected). */
  setCuesEnabled(enabled: boolean): void
  readonly isRunning: boolean
}
