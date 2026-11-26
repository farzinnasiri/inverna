/**
 * One slow clock for everything that moves on its own: the scene behind the
 * tabs, the orb, the ribbon, the Mix studio's picture.
 *
 * Why not a frame callback or a repeating animation each: those run at the
 * display's full rate (120 Hz on ProMotion iPhones) and keep the screen there,
 * even if they only draw every fourth frame. And every Liquid Glass surface
 * over a moving scene redraws its glass each time the scene changes. Lull's
 * ambient motion is slow, so 30 steps a second looks the same and costs a
 * fraction: one timer, one wake-up per step, all pictures updated together.
 *
 * `useAmbientTime(active)` gives a component its own seconds counter that
 * only advances while `active` (visible, focused, not covered). The shared
 * timer runs only while at least one component is active.
 */
import { useEffect, useSyncExternalStore } from 'react'
import { makeMutable, useAnimatedReaction, useSharedValue, type SharedValue } from 'react-native-reanimated'

export const AMBIENT_HZ = 30

/** Seconds the shared timer has run. Only steps forward, 30 times a second. */
const ambientTime = makeMutable(0)

let users = 0
let timer: ReturnType<typeof setInterval> | null = null
let elapsed = 0
let last = 0

function retain(): () => void {
  users += 1
  if (users === 1) {
    last = Date.now()
    timer = setInterval(() => {
      const now = Date.now()
      // After a stall (a busy moment, the app waking up), step once, don't race to catch up.
      elapsed += Math.min(0.1, Math.max(0, (now - last) / 1000))
      last = now
      ambientTime.set(elapsed)
    }, 1000 / AMBIENT_HZ)
  }
  return () => {
    users -= 1
    if (users === 0 && timer) {
      clearInterval(timer)
      timer = null
    }
  }
}

/** This component's own seconds counter, advancing only while `active`. */
export function useAmbientTime(active: boolean): SharedValue<number> {
  const local = useSharedValue(0)
  const on = useSharedValue(active)

  useEffect(() => {
    on.set(active)
  }, [active, on])

  useEffect(() => {
    if (!active) return
    return retain()
  }, [active])

  useAnimatedReaction(
    () => ambientTime.get(),
    (t, prev) => {
      if (prev === null || !on.get()) return
      local.set(local.get() + Math.min(0.1, Math.max(0, t - prev)))
    },
  )

  return local
}

/**
 * 0 → 1 → 0 over `periodS` seconds, eased like a sine: the shape of a
 * `withRepeat(withTiming(1, sine in-out), -1, true)` loop, on this clock.
 */
export function swing(t: number, periodS: number, phaseS = 0): number {
  'worklet'
  return 0.5 - 0.5 * Math.cos((2 * Math.PI * (t + phaseS)) / periodS)
}

/* --- Covered: a sheet is over the screen ---------------------------------- */

let covers = 0
const coverListeners = new Set<() => void>()
const notifyCover = () => coverListeners.forEach((l) => l())

/** Marks the screen as covered while mounted (a sheet over it); ambient motion behind rests. */
export function useCoverScreen(covering: boolean): void {
  useEffect(() => {
    if (!covering) return
    covers += 1
    notifyCover()
    return () => {
      covers -= 1
      notifyCover()
    }
  }, [covering])
}

/** True while a sheet covers the screen. */
export function useCovered(): boolean {
  return useSyncExternalStore(
    (l) => {
      coverListeners.add(l)
      return () => coverListeners.delete(l)
    },
    () => covers > 0,
  )
}
