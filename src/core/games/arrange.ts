/**
 * The order of the games on Play, which two get the wide tiles, and which
 * ones Inverna suggests tonight.
 *
 * The layout is set once a night (Play keeps it until the next one) so tiles
 * never move while someone is using the app:
 * 1. The person's own favourites, once they've played enough to tell, take
 *    the wide tiles.
 * 2. Underneath, the order for their usual intent (from onboarding).
 *
 * Tonight's check-in doesn't move anything. It picks two or three games that
 * Play marks in place (`tonightPicks`).
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
  tonight = null,
  usual,
  plays,
}: {
  /** From tonight's check-in; null when not answered tonight. Play leaves it out (see tonightPicks). */
  tonight?: NightIntent | null
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

/** How many games Play marks for tonight. */
export const PICKS = 2

/**
 * The games to suggest tonight: the first ones for tonight's check-in, or,
 * before (or without) a check-in, for their usual intent, with their
 * favourite first. Empty when Inverna knows nothing yet, so nothing is marked
 * for no reason.
 */
export function tonightPicks({
  tonight,
  usual,
  plays,
}: {
  tonight: NightIntent | null
  usual: NightIntent | null
  plays: Partial<Record<GameId, number>>
}): GameId[] {
  const intent = tonight ?? usual
  if (!intent) return []
  const forIntent = GAMES_BY_INTENT[intent]
  // Tonight's answer decides alone; on a usual night their favourite leads if it suits the intent.
  const fav = tonight ? [] : favourites(plays).filter((id) => forIntent.slice(0, 6).includes(id)).slice(0, 1)
  return [...fav, ...forIntent.filter((id) => !fav.includes(id))].slice(0, PICKS)
}
