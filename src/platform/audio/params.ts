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
export function rampParam(param: AudioParamLike, target: number, rampSeconds: number, now: number): void {
  const safeNow = Number.isFinite(now) ? Math.max(0, now) : 0
  const duration = Math.max(0, Number.isFinite(rampSeconds) ? rampSeconds : 0)
  const safeTarget = Number.isFinite(target) ? target : 0
  const currentVal = Number.isFinite(param.value) ? param.value : safeTarget

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
