import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PRESETS, SILENT_MIX, type Mix } from '@/core/sound/catalog'

// The store talks to the sound engine through `@/platform`; record what it asks for.
const engine = vi.hoisted(() => {
  const calls: { name: string; args: unknown[] }[] = []
  const pause: (() => void)[] = []
  const play: ((mix: unknown) => void)[] = []
  const interruption: ((event: unknown) => void)[] = []
  const rec =
    (name: string) =>
    (...args: unknown[]) => {
      calls.push({ name, args })
    }
  return {
    calls,
    pause,
    play,
    interruption,
    sound: {
      prepare: rec('prepare'),
      reset: rec('reset'),
      onInterruption: (fn: (event: unknown) => void) => {
        interruption.push(fn)
        return () => {}
      },
      unlock: async () => {},
      setMix: rec('setMix'),
      setDescent: rec('setDescent'),
      setHarmonicKey: rec('setHarmonicKey'),
      setMaster: rec('setMaster'),
      scheduleSleepFade: rec('scheduleSleepFade'),
      cancelSleepFade: rec('cancelSleepFade'),
      stop: rec('stop'),
      cue: rec('cue'),
      setCuesEnabled: rec('setCuesEnabled'),
      setNowPlayingMeta: rec('setNowPlayingMeta'),
      onExternalPause: (fn: () => void) => {
        pause.push(fn)
        return () => {}
      },
      onExternalPlay: (fn: (mix: unknown) => void) => {
        play.push(fn)
        return () => {}
      },
      isRunning: false,
    },
  }
})

vi.mock('@/platform', () => ({ sound: engine.sound, bootPlatform: () => {} }))

const { useSound } = await import('./sound')
const { useSettings } = await import('./settings')
const { useSession } = await import('./session')

const RAIN: Mix = { ...SILENT_MIX, layers: { rain: 0.6 } }
const preset = PRESETS[0]!
const last = (name: string) => [...engine.calls].reverse().find((c) => c.name === name)
const interrupt = (event: unknown) => {
  for (const fn of engine.interruption) fn(event)
}

beforeEach(() => {
  useSound.getState().stop(0)
  useSound.setState({ presetId: null, mix: null, mixMeta: null })
  useSettings.setState({ sleepTimer: 30 })
  useSession.setState({ session: null, ended: false })
  engine.calls.length = 0
  vi.useRealTimers()
})

describe('sound store: start, edit, stop', () => {
  it('playing a preset starts it with the sleep timer armed on the audio clock', () => {
    const before = Date.now()
    useSound.getState().playPreset(preset.id)
    const st = useSound.getState()
    expect(st.playing).toBe(true)
    expect(st.presetId).toBe(preset.id)
    expect(st.stopAt).toBeGreaterThanOrEqual(before + 30 * 60_000)
    expect(last('scheduleSleepFade')?.args[0]).toBe(30 * 60)
    expect(last('setMix')?.args[0]).toEqual(preset.mix)
  })

  it('a timer of 0 plays all night', () => {
    useSound.getState().playPreset(preset.id, 0)
    expect(useSound.getState().stopAt).toBeNull()
    expect(last('cancelSleepFade')).toBeDefined()
  })

  it('playing a silent mix is stopped, not playing silence', () => {
    useSound.getState().playMix(SILENT_MIX)
    expect(useSound.getState().playing).toBe(false)
  })

  it('editing the mix while playing keeps the deadline', () => {
    useSound.getState().playMix(RAIN, undefined, { title: 'Mine', hint: 'Rain', icon: 'rain' })
    const stopAt = useSound.getState().stopAt
    useSound.getState().updateMix({ ...RAIN, layers: { rain: 0.3, waves: 0.4 } })
    const st = useSound.getState()
    expect(st.playing).toBe(true)
    expect(st.stopAt).toBe(stopAt)
    expect(st.mixMeta?.title).toBe('Mine')
    expect(engine.calls.filter((c) => c.name === 'scheduleSleepFade')).toHaveLength(1)
  })

  it('turning every layer down while playing stops the sound and the timer', () => {
    useSound.getState().playMix(RAIN)
    useSound.getState().updateMix(SILENT_MIX)
    expect(useSound.getState().playing).toBe(false)
    expect(useSound.getState().stopAt).toBeNull()
  })

  it('stop clears playing and the deadline', () => {
    useSound.getState().playPreset(preset.id)
    useSound.getState().stop()
    expect(useSound.getState()).toMatchObject({ playing: false, stopAt: null })
    expect(last('stop')).toBeDefined()
  })

  it('changing the timer while playing moves the deadline', () => {
    useSound.getState().playPreset(preset.id, 30)
    useSound.getState().setTimer(60)
    expect(useSound.getState().stopAt! - Date.now()).toBeGreaterThan(59 * 60_000)
    expect(last('scheduleSleepFade')?.args[0]).toBe(60 * 60)
  })
})

describe('sound store: the lock screen and interruptions', () => {
  it('a pause from outside the app stops the store', () => {
    useSound.getState().playPreset(preset.id)
    for (const fn of engine.pause) fn()
    expect(useSound.getState().playing).toBe(false)
  })

  it('a play from outside the app re-arms the timer', () => {
    useSound.getState().playPreset(preset.id)
    for (const fn of engine.pause) fn()
    for (const fn of engine.play) fn(preset.mix)
    expect(useSound.getState().playing).toBe(true)
    expect(useSound.getState().stopAt).not.toBeNull()
  })

  // ISS-03.2: a call keeps the deadline; afterwards the sound comes back with
  // what's left of the timer, not a fresh one.
  it('resuming after an interruption keeps the original deadline', () => {
    useSound.getState().playPreset(preset.id, 30)
    const stopAt = useSound.getState().stopAt!
    interrupt({ phase: 'began' })
    expect(useSound.getState()).toMatchObject({ playing: false, interrupted: true, stopAt })
    vi.useFakeTimers({ toFake: ['Date'], now: Date.now() + 10 * 60_000 })
    interrupt({ phase: 'ended', shouldResume: true })
    expect(useSound.getState()).toMatchObject({ playing: true, stopAt })
    expect(last('scheduleSleepFade')?.args[0]).toBeCloseTo((stopAt - Date.now()) / 1000, 0)
  })

  it("doesn't play again when the deadline passed during the interruption", () => {
    useSound.getState().playPreset(preset.id, 30)
    interrupt({ phase: 'began' })
    vi.useFakeTimers({ toFake: ['Date'], now: Date.now() + 31 * 60_000 })
    interrupt({ phase: 'ended', shouldResume: true })
    expect(useSound.getState().playing).toBe(false)
    expect(last('stop')?.args[1]).toEqual({ hideNotification: true })
  })

  it("doesn't play again when the sound was stopped during the interruption", () => {
    useSound.getState().playPreset(preset.id, 30)
    interrupt({ phase: 'began' })
    useSound.getState().stop()
    engine.calls.length = 0
    interrupt({ phase: 'ended', shouldResume: true })
    expect(useSound.getState().playing).toBe(false)
    expect(last('setMix')).toBeUndefined()
  })

  it("doesn't play again when the OS says not to", () => {
    useSound.getState().playPreset(preset.id, 30)
    interrupt({ phase: 'began' })
    interrupt({ phase: 'ended', shouldResume: false })
    expect(useSound.getState()).toMatchObject({ playing: false, interrupted: false, stopAt: null })
  })

  // ISS-15.3: setTimer used to rename a saved sound to "Your mix" on the lock screen.
  it("changing the timer keeps a saved sound's name", () => {
    useSound.getState().playMix(RAIN, undefined, { title: 'Mine', hint: 'Rain', icon: 'rain' })
    useSound.getState().setTimer(60)
    expect((last('setNowPlayingMeta')?.args[0] as { title: string }).title).toBe('Mine')
  })
})

describe('sound store: one deadline', () => {
  it('a wind-down in progress ends the sound with it, even with a longer timer', () => {
    useSession.setState({ session: { startedAt: Date.now(), minutes: 20, presetId: null }, ended: false })
    useSound.getState().playPreset(preset.id, 60)
    const end = useSession.getState().session!.startedAt + 20 * 60_000
    expect(useSound.getState().stopAt).toBe(end)
  })

  it('starting a wind-down moves the deadline of what is playing', () => {
    useSound.getState().playPreset(preset.id, 0)
    expect(useSound.getState().stopAt).toBeNull()
    useSession.getState().start(15, preset.id)
    expect(useSound.getState().stopAt).toBe(useSession.getState().session!.startedAt + 15 * 60_000)
    useSession.getState().dismiss()
    expect(useSound.getState().stopAt).toBeNull()
  })

  // ISS-04: Erase all data leaves nothing to show or resume on the lock screen.
  it('reset forgets what was loaded', () => {
    useSound.getState().playMix(RAIN, undefined, { id: 'mine-1', title: 'Mine', hint: '', icon: 'rain' })
    useSound.getState().reset()
    expect(useSound.getState()).toMatchObject({ playing: false, presetId: null, mix: null, mixMeta: null, stopAt: null })
    expect(last('reset')).toBeDefined()
  })
})
