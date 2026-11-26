import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PRESETS, SILENT_MIX, type Mix } from '@/core/sound/catalog'

// The store talks to the sound engine through `@/platform`; record what it asks for.
const engine = vi.hoisted(() => {
  const calls: { name: string; args: unknown[] }[] = []
  const pause: (() => void)[] = []
  const play: ((mix: unknown) => void)[] = []
  const rec =
    (name: string) =>
    (...args: unknown[]) => {
      calls.push({ name, args })
    }
  return {
    calls,
    pause,
    play,
    sound: {
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

const RAIN: Mix = { ...SILENT_MIX, layers: { rain: 0.6 } }
const preset = PRESETS[0]!
const last = (name: string) => [...engine.calls].reverse().find((c) => c.name === name)

beforeEach(() => {
  useSound.getState().stop(0)
  useSound.setState({ presetId: null, mix: null, mixMeta: null })
  useSettings.setState({ sleepTimer: 30 })
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

  // ISS-03: today an interruption forgets the deadline, and resuming after it
  // starts a fresh full-length timer. Phase 1 step 3 keeps one deadline.
  it.skip('resuming after an interruption keeps the original deadline', () => {
    useSound.getState().playPreset(preset.id, 30)
    const stopAt = useSound.getState().stopAt
    vi.useFakeTimers({ toFake: ['Date'], now: Date.now() + 10 * 60_000 })
    for (const fn of engine.pause) fn()
    for (const fn of engine.play) fn(preset.mix)
    expect(useSound.getState().stopAt).toBe(stopAt)
  })

  // ISS-15.3: setTimer renames a saved sound to "Your mix" on the lock screen.
  it.skip("changing the timer keeps a saved sound's name", () => {
    useSound.getState().playMix(RAIN, undefined, { title: 'Mine', hint: 'Rain', icon: 'rain' })
    useSound.getState().setTimer(60)
    expect((last('setNowPlayingMeta')?.args[0] as { title: string }).title).toBe('Mine')
  })
})
