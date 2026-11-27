import type { GameId } from './games/catalog'

export type ScoreDirection = 'higher' | 'lower'

export interface HighScoreSpec {
  readonly mode: ScoreDirection
  /** Short metric name shown in telemetry & Home tiles. */
  readonly label: string
  /** Singular/plural unit formatter. */
  readonly unit: string
  readonly unitSingular?: string
}

export interface HighScoreEntry {
  readonly value: number
  readonly updatedAt: number
}

/**
 * Keyed by game, or `game:variant` for games whose boards differ in size
 * (Drift 3×3 and 4×4, Lanterns 6 and 8 pairs), so one size's record never
 * stands for another's.
 */
export type HighScoreTable = Partial<Record<string, HighScoreEntry>>

export const scoreKey = (gameId: GameId, variant?: string): string => (variant ? `${gameId}:${variant}` : gameId)

export const EMPTY_HIGH_SCORES: HighScoreTable = {}

/**
 * Canonical personal-best definition for all 14 games.
 * Keeps every game's record authentic (e.g. fewer moves in 15-puzzle,
 * higher score in 2048/Breakout/Cascade, longest rally in Pong).
 */
export const HIGH_SCORE_SPECS: Record<GameId, HighScoreSpec> = {
  kumiko: { mode: 'higher', label: 'Knots', unit: 'knots', unitSingular: 'knot' },
  settle: { mode: 'higher', label: 'Best lines', unit: 'lines', unitSingular: 'line' },
  cascade: { mode: 'higher', label: 'Best score', unit: 'pts', unitSingular: 'pt' },
  hue: { mode: 'lower', label: 'Fewest moves', unit: 'moves', unitSingular: 'move' },
  thread: { mode: 'higher', label: 'Puzzles solved', unit: 'solved' },
  kindle: { mode: 'higher', label: 'Best score', unit: 'pts', unitSingular: 'pt' },
  pond: { mode: 'higher', label: 'Lanterns', unit: 'lanterns', unitSingular: 'lantern' },
  drift: { mode: 'lower', label: 'Fewest moves', unit: 'moves', unitSingular: 'move' },
  nine: { mode: 'higher', label: 'Puzzles solved', unit: 'solved' },
  weave: { mode: 'higher', label: 'Puzzles solved', unit: 'solved' },
  dim: { mode: 'higher', label: 'Boards cleared', unit: 'cleared' },
  lanterns: { mode: 'lower', label: 'Fewest moves', unit: 'moves', unitSingular: 'move' },
  rally: { mode: 'higher', label: 'Best rally', unit: 'hits', unitSingular: 'hit' },
  chime: { mode: 'higher', label: 'Best score', unit: 'pts', unitSingular: 'pt' },
}

export function isBetterScore(gameId: GameId, candidate: number, currentBest: number | null): boolean {
  if (!Number.isFinite(candidate) || candidate <= 0) return false
  const clean = Math.floor(candidate)
  if (clean <= 0) return false
  if (currentBest === null) return true
  const spec = HIGH_SCORE_SPECS[gameId]
  return spec.mode === 'higher' ? clean > currentBest : clean < currentBest
}

export function bestFor(table: HighScoreTable, gameId: GameId, variant?: string): number | null {
  const entry = table[scoreKey(gameId, variant)]
  return entry && Number.isFinite(entry.value) && entry.value > 0 ? entry.value : null
}

/** The record set most recently in any size of a game (for Play's tiles). */
export function latestBest(table: HighScoreTable, gameId: GameId): number | null {
  let latest: HighScoreEntry | null = null
  for (const [key, entry] of Object.entries(table)) {
    if (!entry || !(key === gameId || key.startsWith(`${gameId}:`))) continue
    if (!Number.isFinite(entry.value) || entry.value <= 0) continue
    if (!latest || entry.updatedAt > latest.updatedAt) latest = entry
  }
  return latest ? latest.value : null
}

export function recordScore(
  table: HighScoreTable,
  gameId: GameId,
  candidate: number,
  nowMs: number,
  variant?: string,
): { table: HighScoreTable; isNewBest: boolean; best: number | null } {
  const current = bestFor(table, gameId, variant)
  if (!isBetterScore(gameId, candidate, current)) {
    return { table, isNewBest: false, best: current }
  }
  const value = Math.floor(candidate)
  return {
    table: {
      ...table,
      [scoreKey(gameId, variant)]: { value, updatedAt: nowMs },
    },
    isNewBest: true,
    best: value,
  }
}

function formatNumber(n: number): string {
  return Math.floor(n).toLocaleString('en-US')
}

export function formatScoreValue(gameId: GameId, value: number): string {
  const spec = HIGH_SCORE_SPECS[gameId]
  const n = Math.floor(value)
  const unit = n === 1 && spec.unitSingular ? spec.unitSingular : spec.unit
  if (spec.unit === 'pts') return formatNumber(n)
  return `${formatNumber(n)} ${unit}`
}

export function formatBestCompact(gameId: GameId, value: number | null): string | null {
  if (value === null || value <= 0) return null
  const spec = HIGH_SCORE_SPECS[gameId]
  const n = Math.floor(value)
  if (spec.unit === 'pts') return formatNumber(n)
  if (spec.unit === 'moves') return `${formatNumber(n)}m`
  if (spec.unit === 'lines') return `${formatNumber(n)}L`
  if (spec.unit === 'hits') return `${formatNumber(n)}x`
  return formatNumber(n)
}
