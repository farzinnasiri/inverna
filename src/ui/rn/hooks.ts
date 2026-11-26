import { useCallback, useEffect, useRef, useState } from 'react'
import { AccessibilityInfo, AppState, Platform, useWindowDimensions } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { GameId } from '@/core/games/catalog'
import { bestFor, formatScoreValue } from '@/core/highscores'
import { loadSaved, writeJSON } from '@/core/storage'
import { sessionLevels } from '@/core/session'
import type { CueName } from '@/core/sound/engine'
import { haptics, sound } from '@/platform'
import type { HapticIntent } from '@/platform/haptics'
import { useHighScores } from '@/ui/state/highscores'
import { useSession } from '@/ui/state/session'
import { useSettings, type Difficulty } from '@/ui/state/settings'

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

/**
 * A game's save, kept on the device. `isSave` is the game's own check of what
 * was stored: anything it rejects (missing, damaged, an old shape) loads as
 * `fallback`. Each change is written to disk once, outside React's updater.
 */
export function useGameSave<T>(
  id: GameId,
  fallback: T,
  isSave: (v: unknown) => v is T,
): [T, (next: T | ((prev: T) => T)) => void] {
  const key = `game:${id}`
  const [value, setValue] = useState<T>(() => loadSaved(key, fallback, isSave))
  const latest = useRef(value)
  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      const v = typeof next === 'function' ? (next as (p: T) => T)(latest.current) : next
      if (Object.is(v, latest.current)) return
      latest.current = v
      writeJSON(key, v)
      setValue(v)
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

/**
 * Bottom padding for content on a tab: clears the home indicator and the
 * floating tab bar with a small gap. One value, so every tab ends the same way.
 */
export function tabBarClearance(bottomInset: number): number {
  return Math.max(bottomInset, 12) + (Platform.OS === 'web' ? 12 : 62 + 12)
}

/**
 * Bottom padding for a tab that scrolls: like `tabBarClearance`, plus room for
 * the soft fade iOS draws above the tab bar, so the last line can be scrolled
 * fully clear of it instead of stopping half under the bar.
 */
export function scrollEndClearance(bottomInset: number): number {
  return tabBarClearance(bottomInset) + (Platform.OS === 'web' ? 0 : 28)
}

/** How forgiving each difficulty starts out; winding down softens it further. */
const DIFFICULTY_CALM: Record<Difficulty, number> = { easy: 0.7, medium: 0.3, hard: 0 }

/**
 * Calm level 0..1 for a game: its difficulty sets the floor, and an active wind
 * down eases it the rest of the way as bedtime nears. Re-evaluates every 5s.
 * Without `gameId` it's the wind-down level alone.
 */
export function useCalm(gameId?: GameId): number {
  const session = useSession((s) => s.session)
  const difficulty = useSettings((s) => (gameId ? (s.difficulty[gameId] ?? s.defaultDifficulty) : null))
  const [windDown, setWindDown] = useState(() => (session ? sessionLevels(session, Date.now()).calm : 0))
  useEffect(() => {
    if (!session) {
      setWindDown(0)
      return
    }
    const update = () => setWindDown(sessionLevels(session, Date.now()).calm)
    update()
    const id = setInterval(update, 5000)
    return () => clearInterval(id)
  }, [session])
  const base = difficulty ? DIFFICULTY_CALM[difficulty] : 0
  return base + (1 - base) * windDown
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

/**
 * Shared responsive viewport metrics across iPhone SE (375x667) through
 * iPhone Pro Max (440x956) and desktop web.
 */
export function useResponsiveLayout() {
  const { width, height } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const usableHeight = Math.max(480, height - insets.top - insets.bottom)
  const isCompactHeight = usableHeight < 690
  const isCompactWidth = width < 385
  const isLarge = width >= 420 && usableHeight >= 800
  const sideMargin = isCompactWidth ? 14 : 18
  const frameWidth = Math.min(440, width)
  const contentWidth = Math.max(280, frameWidth - sideMargin * 2)

  return {
    width,
    height,
    insets,
    usableHeight,
    isCompact: isCompactHeight || isCompactWidth,
    isCompactHeight,
    isCompactWidth,
    isLarge,
    sideMargin,
    frameWidth,
    contentWidth,
  }
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

/**
 * True while the app is in front. Locked (including the Always-On screen) or
 * switched away, it's false: animations should stop, since nobody sees them
 * and the audio needs the processor more.
 */
export function useAppActive(): boolean {
  const [active, setActive] = useState(() => AppState.currentState === 'active')
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => setActive(state === 'active'))
    return () => sub.remove()
  }, [])
  return active
}

/** Calls `onBackground` when the app moves to the background, the web tab hides, or Goodnight covers the screen. */
export function useBackgroundPause(onBackground: () => void): void {
  const cb = useRef(onBackground)
  cb.current = onBackground
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') cb.current()
    })
    // The wind-down ended under a game: pause it (and checkpoint) like leaving the app.
    const unsubSession = useSession.subscribe((s, prev) => {
      if (s.ended && !prev.ended) cb.current()
    })
    const onVis = () => {
      if (typeof document !== 'undefined' && document.hidden) cb.current()
    }
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVis)
    }
    return () => {
      sub.remove()
      unsubSession()
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
