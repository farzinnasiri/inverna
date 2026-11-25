import { describe, expect, it } from 'vitest'
import { rampParam, setParam } from './params'
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
