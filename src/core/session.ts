/**
 * The wind-down session: the heart of Inverna.
 *
 * Over N minutes the screen warms and darkens, sound softens, and games get
 * easier (`calm` 0 → 1). At the end there is no victory screen and no
 * "play again" — only a slow fade to black. A natural stopping point.
 */
export interface Session {
  startedAt: number
  minutes: number
  /** Sound preset playing for this session, or null for silence. */
  presetId: string | null
}

export interface SessionLevels {
  /** Night-filter warmth 0..1 */
  warmth: number
  /** Night-filter dim 0..1 */
  dim: number
  /** Master volume multiplier 0..1 */
  volume: number
  /** Game ease 0..1 — engines slow down / simplify as this rises. */
  calm: number
  /** 0..1 fade to black over the final stretch. */
  fade: number
}

export const SESSION_LENGTHS = [15, 30, 45, 60] as const

/** Seconds of the final fade-to-black. */
export const FADE_SECONDS = 24

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const smooth = (t: number) => t * t * (3 - 2 * t)

export function sessionElapsed(s: Session, now: number): number {
  return Math.max(0, (now - s.startedAt) / 1000)
}

export function sessionProgress(s: Session, now: number): number {
  return clamp01(sessionElapsed(s, now) / (s.minutes * 60))
}

export function sessionLevels(s: Session, now: number): SessionLevels {
  const total = s.minutes * 60
  const elapsed = sessionElapsed(s, now)
  const p = clamp01(elapsed / total)
  const t = smooth(p)
  const fadeStart = total - FADE_SECONDS
  return {
    warmth: 0.45 + 0.55 * t,
    dim: 0.05 + 0.45 * t,
    volume: 1 - 0.6 * t,
    calm: clamp01(p * 1.15),
    fade: elapsed <= fadeStart ? 0 : smooth(clamp01((elapsed - fadeStart) / FADE_SECONDS)),
  }
}

/** When the wind-down ends: its deadline, whenever the app happens to notice. */
export function sessionEnd(s: Session): number {
  return s.startedAt + s.minutes * 60_000
}

export function sessionDone(s: Session, now: number): boolean {
  return sessionElapsed(s, now) >= s.minutes * 60
}
