/**
 * Kumiko: endless Japanese hairline joinery weave.
 *
 * Pure TypeScript types for `src/core/games/kumiko/`. No React, no DOM,
 * no wall-clock calls — time enters every function as an explicit argument.
 */
import type { EveningKind } from '../../evening'
import type { NightIntent } from '../catalog'
import type { Difficulty, PhoneHabit, SleepFactor } from '../../profile'
import type { DayAnswer, NowAnswer } from '../../tonight'

/** Cardinal port bitmask on a tile: North=1, East=2, South=4, West=8. */
export const PORT_N = 1
export const PORT_E = 2
export const PORT_S = 4
export const PORT_W = 8

/**
 * Joinery stroke geometry inside a tile:
 * - `arc`: smooth quarter-circle curves and straight beams
 * - `miter`: crisp 45° wooden bevels (diamonds, hexagons, pagoda eaves)
 * - `twin`: two non-crossing quarter-arcs (shippō weave; enables multi-way closure)
 */
export type TileKind = 'arc' | 'miter' | 'twin'

/** Dusk stone colour indices matching `useTokenColors().pieces`. */
export type DuskTone = 'ochre' | 'straw' | 'sage' | 'clay' | 'rosewood' | 'stone' | 'bone'

export interface KumikoTile {
  /** Local row within its band (0 = top/north of band). */
  r: number
  /** Column on the 5-column tapestry (0..4). */
  c: number
  /** Unbounded world row (increases upward into the endless scroll). */
  worldRow: number
  kind: TileKind
  /** Unrotated port bitmask (always 15 for `twin`). */
  baseMask: number
  /** Canonical port bitmask for crest discovery (or target mask). */
  canonicalMask: number
  /** Canonical twin-arc parity (0 = N↔E & S↔W, 1 = E↔S & W↔N). */
  canonicalParity: 0 | 1
  /** Current quarter-turns clockwise (0..3). */
  turns: number
  /** Cumulative clockwise degrees for smooth unbroken rotation animation. */
  targetDeg: number
  /** True once part of a closed knot. */
  solved: boolean
  /** Monotonic knot id when solved (used to highlight the latest closure in brass). */
  knotId: number
  /** True if solved as part of a canonical Japanese crest discovery. */
  isCrest: boolean
  /** How many times the player tapped this tile while it was open (for overshoot sensing). */
  taps: number
  /** Minimum quarter-turns from its initial scrambled state to a matching orientation. */
  minTurnsToSolve: number
}

export interface KumikoBand {
  id: number
  worldRowBase: number
  tall: number
  tone: DuskTone
  tiles: KumikoTile[]
  solved: boolean
  /** Optional curated Japanese crest id woven into this band. */
  crestId: string | null
  crestName: string | null
  crestKanji: string | null
  /** True when the player closed this band in its canonical crest geometry. */
  crestDiscovered: boolean
}

export interface TapSample {
  /** Monotonic play-clock timestamp (ms). */
  atMs: number
  /** True when this tap rotated past an alignment or exceeded optimal turns on the tile. */
  overshoot: boolean
}

export interface PacingState {
  /** Rolling window of recent tap samples (up to 16). */
  taps: TapSample[]
  /** Rolling window of recent inter-knot durations (up to 6). */
  knotGapsMs: number[]
  /** Player's personal opening baseline tap cadence (ms), learned from early taps. */
  baselineTapMs: number | null
  /** Play-clock timestamp (ms) of the last tap. */
  lastTapMs: number
  /** Play-clock timestamp (ms) of the last completed knot. */
  lastKnotMs: number
  /** 0 = drifting off, 1 = brisk/alert. */
  pace: number
  /** 0..1 continuous drowsiness estimate combining behavior + night context. */
  sleepySignal: number
  /** Consecutive knots resolved while `sleepySignal >= 0.68`. */
  sleepyKnots: number
  /** 0..1 procedural band complexity target. */
  challenge: number
  /** Whether the quiet sleep-handoff strip has already been offered or dismissed tonight. */
  handoffOffered: boolean
  /** Extra softness applied if the player tapped "Slower pace" / "Keep playing". */
  manualSlowOffset: number
}

/**
 * Snapshot of Inverna's night signals passed into Kumiko's pure pacing model.
 * Keeps `src/core/` completely decoupled from Zustand stores and wall clocks.
 */
export interface KumikoNightContext {
  /** Combined calm from `useCalm('kumiko')` (difficulty + wind-down session). */
  calm: number
  difficulty: Difficulty
  eveningKind: EveningKind
  /** 0..1 through the wind-down window before bedtime. */
  windowProgress: number
  minutesToBedtime: number | null
  minutesSinceBedtime: number | null
  tonightDay: DayAnswer | null
  tonightNow: NowAnswer | null
  tonightIntent: NightIntent | null
  /** Onboarding mind busyness 0..1, or null if skipped. */
  profileMind: number | null
  profileHabits: readonly PhoneHabit[]
  profileFactors: readonly SleepFactor[]
  /** True when an active Wind-down session or Sleep timer already has a stop deadline. */
  hasActiveTimer: boolean
  /** Remaining minutes on active Sleep timer / Wind-down, if any. */
  timerMinutesLeft: number | null
  /** True when GameShell's bedtime nudge already fired tonight (avoid double-prompting). */
  bedtimeNudgeAlreadyShown: boolean
}

export type KumikoEvent =
  /** Tile turned, no new neighbor joint aligned yet. */
  | { type: 'turn'; bandId: number; r: number; c: number }
  /** Tile turn clicked one or more neighbor joints into alignment. */
  | { type: 'align'; bandId: number; r: number; c: number; joints: number }
  /** A closed local knot lit up in brass. */
  | { type: 'knot'; knotId: number; cx: number; cy: number; tileCount: number }
  /** A hand-authored Japanese crest was discovered in its canonical geometry. */
  | { type: 'crest'; knotId: number; crestId: string; name: string; kanji: string; firstTime: boolean; cx: number; cy: number }
  /** Sustained drowsiness detected: offer the quiet sleep-handoff strip. */
  | { type: 'handoff' }
  /** Idle auto-settle softly finished a knot while the player rested. */
  | { type: 'idleSettle'; bandId: number }

export interface KumikoState {
  version: 1
  seed: number
  /** Seeded counter for deterministic band generation. */
  rngStep: number
  /** Active visible/upcoming bands, bottom-to-top. */
  bands: KumikoBand[]
  nextWorldRow: number
  nextBandId: number
  /** Target scroll row (bottom reference). */
  targetScrollRow: number
  /** Smoothly interpolated scroll row. */
  scrollRow: number
  knotsClosed: number
  latestKnotId: number
  /** Hand-authored crest ids discovered in canonical geometry (persisted locally). */
  discoveredCrests: string[]
  /** Recently dealt crest ids to prevent back-to-back repeats. */
  recentCrests: string[]
  /** Bands elapsed since the last curated crest band. */
  bandsSinceCrest: number
  /** Monotonic play time in milliseconds. */
  elapsedMs: number
  /** Time since last player touch (for gentle idle handoff). */
  idleMs: number
  /** True once the player chose to put the phone down or idle handoff rested the weave. */
  resting: boolean
  pacing: PacingState
  /** Transient event queue drained by the UI screen for haptics, cues and animations. */
  events: KumikoEvent[]
}
