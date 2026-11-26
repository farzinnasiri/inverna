import { describe, expect, it } from 'vitest'
import { DEFAULT_SCHEDULE, nightKey } from '../night'
import { bedtimeNudgeDue, SHELL_START, shellPause, shellReducer, type ShellEvent, type ShellState } from './shell'

const run = (events: ShellEvent[], from: ShellState = SHELL_START) => events.reduce(shellReducer, from)

describe('game shell', () => {
  it('opens on the door', () => {
    expect(SHELL_START.sheet).toBe('door')
  })

  // ISS-08: Help from the door used to drop the door and leave start-gated games stuck.
  it('closing Help opened from the door goes back to the door', () => {
    const s = run([{ type: 'open', sheet: 'help', paused: true }, { type: 'close' }])
    expect(s.sheet).toBe('door')
  })

  it('closing a sheet opened during play goes back to play', () => {
    const playing = run([{ type: 'enter' }])
    const open = shellReducer(playing, { type: 'open', sheet: 'audio', paused: false })
    const closed = shellReducer(open, { type: 'close' })
    expect(closed.sheet).toBeNull()
    expect(shellPause(playing, open)).toBe(true)
    expect(shellPause(open, closed)).toBe(false)
  })

  it('closing a sheet opened from Pause goes back to Pause', () => {
    const playing = run([{ type: 'enter' }])
    const open = shellReducer(playing, { type: 'open', sheet: 'help', paused: true })
    const closed = shellReducer(open, { type: 'close' })
    expect(closed.sheet).toBeNull()
    expect(shellPause(open, closed)).toBeNull()
  })

  it('New game plays at once', () => {
    const s = run([{ type: 'enter' }, { type: 'open', sheet: 'new', paused: true }, { type: 'startOver' }])
    expect(s).toEqual({ sheet: null, returnTo: 'play' })
  })

  it('bedtime never interrupts the door or another sheet', () => {
    expect(shellReducer(SHELL_START, { type: 'open', sheet: 'nudge', paused: true })).toBe(SHELL_START)
    const help = run([{ type: 'enter' }, { type: 'open', sheet: 'help', paused: false }])
    expect(shellReducer(help, { type: 'open', sheet: 'nudge', paused: true })).toBe(help)
  })

  it('entering from the door resumes play', () => {
    const s = shellReducer(SHELL_START, { type: 'enter' })
    expect(shellPause(SHELL_START, s)).toBe(false)
  })
})

describe('bedtime prompt in a game', () => {
  const schedule = { ...DEFAULT_SCHEDULE, bedtime: '23:00' }

  // The usual range is 23:00 to 00:00: it asks once that's over, for 45 minutes.
  it('asks when the sleep range is over, not before', () => {
    expect(bedtimeNudgeDue(schedule, new Date(2026, 10, 2, 22, 30), null)).toBe(false)
    expect(bedtimeNudgeDue(schedule, new Date(2026, 10, 2, 23, 30), null)).toBe(false)
    expect(bedtimeNudgeDue(schedule, new Date(2026, 10, 3, 0, 10), null)).toBe(true)
    expect(bedtimeNudgeDue(schedule, new Date(2026, 10, 3, 1, 0), null)).toBe(false)
  })

  it('asks once a night', () => {
    const now = new Date(2026, 10, 3, 0, 10)
    expect(bedtimeNudgeDue(schedule, now, nightKey(now))).toBe(false)
  })
})

describe('game table', () => {
  it("every intent's order has each game exactly once", async () => {
    const { GAMES, GAMES_BY_INTENT } = await import('./catalog')
    const all = GAMES.map((g) => g.id).sort()
    for (const order of Object.values(GAMES_BY_INTENT)) expect([...order].sort()).toEqual(all)
  })
})
