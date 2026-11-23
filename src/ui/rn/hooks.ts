import { useCallback, useEffect, useRef, useState } from 'react'
import { AccessibilityInfo, AppState, Platform } from 'react-native'
import type { GameId } from '@/core/games/catalog'
import { bestFor, formatScoreValue } from '@/core/highscores'
import { readJSON, writeJSON } from '@/core/storage'
import { sessionLevels } from '@/core/session'
import type { CueName } from '@/core/sound/engine'
import { haptics, sound } from '@/platform'
import type { HapticIntent } from '@/platform/haptics'
import { useHighScores } from '@/ui/state/highscores'
import { useSession } from '@/ui/state/session'
import { useSettings } from '@/ui/state/settings'

/**
 * Cross-platform requestAnimationFrame loop (iOS, Android, Web).
 * Clamps dtMs <= 100ms so backgrounding never jumps physics.
 */
export function useGameLoop(callback: (dtMs: number) => void, running: boolean): void {
  const cb = useRef(callback)
  cb.current = callback
  useEffect(() => {
    if (!running) return
    let raf = 0
    let last = Date.now()
    const frame = () => {
      const now = Date.now()
      const dt = Math.min(100, Math.max(1, now - last))
      last = now
      cb.current(dt)
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [running])
}

/** Per-game JSON persistence via universal sync KeyValueStore (`expo-sqlite` on native, `localStorage` on web). */
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
 * Tracks and persists per-game personal bests automatically.
 * Pass `shouldCommit = false` for lower-is-better games until the board is solved.
 */
export function useHighScore(
  gameId: GameId,
  candidate: number | null | undefined,
  shouldCommit = true,
): { best: number | null; formattedBest: string | null; isNewBest: boolean } {
  const table = useHighScores((s) => s.table)
  const record = useHighScores((s) => s.record)
  const [isNewBest, setIsNewBest] = useState(false)
  const best = bestFor(table, gameId)

  useEffect(() => {
    if (!shouldCommit || candidate == null || candidate <= 0) return
    const res = record(gameId, candidate)
    if (res.isNewBest) {
      setIsNewBest(true)
    }
  }, [gameId, candidate, shouldCommit, record])

  const formattedBest = best !== null ? formatScoreValue(gameId, best) : null
  return { best, formattedBest, isNewBest }
}

/** Wind-down calm level 0..1. Re-evaluates every 5s. */
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
    const id = setInterval(update, 5000)
    return () => clearInterval(id)
  }, [session])
  return calm
}

/** Sound cue + haptic feedback respecting user settings. */
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

/** Cross-platform reduced-motion preference. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    let mounted = true
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => mounted && setReduced(v))
      .catch(() => {})
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced)
    return () => {
      mounted = false
      sub.remove()
    }
  }, [])
  return reduced
}

/** Calls `onBackground` when app moves to background or web tab hides. */
export function useBackgroundPause(onBackground: () => void): void {
  const cb = useRef(onBackground)
  cb.current = onBackground
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') cb.current()
    })
    const onVis = () => {
      if (typeof document !== 'undefined' && document.hidden) cb.current()
    }
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVis)
    }
    return () => {
      sub.remove()
      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVis)
      }
    }
  }, [])
}

/** Desktop keyboard listener on Web (no-op on iOS/Android). */
export function useKeys(map: Record<string, () => void>, active: boolean, repeat = false): void {
  const m = useRef(map)
  m.current = map
  useEffect(() => {
    if (!active || Platform.OS !== 'web' || typeof window === 'undefined') return
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
