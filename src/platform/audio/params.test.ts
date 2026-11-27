import { describe, expect, it } from 'vitest'
import { noteRamp, paramNow, rampParam, setParam, trackedValue } from './params'
import type { AudioParamLike } from './types'

/**
 * Like react-native-audio-api: writing `.value` reaches the audio thread later,
 * so reading it straight back still gives the library default.
 */
function laggingParam(defaultValue: number) {
  const calls: [string, number, number][] = []
  const param = {
    get value() {
      return defaultValue
    },
    set value(_v: number) {
      /* applied later, on the audio thread */
    },
    setValueAtTime(v: number, t: number) {
      calls.push(['set', v, t])
    },
    linearRampToValueAtTime(v: number, t: number) {
      calls.push(['ramp', v, t])
    },
    exponentialRampToValueAtTime() {},
    cancelScheduledValues() {},
    cancelAndHoldAtTime() {},
  }
  return { param: param as unknown as AudioParamLike, calls }
}

describe('ramps on brand-new params', () => {
  it('fade a new gain in from silence, not from the library default of full volume', () => {
    const { param, calls } = laggingParam(1)
    setParam(param, 0)
    rampParam(param, 0.3, 1.4, 10)
    expect(calls).toEqual([
      ['set', 0, 10],
      ['ramp', 0.3, 11.4],
    ])
  })

  it('start a new oscillator from its own pitch, not 440 Hz', () => {
    const { param, calls } = laggingParam(440)
    setParam(param, 0.1)
    rampParam(param, 0.12, 1, 3)
    expect(calls[0]).toEqual(['set', 0.1, 3])
  })
})

describe('params the engine never gave a value', () => {
  it('fail loudly instead of guessing from the library default', () => {
    const { param } = laggingParam(1)
    expect(() => rampParam(param, 0.3, 1, 0)).toThrow(/setParam/)
    expect(() => paramNow(param, 0)).toThrow(/setParam/)
  })
})

describe('chained schedules (sleep fade after a short recovery)', () => {
  it('follow the recovery, the hold at full volume, then the fade', () => {
    const track = { from: 0.4, to: 1, t0: 10, t1: 10.25, then: { from: 1, to: 0, t0: 20, t1: 30 } }
    expect(trackedValue(track, 10.125)).toBeCloseTo(0.7, 5)
    expect(trackedValue(track, 15)).toBe(1)
    expect(trackedValue(track, 25)).toBeCloseTo(0.5, 5)
    const { param } = laggingParam(1)
    noteRamp(param, track)
    expect(paramNow(param, 10.125)).toBeCloseTo(0.7, 5)
  })
})

describe('when scheduling throws', () => {
  it('the value is set outright and the next ramp starts from it', async () => {
    const { paramNow, rampParam } = await import('./params')
    const p = {
      value: 0,
      setValueAtTime() {
        throw new Error('native refused')
      },
      linearRampToValueAtTime() {
        throw new Error('native refused')
      },
      exponentialRampToValueAtTime() {},
      cancelScheduledValues() {},
    }
    rampParam(p as never, 0.8, 2, 10, 0)
    expect(p.value).toBe(0.8)
    // Halfway through the ramp that never happened, it's already at 0.8.
    expect(paramNow(p as never, 11)).toBe(0.8)
  })
})
