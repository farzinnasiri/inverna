import { eveningState } from '../evening'
import { nightKey, type Schedule } from '../night'

/**
 * The sheets a game can show over its board, and where closing one returns
 * to. GameShell runs on this; the games keep their own state.
 *
 * - `door`: before play starts (difficulty, Continue or New game).
 * - `help`, `audio`, `new`, `nudge`: over the board, the door or Pause.
 * - No sheet: playing, or paused (the Pause sheet, which is the game's own
 *   `paused` flag, not a state here).
 */
export type ShellSheet = 'door' | 'help' | 'audio' | 'new' | 'nudge'

/** Where closing the open sheet goes back to. */
export type ShellReturn = 'door' | 'play' | 'pause'

export interface ShellState {
  sheet: ShellSheet | null
  returnTo: ShellReturn
}

export type ShellEvent =
  /** Open a sheet. `paused`: the game is paused under it right now. */
  | { type: 'open'; sheet: Exclude<ShellSheet, 'door'>; paused: boolean }
  /** Close the open sheet (its button, the backdrop or a drag). */
  | { type: 'close' }
  /** Leave the door into play (Continue, New game, or closing the door). */
  | { type: 'enter' }
  /** A new game (or this one again) from the New game sheet: back to play. */
  | { type: 'startOver' }

export const SHELL_START: ShellState = { sheet: 'door', returnTo: 'play' }

export function shellReducer(state: ShellState, event: ShellEvent): ShellState {
  switch (event.type) {
    case 'open': {
      // Bedtime never interrupts the door or another sheet.
      if (event.sheet === 'nudge' && state.sheet !== null) return state
      if (state.sheet === 'door') return { sheet: event.sheet, returnTo: 'door' }
      if (state.sheet !== null) return { sheet: event.sheet, returnTo: state.returnTo }
      return { sheet: event.sheet, returnTo: event.paused ? 'pause' : 'play' }
    }
    case 'close':
      if (state.sheet === null) return state
      if (state.sheet === 'door') return { sheet: null, returnTo: 'play' }
      if (state.returnTo === 'door') return SHELL_START
      return { sheet: null, returnTo: state.returnTo }
    case 'enter':
    case 'startOver':
      return { sheet: null, returnTo: 'play' }
  }
}

/**
 * Whether the game should be paused after going from `prev` to `next`:
 * true under any sheet, false back in play, and unchanged (null) when a
 * sheet closes back to Pause.
 */
export function shellPause(prev: ShellState, next: ShellState): boolean | null {
  if (next.sheet !== null) return true
  if (prev.sheet !== null && prev.returnTo === 'pause') return null
  return prev.sheet === null ? null : false
}

/** How long after bedtime the in-game prompt may still appear. */
export const NUDGE_WINDOW_MIN = 45

/** Whether to ask "It's your bedtime" now: at bedtime or just past it, once a night. */
export function bedtimeNudgeDue(schedule: Schedule, now: Date, nudgedNight: string | null): boolean {
  if (nudgedNight === nightKey(now)) return false
  const ev = eveningState(schedule, now)
  const justPast = ev.kind === 'past' && (ev.minutesSinceBedtime ?? 99) <= NUDGE_WINDOW_MIN
  const atBedtime = ev.kind === 'winding' && (ev.minutesToBedtime ?? 99) <= 0
  return justPast || atBedtime
}
