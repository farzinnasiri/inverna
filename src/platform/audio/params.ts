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
 * Uses `cancelAndHoldAtTime` where supported, falling back to `cancelScheduledValues`
 * + `setValueAtTime` for Safari, native runtimes, and lightweight test mocks.
 */
export function rampParam(param: AudioParamLike, target: number, rampSeconds: number, now: number): void {
  const safeNow = Number.isFinite(now) ? Math.max(0, now) : 0
  const duration = Math.max(0, Number.isFinite(rampSeconds) ? rampSeconds : 0)

  try {
    if (typeof param.cancelAndHoldAtTime === 'function') {
      param.cancelAndHoldAtTime(safeNow)
    } else {
      param.cancelScheduledValues(safeNow)
      param.setValueAtTime(param.value, safeNow)
    }
  } catch {
    try {
      param.cancelScheduledValues(safeNow)
      param.setValueAtTime(param.value, safeNow)
    } catch {
      param.value = target
      return
    }
  }

  if (duration <= 0.002) {
    try {
      param.setValueAtTime(target, safeNow)
    } catch {
      param.value = target
    }
    return
  }

  try {
    param.linearRampToValueAtTime(target, safeNow + duration)
  } catch {
    param.value = target
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
