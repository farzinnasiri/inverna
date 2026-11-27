/**
 * Kumiko: endless Japanese hairline joinery weave.
 *
 * - Full-bleed `#000000` OLED `GameShell` (`immersive`, `hideBest`)
 * - Pure `react-native-svg` vector joinery rendered on demand (0 FPS at rest)
 * - Night-aware adaptive pacing fed by Inverna's bedtime clock, evening check-in,
 *   sleep profile, active wind-down/sleep timer, and rolling tap telemetry
 * - One quiet, non-disruptive Liquid Glass sleep-timer handoff when drowsy
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native'
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { fallbackFreePreset } from '@/core/access'
import { isArrayOf, isRecord, isString } from '@/core/decode'
import { eveningState, windowProgress } from '@/core/evening'
import {
  createKumiko,
  DEFAULT_NIGHT_CONTEXT,
  isKumikoState,
  kumikoKinetics,
  needsAnimation,
  respondToHandoff,
  takeEvents,
  tapTile,
  tickKumiko,
  wakeKumiko,
  type KumikoNightContext,
  type KumikoState,
} from '@/core/games/kumiko/engine'
import { microseasonFor } from '@/core/games/pond/microseasons'
import { nightKey } from '@/core/night'
import { profileWindDownMinutes } from '@/core/profile'
import { kumikoCopy } from '@/ui/copy'
import { feel } from '@/ui/feel'
import { useTokenColors } from '@/ui/hooks/useTokenColors'
import { GameShell, type GameScreenProps } from '@/ui/rn/GameShell'
import { GLASS_TINT, GlassSurface } from '@/ui/rn/Glass'
import { useCalm, useFeedback, useGameLoop, useGameSave, useKeys, useReducedMotion } from '@/ui/rn/hooks'
import { useSession } from '@/ui/state/session'
import { currentSchedule, useSettings } from '@/ui/state/settings'
import { useSound } from '@/ui/state/sound'
import { isAppUnlocked } from '@/ui/state/unlock'
import { computeBoardLayout, KumikoBoard, worldRowToY, type KumikoRipple } from './KumikoBoard'

interface KumikoSave {
  state: KumikoState | null
  discoveredCrests: string[]
}

const DEFAULT_SAVE: KumikoSave = { state: null, discoveredCrests: [] }

function isValidSave(v: unknown): v is KumikoSave {
  return (
    isRecord(v) &&
    (v.state === null || isKumikoState(v.state)) &&
    isArrayOf(isString)(v.discoveredCrests)
  )
}

interface TileAnim {
  from: number
  to: number
  elapsed: number
  duration: number
}

interface CrestToast {
  kanji: string
  name: string
  season: string
}

const CHROME_PLAYING = 0.28
const CHROME_RETURN_MS = 3500
const TICK_CALM_LIMIT = 0.7
const CREST_DISPLAY_MS = 3800
const REST_NOTE_MS = 5200

function pickTimerChoices(defaultMinutes: number): { primary: number; others: readonly [number, number] } {
  if (defaultMinutes <= 20) return { primary: 15, others: [30, 45] }
  if (defaultMinutes >= 40) return { primary: 45, others: [15, 30] }
  return { primary: 30, others: [15, 45] }
}

export function KumikoScreen({ onExit }: GameScreenProps) {
  const { color, pieces } = useTokenColors()
  const calm = useCalm('kumiko')
  const reduced = useReducedMotion()
  const { cue, haptic } = useFeedback()
  const [saved, setSaved, flushSave] = useGameSave('kumiko', DEFAULT_SAVE, isValidSave)

  const [paused, setPaused] = useState(false)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [chrome, setChrome] = useState({ top: 56, bottom: 24 })
  const [handoffOpen, setHandoffOpen] = useState(false)
  const [crestToast, setCrestToast] = useState<CrestToast | null>(null)
  const [focusedKey, setFocusedKey] = useState<string | null>(null)
  const [ripples, setRipples] = useState<KumikoRipple[]>([])
  const [visualDegs, setVisualDegs] = useState<Record<string, number>>({})

  const chromeOpacity = useSharedValue(1)
  const restVeil = useSharedValue(0)
  const restNoteOpacity = useSharedValue(0)
  const chromeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const crestTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const restNoteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const animsRef = useRef<Map<string, TileAnim>>(new Map())
  const ripplesRef = useRef<KumikoRipple[]>([])
  const rippleIdRef = useRef(1)

  /** Build live snapshot of Inverna's night signals for Kumiko's pure pacing model. */
  const readNightContext = useCallback((): KumikoNightContext => {
    const now = new Date()
    const st = useSettings.getState()
    const soundSt = useSound.getState()
    const today = nightKey(now)
    const ev = eveningState(currentSchedule(now), now)
    const checkedInTonight = st.checkInAnsweredNight === today
    const stopAt = soundSt.stopAt
    const minsLeft = stopAt !== null && stopAt > now.getTime() ? Math.max(1, Math.round((stopAt - now.getTime()) / 60_000)) : null

    return {
      ...DEFAULT_NIGHT_CONTEXT,
      calm,
      difficulty: st.difficulty.kumiko ?? st.defaultDifficulty,
      eveningKind: ev.kind,
      windowProgress: windowProgress(ev, now),
      minutesToBedtime: ev.minutesToBedtime,
      minutesSinceBedtime: ev.minutesSinceBedtime,
      tonightDay: checkedInTonight ? st.tonightDay : null,
      tonightNow: checkedInTonight ? st.tonightNow : null,
      tonightIntent: checkedInTonight ? st.tonightIntent : null,
      profileMind: st.profile?.mind ?? null,
      profileHabits: st.profile?.habits ?? [],
      profileFactors: st.profile?.factors ?? [],
      hasActiveTimer: minsLeft !== null,
      timerMinutesLeft: minsLeft,
      bedtimeNudgeAlreadyShown: st.bedtimeNudgeNight === today,
    }
  }, [calm])

  const [state, setState] = useState<KumikoState>(() => {
    if (saved.state && isKumikoState(saved.state)) {
      return { ...saved.state, resting: false, events: [] }
    }
    return createKumiko({
      seed: Date.now() & 0x7fffffff,
      calm,
      context: readNightContext(),
      discoveredCrests: saved.discoveredCrests,
    })
  })

  const stateRef = useRef(state)
  stateRef.current = state

  const layout = useMemo(
    () => computeBoardLayout(size.w, size.h, chrome.top, chrome.bottom),
    [size.w, size.h, chrome.top, chrome.bottom],
  )

  const touchChrome = useCallback(() => {
    if (chromeTimerRef.current) clearTimeout(chromeTimerRef.current)
    chromeOpacity.set(withTiming(CHROME_PLAYING, { duration: 420, easing: Easing.out(Easing.quad) }))
    chromeTimerRef.current = setTimeout(() => {
      chromeOpacity.set(withTiming(1, { duration: 600, easing: Easing.out(Easing.quad) }))
    }, CHROME_RETURN_MS)
  }, [chromeOpacity])

  useEffect(() => {
    return () => {
      if (chromeTimerRef.current) clearTimeout(chromeTimerRef.current)
      if (crestTimerRef.current) clearTimeout(crestTimerRef.current)
      if (restNoteTimerRef.current) clearTimeout(restNoteTimerRef.current)
    }
  }, [])

  // Fade the rest veil smoothly when entering/waking from rest mode.
  useEffect(() => {
    restVeil.set(withTiming(state.resting ? 1 : 0, { duration: reduced ? 160 : 900, easing: Easing.out(Easing.quad) }))
    if (state.resting) {
      restNoteOpacity.set(withTiming(1, { duration: 500 }))
      if (restNoteTimerRef.current) clearTimeout(restNoteTimerRef.current)
      restNoteTimerRef.current = setTimeout(() => {
        restNoteOpacity.set(withTiming(0, { duration: 1400 }))
      }, REST_NOTE_MS)
    } else {
      restNoteOpacity.set(withTiming(0, { duration: 200 }))
    }
  }, [state.resting, reduced, restVeil, restNoteOpacity])

  const commitState = useCallback(
    (rawNext: KumikoState, persist: boolean) => {
      const { state: clean, events } = takeEvents(rawNext)
      stateRef.current = clean
      setState(clean)

      const kinetics = kumikoKinetics(clean.pacing, calm)
      let pushedRipple = false

      for (const ev of events) {
        switch (ev.type) {
          case 'turn':
            cue('tap', 0.85)
            if (kinetics.effectiveCalm < TICK_CALM_LIMIT) haptic('tick')
            break
          case 'align':
            cue('place', 0.92)
            haptic('settle')
            break
          case 'knot':
            cue('clear', 1)
            haptic('reward')
            ripplesRef.current.push({
              id: rippleIdRef.current++,
              cx: ev.cx,
              cy: ev.cy,
              progress: 0,
              isCrest: false,
            })
            pushedRipple = true
            break
          case 'crest': {
            cue('chime', 1)
            haptic('complete')
            ripplesRef.current.push({
              id: rippleIdRef.current++,
              cx: ev.cx,
              cy: ev.cy,
              progress: 0,
              isCrest: true,
            })
            pushedRipple = true
            const now = new Date()
            const season = microseasonFor(now.getMonth() + 1, now.getDate())
            setCrestToast({ kanji: ev.kanji, name: ev.name, season: season.english })
            if (crestTimerRef.current) clearTimeout(crestTimerRef.current)
            crestTimerRef.current = setTimeout(() => setCrestToast(null), CREST_DISPLAY_MS)
            break
          }
          case 'handoff':
            setHandoffOpen(true)
            chromeOpacity.set(withTiming(1, { duration: 400 }))
            break
          case 'idleSettle':
            // Silent by design (nothing felt for events the player didn't cause).
            break
        }
      }

      if (pushedRipple) setRipples([...ripplesRef.current])
      if (persist) {
        setSaved({ state: clean, discoveredCrests: clean.discoveredCrests }, { defer: true })
      }
    },
    [calm, cue, haptic, setSaved, chromeOpacity],
  )

  const handleTapTile = useCallback(
    (bandId: number, r: number, c: number) => {
      const cur = stateRef.current
      if (cur.resting) {
        commitState(wakeKumiko(cur), false)
        return
      }
      const band = cur.bands.find((b) => b.id === bandId)
      const tile = band?.tiles.find((t) => t.r === r && t.c === c)
      if (!tile || tile.solved) return

      const ctx = readNightContext()
      const next = tapTile(cur, bandId, r, c, ctx)
      if (next === cur) return

      // Schedule smooth rotation animation on this tile (or instant for reduced motion).
      const key = `${bandId}:${r}:${c}`
      const updatedBand = next.bands.find((b) => b.id === bandId)
      const updatedTile = updatedBand?.tiles.find((t) => t.r === r && t.c === c)
      if (updatedTile) {
        if (reduced) {
          animsRef.current.delete(key)
          setVisualDegs((prev) => ({ ...prev, [key]: updatedTile.targetDeg }))
        } else {
          const kinetics = kumikoKinetics(next.pacing, ctx.calm)
          const existing = animsRef.current.get(key)
          const currentDeg = existing
            ? existing.from + (existing.to - existing.from) * (1 - Math.pow(1 - Math.min(1, existing.elapsed / existing.duration), 3))
            : tile.targetDeg
          animsRef.current.set(key, {
            from: currentDeg,
            to: updatedTile.targetDeg,
            elapsed: 0,
            duration: kinetics.rotateMs,
          })
        }
      }

      touchChrome()
      commitState(next, true)
    },
    [commitState, readNightContext, reduced, touchChrome],
  )

  // Determine whether the frame loop needs to run (0 FPS when completely still!).
  const loopActive =
    !paused &&
    (animsRef.current.size > 0 ||
      ripplesRef.current.length > 0 ||
      needsAnimation(state) ||
      (!state.resting && (state.pacing.sleepySignal >= 0.55 || calm >= 0.65)))

  useGameLoop((dtMs) => {
    const cur = stateRef.current
    const ctx = readNightContext()

    // 1. Step smooth tile rotations.
    if (animsRef.current.size > 0) {
      const nextDegs: Record<string, number> = {}
      for (const [key, anim] of animsRef.current.entries()) {
        anim.elapsed += dtMs
        const t = Math.min(1, anim.elapsed / Math.max(1, anim.duration))
        const eased = 1 - Math.pow(1 - t, 3)
        nextDegs[key] = anim.from + (anim.to - anim.from) * eased
        if (t >= 1) animsRef.current.delete(key)
      }
      setVisualDegs((prev) => ({ ...prev, ...nextDegs }))
    }

    // 2. Step expanding brass ripples.
    if (ripplesRef.current.length > 0) {
      const dur = 680 + Math.max(calm, cur.pacing.sleepySignal) * 520
      ripplesRef.current = ripplesRef.current
        .map((rp) => ({ ...rp, progress: rp.progress + dtMs / dur }))
        .filter((rp) => rp.progress < 1)
      setRipples([...ripplesRef.current])
    }

    // 3. Step scroll glide & high-calm idle handoff.
    const stepped = tickKumiko(cur, dtMs, ctx)
    if (stepped !== cur) {
      commitState(stepped, stepped.latestKnotId !== cur.latestKnotId)
    }
  }, loopActive)

  // Hit-test pointer taps directly against visible open tiles.
  const handlePressBoard = useCallback(
    (x: number, y: number) => {
      const cur = stateRef.current
      if (cur.resting) {
        commitState(wakeKumiko(cur), false)
        return
      }
      if (paused) return
      let best: { bandId: number; r: number; c: number; dist: number } | null = null
      const maxDist = layout.cell * 0.58

      for (const band of cur.bands) {
        if (band.solved) continue
        for (const tile of band.tiles) {
          if (tile.solved) continue
          const tx = layout.gridX + (tile.c + 0.5) * layout.cell
          const ty = worldRowToY(tile.worldRow, cur.scrollRow, layout)
          const d = Math.hypot(x - tx, y - ty)
          if (d < maxDist && (!best || d < best.dist)) {
            best = { bandId: band.id, r: tile.r, c: tile.c, dist: d }
          }
        }
      }
      if (best) {
        setFocusedKey(null)
        handleTapTile(best.bandId, best.r, best.c)
      }
    },
    [commitState, handleTapTile, layout, paused],
  )

  // Web keyboard navigation across open tiles in the focus band.
  const moveFocus = useCallback((delta: number) => {
    const cur = stateRef.current
    const focusBand = cur.bands.find((b) => !b.solved)
    if (!focusBand) return
    const openTiles = focusBand.tiles.filter((t) => !t.solved)
    if (openTiles.length === 0) return
    const currentIdx = focusedKey
      ? openTiles.findIndex((t) => `${focusBand.id}:${t.r}:${t.c}` === focusedKey)
      : -1
    const next = openTiles[(currentIdx + delta + openTiles.length) % openTiles.length]!
    setFocusedKey(`${focusBand.id}:${next.r}:${next.c}`)
  }, [focusedKey])

  const rotateFocused = useCallback(() => {
    const cur = stateRef.current
    const focusBand = cur.bands.find((b) => !b.solved)
    if (!focusBand) return
    const openTiles = focusBand.tiles.filter((t) => !t.solved)
    if (openTiles.length === 0) return
    const currentIdx = focusedKey
      ? openTiles.findIndex((t) => `${focusBand.id}:${t.r}:${t.c}` === focusedKey)
      : -1
    const target = openTiles[Math.max(0, currentIdx)]!
    setFocusedKey(`${focusBand.id}:${target.r}:${target.c}`)
    handleTapTile(focusBand.id, target.r, target.c)
  }, [focusedKey, handleTapTile])

  useKeys(
    {
      ArrowRight: () => moveFocus(1),
      ArrowDown: () => moveFocus(1),
      ArrowLeft: () => moveFocus(-1),
      ArrowUp: () => moveFocus(-1),
      ' ': rotateFocused,
      Enter: rotateFocused,
      Escape: () => {
        if (handoffOpen) setHandoffOpen(false)
      },
    },
    !paused,
  )

  const handleNewGame = useCallback(() => {
    animsRef.current.clear()
    ripplesRef.current = []
    setRipples([])
    setVisualDegs({})
    setCrestToast(null)
    setHandoffOpen(false)
    const fresh = createKumiko({
      seed: (Date.now() ^ Math.floor(Math.random() * 1e9)) & 0x7fffffff,
      calm,
      context: readNightContext(),
      discoveredCrests: stateRef.current.discoveredCrests,
    })
    commitState(fresh, true)
    flushSave()
  }, [calm, commitState, flushSave, readNightContext])

  /** Accept sleep handoff: arm or preserve Sleep timer, log lightsOut, fade into rest stillness. */
  const acceptRest = useCallback(
    (timerMinutes?: number) => {
      feel('commit')
      const now = new Date()
      const st = useSettings.getState()
      const soundSt = useSound.getState()
      st.set({ bedtimeNudgeNight: nightKey(now), lastLightsOutNight: nightKey(now) })
      st.recordSleep('lightsOut', now)

      if (typeof timerMinutes === 'number' && timerMinutes > 0) {
        if (soundSt.playing) {
          soundSt.setTimer(timerMinutes)
        } else {
          useSession.getState().dismiss()
          soundSt.playPreset(fallbackFreePreset(st.sessionPreset ?? 'theta-rain', isAppUnlocked()), timerMinutes)
        }
      }

      setHandoffOpen(false)
      const next = respondToHandoff(stateRef.current, 'rest', readNightContext())
      commitState(next, true)
      flushSave()
    },
    [commitState, flushSave, readNightContext],
  )

  const chooseSlower = useCallback(() => {
    setHandoffOpen(false)
    const next = respondToHandoff(stateRef.current, 'slower', readNightContext())
    commitState(next, true)
  }, [commitState, readNightContext])

  const liveSoundStopAt = useSound((s) => s.stopAt)
  const sessionMinutes = useSettings((s) => s.sessionMinutes)
  const profile = useSettings((s) => s.profile)
  const defaultTimer = profile ? profileWindDownMinutes(profile) : sessionMinutes || 30
  const timerChoices = useMemo(() => pickTimerChoices(defaultTimer), [defaultTimer])
  const timerMinsLeft =
    liveSoundStopAt !== null && liveSoundStopAt > Date.now()
      ? Math.max(1, Math.round((liveSoundStopAt - Date.now()) / 60_000))
      : null

  const restVeilStyle = useAnimatedStyle(() => ({
    opacity: restVeil.get(),
  }))
  const restNoteStyle = useAnimatedStyle(() => ({
    opacity: restNoteOpacity.get(),
  }))

  const onLayoutStage = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout
    if (width > 0 && height > 0) setSize({ w: width, h: height })
  }, [])

  const immersive = useMemo(
    () => ({
      chromeOpacity,
      backdrop: (c: { top: number; bottom: number }) => {
        if (c.top !== chrome.top || c.bottom !== chrome.bottom) {
          queueMicrotask(() => setChrome(c))
        }
        return (
          <View style={StyleSheet.absoluteFill} onLayout={onLayoutStage}>
            <KumikoBoard
              state={state}
              layout={layout}
              chromeTop={c.top}
              visualDegs={visualDegs}
              ripples={ripples}
              focusedKey={focusedKey}
              color={color}
              pieces={pieces}
            />
          </View>
        )
      },
    }),
    [chromeOpacity, chrome.top, chrome.bottom, onLayoutStage, state, layout, visualDegs, ripples, focusedKey, color, pieces],
  )

  return (
    <GameShell
      gameId="kumiko"
      hideBest
      paused={paused}
      onPauseChange={(p) => {
        setPaused(p)
        if (p) flushSave()
      }}
      onRestart={handleNewGame}
      onNewGame={handleNewGame}
      onExit={() => {
        flushSave()
        onExit()
      }}
      readyHint={kumikoCopy.doorHint}
      immersive={immersive}
    >
      <Pressable
        style={styles.touchLayer}
        accessibilityRole="button"
        accessibilityLabel={kumikoCopy.boardLabel}
        onPress={(e) => handlePressBoard(e.nativeEvent.locationX, e.nativeEvent.locationY)}
      >
        {/* Whisper-quiet Japanese crest discovery seal */}
        {crestToast && !state.resting ? (
          <View pointerEvents="none" style={[styles.crestSeal, { bottom: Math.max(chrome.bottom, 24) + 18 }]}>
            <Text style={[styles.crestKanji, { color: color.accent }]}>{crestToast.kanji}</Text>
            <Text style={[styles.crestName, { color: color.ink }]}>{crestToast.name}</Text>
            <Text style={[styles.crestSeason, { color: color.ink3 }]}>{crestToast.season}</Text>
          </View>
        ) : null}

        {/* Quiet once-per-night sleep-handoff & Sleep timer strip */}
        {handoffOpen && !state.resting ? (
          <View style={[styles.handoffWrap, { top: chrome.top + 10 }]}>
            <GlassSurface variant="card" radius={18} style={styles.handoffCard}>
              <Text style={[styles.handoffTitle, { color: color.ink }]}>
                {timerMinsLeft !== null ? kumikoCopy.handoffWithTimer(timerMinsLeft) : kumikoCopy.handoffTitle}
              </Text>
              <View style={styles.handoffActions}>
                {timerMinsLeft !== null ? (
                  <>
                    <Pressable onPress={() => acceptRest()} style={styles.pillPress}>
                      <GlassSurface variant="pill" radius={12} tint={GLASS_TINT.suggested} style={styles.pill}>
                        <Text style={[styles.pillText, { color: color.ink }]}>{kumikoCopy.putPhoneDown}</Text>
                      </GlassSurface>
                    </Pressable>
                    <Pressable onPress={chooseSlower} style={styles.pillPress}>
                      <GlassSurface variant="pill" radius={12} style={styles.pill}>
                        <Text style={[styles.pillText, { color: color.ink2 }]}>{kumikoCopy.slowerPace}</Text>
                      </GlassSurface>
                    </Pressable>
                  </>
                ) : (
                  <>
                    <Pressable onPress={() => acceptRest(timerChoices.primary)} style={styles.pillPress}>
                      <GlassSurface variant="pill" radius={12} tint={GLASS_TINT.suggested} style={styles.pill}>
                        <Text style={[styles.pillText, { color: color.ink }]}>
                          {kumikoCopy.sleepTimerPill(timerChoices.primary)}
                        </Text>
                      </GlassSurface>
                    </Pressable>
                    {timerChoices.others.map((m) => (
                      <Pressable key={m} onPress={() => acceptRest(m)} style={styles.pillPress}>
                        <GlassSurface variant="pill" radius={12} style={styles.pillCompact}>
                          <Text style={[styles.pillText, { color: color.ink2 }]}>{kumikoCopy.shortMin(m)}</Text>
                        </GlassSurface>
                      </Pressable>
                    ))}
                    <Pressable onPress={chooseSlower} style={styles.pillPress}>
                      <GlassSurface variant="pill" radius={12} style={styles.pillCompact}>
                        <Text style={[styles.pillText, { color: color.ink3 }]}>{kumikoCopy.keepPlaying}</Text>
                      </GlassSurface>
                    </Pressable>
                  </>
                )}
              </View>
            </GlassSurface>
          </View>
        ) : null}

        {/* Pure OLED fade-to-black rest veil once the player sets the phone down */}
        <Animated.View
          pointerEvents={state.resting ? 'auto' : 'none'}
          style={[StyleSheet.absoluteFill, styles.restVeil, restVeilStyle]}
        >
          <Pressable
            style={styles.restTouch}
            onPress={() => commitState(wakeKumiko(stateRef.current), false)}
            accessibilityLabel={kumikoCopy.restNote}
          >
            <Animated.Text style={[styles.restText, { color: color.ink3 }, restNoteStyle]}>
              {kumikoCopy.restNote}
            </Animated.Text>
          </Pressable>
        </Animated.View>
      </Pressable>
    </GameShell>
  )
}

const styles = StyleSheet.create({
  touchLayer: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  crestSeal: {
    position: 'absolute',
    left: 24,
    right: 24,
    alignItems: 'center',
    gap: 2,
  },
  crestKanji: {
    fontSize: 22,
    fontWeight: '400',
    letterSpacing: 2,
  },
  crestName: {
    fontSize: 14,
    fontWeight: '500',
    letterSpacing: -0.1,
  },
  crestSeason: {
    fontSize: 12,
    fontWeight: '400',
  },
  handoffWrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    alignItems: 'center',
    zIndex: 8,
  },
  handoffCard: {
    width: '100%',
    maxWidth: 380,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  handoffTitle: {
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 19,
  },
  handoffActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pillPress: {
    alignSelf: 'flex-start',
  },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  pillCompact: {
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  pillText: {
    fontSize: 13,
    fontWeight: '500',
  },
  restVeil: {
    backgroundColor: '#000000',
    zIndex: 12,
  },
  restTouch: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  restText: {
    fontSize: 14,
    fontWeight: '400',
    textAlign: 'center',
  },
})
