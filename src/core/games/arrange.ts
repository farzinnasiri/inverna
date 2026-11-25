/**
 * The order of the games on Play, and which two get the wide tiles.
 *
 * Three layers, shortest-lived wins:
 * 1. Tonight's check-in (one night) picks the lead game.
 * 2. Otherwise the person's own favourites, once they've played enough to
 *    tell, take the wide tiles.
 * 3. Underneath, the order for their intent: from onboarding, or tonight's.
 *
 * Pure: no React, no time.
 */
import { GAMES, GAMES_BY_INTENT, type GameId, type NightIntent } from './catalog'

/** Plays in total before favourites count, and plays of one game before it can be one. */
export const LEARN_AFTER_PLAYS = 10
export const FAVOURITE_MIN_PLAYS = 3

/** The bento's wide slots: row 1 left and row 3 right (see Play). */
const WIDE_SLOTS = [0, 6] as const

export function favourites(plays: Partial<Record<GameId, number>>): GameId[] {
  const total = Object.values(plays).reduce((a, b) => a + (b ?? 0), 0)
  if (total < LEARN_AFTER_PLAYS) return []
  return (Object.entries(plays) as [GameId, number][])
    .filter(([, n]) => n >= FAVOURITE_MIN_PLAYS)
    .sort((a, b) => b[1] - a[1])
    .slice(0, WIDE_SLOTS.length)
    .map(([id]) => id)
}

export function arrangeGames({
  tonight,
  usual,
  plays,
}: {
  /** From tonight's check-in; null when not answered tonight. */
  tonight: NightIntent | null
  /** From onboarding; null if skipped. */
  usual: NightIntent | null
  plays: Partial<Record<GameId, number>>
}): { order: GameId[]; wide: GameId[] } {
  const base = [...GAMES_BY_INTENT[tonight ?? usual ?? 'melt']]
  const known = new Set(GAMES.map((g) => g.id))
  const order = base.filter((id) => known.has(id))
  const favs = favourites(plays)

  // Tonight's pick leads for one night; favourites fill the remaining wide slot(s).
  const pinned: GameId[] = tonight ? [order[0]!, ...favs.filter((f) => f !== order[0])] : favs
  const slots = pinned.slice(0, WIDE_SLOTS.length)
  const rest = order.filter((id) => !slots.includes(id))
  const result = [...rest]
  WIDE_SLOTS.forEach((slot, i) => {
    const id = slots[i]
    if (id) result.splice(slot, 0, id)
  })
  const wide = WIDE_SLOTS.map((slot) => result[slot]!).filter(Boolean)
  return { order: result, wide }
}
