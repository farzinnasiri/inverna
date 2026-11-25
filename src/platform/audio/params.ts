import type { AudioParamLike } from './types'

/**
 * Small Web Audio helpers for click-free parameter ramping and defensive cleanup.
 */

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.max(min, Math.min(max, value))
}

/**
 * Smoothly ramps an AudioParam from its current value to `target` without clicks.
 *
 * CRITICAL for `react-native-audio-api@1.0.1` (`ParamRenderQueue.cpp`):
 * - Setting `param.value = x` does NOT push an event into `ParamRenderQueue`, so
 *   calling `linearRampToValueAtTime` without a preceding `setValueAtTime` falls back
 *   to C++ `defaultValue_` (e.g. `1.0` for GainNodes!) and `startTime = 0`.
 * - `cancelAndHoldAtTime(now)` does NOT insert a `SET_VALUE` anchor when the queue is
 *   empty or the previous ramp already ended, causing the next ramp to start at the
 *   old expired `endTime` (an instant jump/pop!).
 *
 * Always anchoring `setValueAtTime(currentVal, safeNow)` immediately before
 * `linearRampToValueAtTime` makes ramps click-free on BOTH Web Audio and native C++.
 */
/**
 * Where a linear ramp we scheduled is at `now`. The native audio library's
 * `param.value` does not follow automation (it keeps reporting the last value
 * *set*), so callers that ramp a param repeatedly track it with this instead.
 */
export interface RampTrack {
  from: number
  to: number
  t0: number
  t1: number
}

export function trackedValue(track: RampTrack, now: number): number {
  if (now >= track.t1) return track.to
  if (now <= track.t0) return track.from
  return track.from + ((track.to - track.from) * (now - track.t0)) / (track.t1 - track.t0)
}

/** Ramp a tracked param from where it really is now, and update the track. */
export function rampTracked(param: AudioParamLike, track: RampTrack, target: number, rampSeconds: number, now: number): void {
  const from = trackedValue(track, now)
  const duration = Math.max(0, Number.isFinite(rampSeconds) ? rampSeconds : 0)
  rampParam(param, target, duration, now, from)
  track.from = from
  track.to = Number.isFinite(target) ? target : 0
  track.t0 = now
  track.t1 = now + duration
}

/**
 * Where every param's last ramp was heading, so the next ramp starts from where
 * the sound really is. Without this, a second change read `param.value` (the
 * last value *set*, on native) and jumped back before ramping: audible as a
 * short sweep on every sound switch. Params are stable per node, so a WeakMap
 * keyed by the param object follows them and forgets them with the node.
 */
const lastRamp = new WeakMap<object, RampTrack>()

/** Where a param really is now (its last ramp, if we scheduled one), for code that schedules by hand. */
export function paramNow(param: AudioParamLike, now: number): number {
  const known = lastRamp.get(param)
  if (known) return trackedValue(known, now)
  return Number.isFinite(param.value) ? param.value : 0
}

/**
 * Give a param its starting value. Use this instead of `param.value = x` for
 * anything a ramp may later start from.
 *
 * On native (react-native-audio-api), `param.value = x` is applied on the
 * audio thread a moment later, and reading `param.value` straight back still
 * returns the library default: 1.0 for a gain, 440 Hz for an oscillator. A
 * ramp started from that read began every new sound at full volume with a
 * 440 Hz tone sliding down (the burst heard on every play and switch). This
 * records the value we meant, so `rampParam` starts from it, never from a read.
 */
export function setParam(param: AudioParamLike, value: number): void {
  const v = Number.isFinite(value) ? value : 0
  param.value = v
  lastRamp.set(param, { from: v, to: v, t0: 0, t1: 0 })
}

/** Record a ramp scheduled by hand (not through rampParam), so the next ramp starts from it. */
export function noteRamp(param: AudioParamLike, track: RampTrack): void {
  lastRamp.set(param, { ...track })
}

export function rampParam(param: AudioParamLike, target: number, rampSeconds: number, now: number, from?: number): void {
  const safeNow = Number.isFinite(now) ? Math.max(0, now) : 0
  const duration = Math.max(0, Number.isFinite(rampSeconds) ? rampSeconds : 0)
  const safeTarget = Number.isFinite(target) ? target : 0
  const known = lastRamp.get(param)
  const currentVal =
    from !== undefined && Number.isFinite(from)
      ? from
      : known
        ? trackedValue(known, safeNow)
        : Number.isFinite(param.value)
          ? param.value
          : safeTarget
  lastRamp.set(param, { from: currentVal, to: safeTarget, t0: safeNow, t1: safeNow + (duration <= 0.002 ? 0 : duration) })

  try {
    if (typeof param.cancelAndHoldAtTime === 'function') {
      param.cancelAndHoldAtTime(safeNow)
    } else {
      param.cancelScheduledValues(safeNow)
    }
  } catch {
    try {
      param.cancelScheduledValues(safeNow)
    } catch {
      param.value = safeTarget
      return
    }
  }

  if (duration <= 0.002) {
    try {
      param.setValueAtTime(safeTarget, safeNow)
    } catch {
      param.value = safeTarget
    }
    return
  }

  try {
    param.setValueAtTime(currentVal, safeNow)
    param.linearRampToValueAtTime(safeTarget, safeNow + duration)
  } catch {
    param.value = safeTarget
  }
}

export function safeStop(node: { stop: (when?: number) => void } | null | undefined, when?: number): void {
  if (!node) return
  try {
    node.stop(when)
  } catch {
    // Ignore already-stopped or never-started source nodes.
  }
}

export function safeDisconnect(node: { disconnect: () => void } | null | undefined): void {
  if (!node) return
  try {
    node.disconnect()
  } catch {
    // Ignore already-disconnected nodes.
  }
}
