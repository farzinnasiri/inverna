/**
 * Hooks every game screen uses. Keep game screens thin: engines live in
 * src/core/games/<id>, screens only render state and forward input.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { GameId } from '@/core/games/catalog'
import { readJSON, writeJSON } from '@/core/storage'
import { sessionLevels } from '@/core/session'
import type { CueName } from '@/core/sound/engine'
import { haptics, sound } from '@/platform'
import type { HapticIntent } from '@/platform/web/haptics'
import { useSession } from '../state/session'
import { useSettings } from '../state/settings'

/**
 * requestAnimationFrame loop. `callback` receives the frame delta in ms
 * (clamped to 100ms so a backgrounded tab never jumps the simulation).
 * Native: swap for Reanimated's useFrameCallback.
 */
export function useGameLoop(callback: (dtMs: number) => void, running: boolean): void {
  const cb = useRef(callback)
  cb.current = callback
  useEffect(() => {
    if (!running) return
    let raf = 0
    let last = performance.now()
    const frame = (now: number) => {
      const dt = Math.min(100, now - last)
      last = now
      cb.current(dt)
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [running])
}

/**
 * Per-game persistent blob at key `game:<id>`. Store a serialisable snapshot
 * (resume state, best score, play count). Write on meaningful moments
 * (piece locked, move made), never every frame.
 */
export function useGameSave<T>(id: GameId, fallback: T): [T, (next: T | ((prev: T) => T)) => void] {
  const key = `game:${id}`
  const [value, setValue] = useState<T>(() => readJSON<T>(key, fallback))
  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const v = typeof next === 'function' ? (next as (p: T) => T)(prev) : next
        writeJSON(key, v)
        return v
      })
    },
    [key],
  )
  return [value, set]
}

/**
 * Current game ease, 0..1. 0 outside a wind-down session; rises to 1 as the
 * session ends. Engines read it to slow gravity, shrink boards, etc.
 * Re-evaluates every 5 seconds — changes are meant to be imperceptible.
 */
export function useCalm(): number {
  const session = useSession((s) => s.session)
  const [calm, setCalm] = useState(() => (session ? sessionLevels(session, Date.now()).calm : 0))
  useEffect(() => {
    if (!session) {
      setCalm(0)
      return
    }
    const update = () => setCalm(sessionLevels(session, Date.now()).calm)
    update()
    const id = window.setInterval(update, 5000)
    return () => window.clearInterval(id)
  }, [session])
  return calm
}

/** Sound cue + haptic, both respecting the user's settings. */
export function useFeedback() {
  const sfx = useSettings((s) => s.sfx)
  const vibrate = useSettings((s) => s.haptics)
  const cue = useCallback(
    (name: CueName, volume = 1) => {
      if (sfx) sound.cue(name, volume)
    },
    [sfx],
  )
  const haptic = useCallback(
    (intent: HapticIntent) => {
      if (vibrate) haptics.play(intent)
    },
    [vibrate],
  )
  return { cue, haptic }
}

export type SwipeDir = 'left' | 'right' | 'up' | 'down'

export interface GestureHandlers {
  onTap?: (x: number, y: number) => void
  /** Fired once per gesture on release, if it travelled far or fast enough. */
  onSwipe?: (dir: SwipeDir, velocity: number) => void
  /** Continuous drag, in px from the gesture start. */
  onDrag?: (dx: number, dy: number, phase: 'start' | 'move' | 'end') => void
}

/**
 * Pointer gestures on an element: tap, swipe (with velocity), drag.
 * Multi-touch safe — only the first pointer is tracked.
 */
export function useGestures<T extends HTMLElement>(handlers: GestureHandlers) {
  const ref = useRef<T>(null)
  const h = useRef(handlers)
  h.current = handlers
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let id: number | null = null
    let sx = 0
    let sy = 0
    let st = 0
    let dragging = false
    const down = (e: PointerEvent) => {
      if (id !== null) return
      id = e.pointerId
      sx = e.clientX
      sy = e.clientY
      st = performance.now()
      dragging = false
      el.setPointerCapture(e.pointerId)
    }
    const move = (e: PointerEvent) => {
      if (e.pointerId !== id) return
      const dx = e.clientX - sx
      const dy = e.clientY - sy
      if (!dragging && Math.hypot(dx, dy) > 8) {
        dragging = true
        h.current.onDrag?.(0, 0, 'start')
      }
      if (dragging) h.current.onDrag?.(dx, dy, 'move')
    }
    const up = (e: PointerEvent) => {
      if (e.pointerId !== id) return
      id = null
      const dx = e.clientX - sx
      const dy = e.clientY - sy
      const dt = Math.max(1, performance.now() - st)
      const dist = Math.hypot(dx, dy)
      if (dragging) h.current.onDrag?.(dx, dy, 'end')
      if (dist < 10 && dt < 350) {
        const r = el.getBoundingClientRect()
        h.current.onTap?.(e.clientX - r.left, e.clientY - r.top)
        return
      }
      const velocity = dist / dt
      if (dist > 28 || velocity > 0.45) {
        const dir: SwipeDir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up'
        h.current.onSwipe?.(dir, velocity)
      }
    }
    const cancel = (e: PointerEvent) => {
      if (e.pointerId !== id) return
      id = null
      if (dragging) h.current.onDrag?.(0, 0, 'end')
    }
    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', cancel)
    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', cancel)
    }
  }, [])
  return ref
}

/** Keyboard input for desktop testing. Ignores repeats unless `repeat` is true. */
export function useKeys(map: Record<string, () => void>, active: boolean, repeat = false): void {
  const m = useRef(map)
  m.current = map
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat && !repeat) return
      const fn = m.current[e.key] ?? m.current[e.code]
      if (fn) {
        e.preventDefault()
        fn()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, repeat])
}
