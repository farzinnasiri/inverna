/**
 * Pond: every pond hides a picture. Draw a loop around buds and the koi swims
 * it, opening what's inside; loop a whole family of matching buds and its
 * stroke of the picture draws itself. When every stroke is drawn, the
 * picture is revealed and becomes the night's painting.
 *
 * The engine (core/games/pond/engine.ts) runs here on the JS thread at 60 fps
 * while something is happening and 30 fps while the pond is quiet; each
 * frame becomes a flat snapshot that the Skia water (PondWater) records on
 * the UI thread. The screen maps touch to lassos and taps, plays each engine
 * event as one cue and at most one haptic, and lays the painting's name,
 * seal, season and two choices over the water.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PanResponder, Pressable, StyleSheet, Text, View, type AccessibilityActionEvent, type LayoutChangeEvent } from 'react-native'
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import Constants from 'expo-constants'
import { SlidersHorizontal } from 'lucide-react-native'
import {
  beginStroke,
  BLOOM_STAGGER_MS,
  cancelStroke,
  closedBuds,
  createPond,
  DEFAULT_TUNING,
  endStroke,
  extendStroke,
  isPondState,
  nextLevel,
  pondPhase,
  pondPicture,
  takeEvents,
  tapPond,
  wakePond,
  tickPond,
  touchPond,
  type PondEvent,
  type PondMode,
  type PondState,
  type PondTuning,
} from '@/core/games/pond/engine'
import { microseasonFor, type Microseason } from '@/core/games/pond/microseasons'
import { pondCopy } from '@/ui/copy'
import { useTokenColors } from '@/ui/hooks/useTokenColors'
import { Button, Segmented } from '@/ui/rn/controls'
import { useSettings, type Difficulty } from '@/ui/state/settings'
import { GameShell, type GameScreenProps } from '@/ui/rn/GameShell'
import { useCalm, useFeedback, useGameLoop, useGameSave, useKeys, useReducedMotion } from '@/ui/rn/hooks'
import { paintingLabelY, type FloraFrame, type PondFrame } from './draw'
import { buildFlora, buildFrame, paintingReadyAt, pondColors, REST_FADE_MS, type PondColors } from './frame'
import { PondTuningPanel, type PondMetrics } from './PondTuningPanel'
import { PondWater } from './PondWater'

interface PondSave {
  state: PondState | null
  /** First-play teaching stage (see PondState.teach). */
  teach: number
  plays: number
  /** Pictures seen lately, so the next pond is a different one. */
  recent: string[]
  /** Pictures (the 18, at your difficulty) or Endless (new patterns, adapting to you). */
  mode?: PondMode
  /** Endless: the level it has settled at for you, 0..1. */
  level?: number
}

const DEFAULT_SAVE: PondSave = { state: null, teach: 0, plays: 0, recent: [], mode: 'pictures' }

/** How hard a pond is dealt (sleepers) at each difficulty; Endless starts here too. */
const LEVEL: Record<Difficulty, number> = { easy: 0.12, medium: 0.42, hard: 0.75 }
/** Late in the night the pond goes easier, whatever the level. */
const CALM_EASING = 0.6

const MODE_OPTIONS: readonly { value: PondMode; label: string }[] = [
  { value: 'pictures', label: pondCopy.modePictures },
  { value: 'endless', label: pondCopy.modeEndless },
]
const RECENT_KEEP = 6

/** Late in the night only the moments you earned are felt, not each tap. */
const TICK_CALM_LIMIT = 0.7
/** The top bar while you play, and how long after your last touch it returns. */
const CHROME_PLAYING = 0.28
const CHROME_RETURN_MS = 3500
const REST_NOTE_MS = 5000
/** Frame pacing: smooth while touched or swimming, gentle while the pond is quiet. */
const ACTIVE_FRAME_MS = 1000 / 60
const QUIET_FRAME_MS = 1000 / 30
const ACTIVE_AFTER_TOUCH_MS = 1500

const scheme = Constants.expoConfig?.scheme
const IS_DEV_VARIANT = (Array.isArray(scheme) ? scheme : [scheme]).includes('inverna-dev')

type Phase = ReturnType<typeof pondPhase>
type EndStage = 0 | 1 | 2

function tonightsSeason(): Microseason {
  const d = new Date()
  return microseasonFor(d.getMonth() + 1, d.getDate())
}

const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

export function PondScreen({ onExit }: GameScreenProps) {
  const { color, pieces } = useTokenColors()
  const calm = useCalm()
  const reduced = useReducedMotion()
  const { cue, haptic } = useFeedback()
  const [saved, setSaved] = useGameSave<PondSave>('pond', DEFAULT_SAVE)
  const difficulty = useSettings((st) => st.difficulty.pond ?? st.defaultDifficulty)
  const difficultyRef = useRef(difficulty)
  difficultyRef.current = difficulty

  const [paused, setPaused] = useState(false)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [phase, setPhase] = useState<Phase>('playing')
  const [endStage, setEndStage] = useState<EndStage>(0)
  const [painted, setPainted] = useState({ name: '', kanji: '', labelY: 0, season: tonightsSeason() })
  const [asleep, setAsleep] = useState(false)
  const [tuning, setTuning] = useState<PondTuning>(DEFAULT_TUNING)
  const [tuningOpen, setTuningOpen] = useState(false)
  const [metrics, setMetrics] = useState<PondMetrics>({ jsMs: 0, uiMs: 0, fps: 0 })

  const frame = useSharedValue<PondFrame | null>(null)
  const flora = useSharedValue<FloraFrame | null>(null)
  const uiMs = useSharedValue(0)
  const chromeOpacity = useSharedValue(1)
  const waterOpacity = useSharedValue(0)
  const restNote = useSharedValue(0)

  const colors = useMemo<PondColors>(
    () => pondColors({ accent: color.accent, ink: color.ink, sage: pieces.sage, straw: pieces.straw, bone: pieces.bone, ochre: pieces.ochre }),
    [color.accent, color.ink, pieces.sage, pieces.straw, pieces.bone, pieces.ochre],
  )

  // Everything the frame loop and touch handlers read lives in refs.
  const stateRef = useRef<PondState | null>(null)
  const sizeRef = useRef(size)
  const chromeRef = useRef({ top: 0, bottom: 0 })
  const calmRef = useRef(calm)
  calmRef.current = calm
  const tuningRef = useRef(tuning)
  tuningRef.current = tuning
  const colorsRef = useRef(colors)
  colorsRef.current = colors
  const reducedRef = useRef(reduced)
  reducedRef.current = reduced
  const pausedRef = useRef(paused)
  pausedRef.current = paused
  const savedRef = useRef(saved)
  savedRef.current = saved
  const phaseRef = useRef<Phase>('playing')
  const endStageRef = useRef<EndStage>(0)
  const chromeTargetRef = useRef(1)
  const lastTouchRef = useRef(0)
  const floraKeyRef = useRef('')
  const accRef = useRef(0)
  const perfRef = useRef({ js: 0, frames: 0, since: 0 })
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>())
  const feedbackRef = useRef({ cue, haptic })
  feedbackRef.current = { cue, haptic }

  const later = useCallback((ms: number, fn: () => void) => {
    const id = setTimeout(() => {
      timers.current.delete(id)
      fn()
    }, ms)
    timers.current.add(id)
  }, [])

  useEffect(() => {
    const set = timers.current
    return () => {
      for (const id of set) clearTimeout(id)
      set.clear()
    }
  }, [])

  const persist = useCallback(
    (extra?: Partial<PondSave>) => {
      const s = stateRef.current
      setSaved((prev) => ({ ...prev, state: s, ...extra }))
    },
    [setSaved],
  )
  const persistRef = useRef(persist)
  persistRef.current = persist

  /* ------------------------------------------------------------- chrome */

  const setChrome = useCallback(
    (target: number, ms: number) => {
      if (chromeTargetRef.current === target) return
      chromeTargetRef.current = target
      chromeOpacity.set(withTiming(target, { duration: ms, easing: Easing.inOut(Easing.quad) }))
    },
    [chromeOpacity],
  )

  /* ----------------------------------------------------------- publishing */

  const publish = useCallback(() => {
    const s = stateRef.current
    const sz = sizeRef.current
    if (!s || sz.w <= 0) return
    frame.set(buildFrame(s, sz, calmRef.current, colorsRef.current, reducedRef.current, tuningRef.current))
    // The still life: only when the pond, the size, the colours or the hour's dimming change.
    const floraKey = `${s.seed}:${s.picture}:${sz.w}x${sz.h}:${colorsRef.current.key}:${Math.round(calmRef.current * 20)}`
    if (floraKey !== floraKeyRef.current) {
      floraKeyRef.current = floraKey
      flora.set(buildFlora(s, sz, calmRef.current, colorsRef.current))
    }

    const ph = pondPhase(s)
    if (ph !== phaseRef.current) {
      phaseRef.current = ph
      setPhase(ph)
      if (ph === 'blooming') {
        const pic = pondPicture(s)
        setPainted({ name: pic.name, kanji: pic.kanji, labelY: paintingLabelY(frame.get() ?? { buds: [] }), season: tonightsSeason() })
      }
      if (ph === 'blooming' || ph === 'painting') setChrome(1, 1400)
      if (ph === 'resting') {
        setChrome(0, 2400)
        restNote.set(withTiming(1, { duration: 1600 }))
        later(REST_NOTE_MS, () => restNote.set(withTiming(0, { duration: 2400 })))
      }
    }
    let stage: EndStage = 0
    const ready = paintingReadyAt(s)
    if (ready !== null && s.restedAt === null) stage = s.timeMs >= ready + 600 ? 2 : s.timeMs >= ready ? 1 : 0
    if (stage !== endStageRef.current) {
      endStageRef.current = stage
      setEndStage(stage)
    }
    if (ph === 'playing') {
      const busy = Boolean(s.stroke || s.route || s.plans.length) && !s.settling
      if (busy || Date.now() - lastTouchRef.current < CHROME_RETURN_MS) {
        if (lastTouchRef.current > 0) setChrome(CHROME_PLAYING, 700)
      } else setChrome(1, 1600)
    }
    if (ph === 'resting' && s.restedAt !== null && s.timeMs - s.restedAt > REST_FADE_MS + 1500) setAsleep(true)
  }, [flora, frame, later, restNote, setChrome])

  /* ------------------------------------------------------------- the pond */

  const makePond = useCallback((): PondState | null => {
    const { w, h } = sizeRef.current
    if (w <= 0 || h <= 0) return null
    const chrome = chromeRef.current
    const sv = savedRef.current
    const mode = sv.mode ?? 'pictures'
    const base = mode === 'endless' ? (sv.level ?? LEVEL[difficultyRef.current]) : LEVEL[difficultyRef.current]
    return createPond({
      mode,
      level: base * (1 - CALM_EASING * calmRef.current),
      seed: Date.now() >>> 0,
      calm: calmRef.current,
      aspect: h / w,
      top: (chrome.top + 8) / w,
      bottom: (chrome.bottom + 24) / w,
      teach: savedRef.current.teach,
      recent: savedRef.current.recent ?? [],
    })
  }, [])

  const resetView = useCallback(() => {
    phaseRef.current = 'playing'
    setPhase('playing')
    endStageRef.current = 0
    setEndStage(0)
    setAsleep(false)
    restNote.set(0)
    setChrome(1, 900)
  }, [restNote, setChrome])

  const startPond = useCallback(() => {
    const fresh = makePond()
    if (!fresh) return
    stateRef.current = fresh
    resetView()
    publish()
    setSaved((prev) => ({
      ...prev,
      state: fresh,
      plays: prev.plays + 1,
      recent: [fresh.picture, ...(prev.recent ?? []).filter((id) => id !== fresh.picture)].slice(0, RECENT_KEEP),
    }))
  }, [makePond, publish, resetView, setSaved])

  // First layout: carry on the pond you left, or deal a new one.
  const handleLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const { width, height } = e.nativeEvent.layout
      if (width <= 0 || height <= 0) return
      const prev = sizeRef.current
      if (Math.abs(prev.w - width) < 1 && Math.abs(prev.h - height) < 1) return
      sizeRef.current = { w: width, h: height }
      setSize(sizeRef.current)
      const aspect = height / width
      const current = stateRef.current ?? (isPondState(savedRef.current.state) ? savedRef.current.state : null)
      const fits = current !== null && current.completedAt === null && Math.abs(current.aspect - aspect) < 0.08
      if (fits) {
        stateRef.current = current
        publish()
      } else {
        startPond()
      }
      waterOpacity.set(withTiming(1, { duration: 700, easing: Easing.out(Easing.quad) }))
    },
    [publish, startPond, waterOpacity],
  )

  /* --------------------------------------------------- cues and haptics */

  const handleEvents = useCallback(
    (events: PondEvent[]) => {
      const { cue: playCue, haptic: feel } = feedbackRef.current
      for (const e of events) {
        if (e.type === 'tap') {
          playCue('tap', 0.26)
          if (calmRef.current <= TICK_CALM_LIMIT) feel('tick')
        } else if (e.type === 'spent') {
          // The breath ran out: a soft low note, nothing felt.
          playCue('place', 0.14)
        } else if (e.type === 'loop') {
          if (e.muddy) {
            // Two families or a sleeper inside: a soft, low note, nothing felt.
            playCue('undo', 0.22)
            continue
          }
          if (e.k === 0 && e.strokes === 0) {
            playCue('place', e.auto ? 0.1 : 0.18)
            continue
          }
          const vol = e.auto ? 0.3 : 0.6
          // k buds, k notes, rising in the soundscape's key.
          for (let i = 0; i < e.k; i++) {
            if (i === 0) playCue('clear', vol)
            else later(i * BLOOM_STAGGER_MS, () => feedbackRef.current.cue('clear', vol * (1 - i * 0.04)))
          }
          const after = Math.max(1, e.k) * BLOOM_STAGGER_MS + 300
          if (e.last) {
            // Endless learns from how this pond went: cleaner play, a harder next pond.
            const done = stateRef.current
            if (done && done.mode === 'endless') {
              const cur = savedRef.current.level ?? LEVEL[difficultyRef.current]
              const lv = nextLevel(cur, { loopsMade: done.loopsMade, muddy: done.muddy, families: done.families.length, auto: e.auto })
              setSaved((prev) => ({ ...prev, level: lv }))
            }
            later(after, () => {
              feedbackRef.current.cue('chime', e.auto ? 0.28 : 0.5)
              if (!e.auto) feedbackRef.current.haptic('complete')
            })
          } else {
            // A stroke of the picture drawing itself gets its own soft chime.
            if (e.strokes > 0) later(after, () => feedbackRef.current.cue('chime', e.auto ? 0.14 : 0.24))
            if (!e.auto) feel('reward')
          }
          persistRef.current()
        } else if (e.type === 'taught') {
          persistRef.current({ teach: e.teach })
        } else if (e.type === 'rest') {
          persistRef.current()
        }
      }
    },
    [later],
  )

  const drain = useCallback(() => {
    const s = stateRef.current
    if (!s) return
    const [events, next] = takeEvents(s)
    stateRef.current = next
    if (events.length) handleEvents(events)
  }, [handleEvents])

  /* ---------------------------------------------------------------- loop */

  useGameLoop(
    useCallback(
      (dtMs: number) => {
        const s = stateRef.current
        if (!s) return
        // 60 fps while a finger is down or the koi is swimming; 30 fps when the pond is quiet.
        const active =
          Boolean(s.stroke || s.route || s.plans.length) ||
          Date.now() - lastTouchRef.current < ACTIVE_AFTER_TOUCH_MS ||
          (s.completedAt !== null && s.timeMs - s.completedAt < 6000)
        accRef.current += dtMs
        if (accRef.current < (active ? ACTIVE_FRAME_MS : QUIET_FRAME_MS) - 2) return
        const dt = Math.min(100, accRef.current)
        accRef.current = 0
        const t0 = IS_DEV_VARIANT ? nowMs() : 0
        stateRef.current = tickPond(s, dt, calmRef.current, tuningRef.current)
        drain()
        publish()
        if (IS_DEV_VARIANT) {
          const p = perfRef.current
          p.js += nowMs() - t0
          p.frames++
          const wall = Date.now()
          if (!p.since) p.since = wall
          if (wall - p.since >= 1000) {
            setMetrics({ jsMs: p.js / p.frames, uiMs: uiMs.get(), fps: (p.frames * 1000) / (wall - p.since) })
            perfRef.current = { js: 0, frames: 0, since: wall }
          }
        }
      },
      [drain, publish, uiMs],
    ),
    !paused && size.w > 0 && !asleep,
  )

  // Calm, colours or Reduce Motion changed while paused: redraw once.
  useEffect(() => {
    publish()
  }, [calm, colors, reduced, publish])

  useEffect(
    () => () => {
      persistRef.current()
    },
    [],
  )

  const handlePauseChange = useCallback((next: boolean) => {
    setPaused(next)
    if (next) {
      const s = stateRef.current
      if (s) stateRef.current = cancelStroke(s)
      persistRef.current()
    }
  }, [])

  /* --------------------------------------------------------------- touch */

  const wakeFromRest = useCallback(() => {
    // A touch in the dark brings the painting and its choices back; nothing restarts.
    const s = stateRef.current
    if (!s) return
    stateRef.current = wakePond(s)
    setAsleep(false)
    restNote.set(withTiming(0, { duration: 600 }))
    publish()
  }, [publish, restNote])

  const touchOrigin = useRef({ x: 0, y: 0 })
  const [panResponder] = useState(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => !pausedRef.current && stateRef.current !== null,
      onMoveShouldSetPanResponder: () => false,
      onPanResponderGrant: (e) => {
        const s = stateRef.current
        const w = sizeRef.current.w
        if (!s || w <= 0) return
        lastTouchRef.current = Date.now()
        if (phaseRef.current === 'resting') {
          wakeFromRest()
          return
        }
        touchOrigin.current = { x: e.nativeEvent.locationX, y: e.nativeEvent.locationY }
        // Every touch starts a lasso; a touch that barely moves becomes a tap.
        stateRef.current = beginStroke(touchPond(s), touchOrigin.current.x / w, touchOrigin.current.y / w)
        publish()
      },
      onPanResponderMove: (_, g) => {
        const s = stateRef.current
        const w = sizeRef.current.w
        if (!s || w <= 0 || !s.stroke) return
        lastTouchRef.current = Date.now()
        stateRef.current = extendStroke(s, (touchOrigin.current.x + g.dx) / w, (touchOrigin.current.y + g.dy) / w, calmRef.current, tuningRef.current)
        drain()
      },
      onPanResponderRelease: () => {
        const s = stateRef.current
        if (!s) return
        lastTouchRef.current = Date.now()
        stateRef.current = endStroke(s, tuningRef.current)
        drain()
        publish()
      },
      onPanResponderTerminate: () => {
        const s = stateRef.current
        if (s) stateRef.current = cancelStroke(s)
      },
      onPanResponderTerminationRequest: () => true,
    }),
  )

  /** VoiceOver, Switch Control and the keyboard: send the koi to the nearest bud. */
  const tapNearest = useCallback(() => {
    const s = stateRef.current
    if (!s || pausedRef.current || phaseRef.current !== 'playing') return
    const open = closedBuds(s)
    if (!open.length) return
    const target = open.reduce((a, b) => (Math.hypot(a.x - s.koi.x, a.y - s.koi.y) <= Math.hypot(b.x - s.koi.x, b.y - s.koi.y) ? a : b))
    lastTouchRef.current = Date.now()
    stateRef.current = tapPond(s, target.x, target.y)
    drain()
  }, [drain])

  const onAccessibilityAction = useCallback(
    (e: AccessibilityActionEvent) => {
      if (e.nativeEvent.actionName === 'activate') tapNearest()
    },
    [tapNearest],
  )

  useKeys(
    {
      ' ': tapNearest,
      Space: tapNearest,
      Enter: tapNearest,
      p: () => handlePauseChange(true),
      P: () => handlePauseChange(true),
      Escape: () => handlePauseChange(true),
    },
    !paused,
  )
  useKeys({ p: () => handlePauseChange(false), P: () => handlePauseChange(false) }, paused)

  /* ------------------------------------------------------- end of round */

  const handleExit = useCallback(() => {
    persistRef.current()
    onExit()
  }, [onExit])

  /* ------------------------------------------------------------- styles */

  const waterStyle = useAnimatedStyle(() => ({ opacity: waterOpacity.get() }))
  const restNoteStyle = useAnimatedStyle(() => ({ opacity: restNote.get() }))

  const backdrop = (chrome: { top: number; bottom: number }) => {
    chromeRef.current = chrome
    return (
      <View style={styles.fill} onLayout={handleLayout}>
        <Animated.View style={[styles.fill, waterStyle]} pointerEvents="none">
          {size.w > 0 ? <PondWater frame={frame} flora={flora} width={size.w} height={size.h} uiMs={IS_DEV_VARIANT ? uiMs : undefined} /> : null}
        </Animated.View>
        <View
          {...panResponder.panHandlers}
          collapsable={false}
          style={styles.fill}
          accessible
          accessibilityLabel={pondCopy.water}
          accessibilityActions={[{ name: 'activate', label: pondCopy.openNearest }]}
          onAccessibilityAction={onAccessibilityAction}
        />
        {size.w > 0 && (phase === 'blooming' || phase === 'painting') ? (
          <EndOverlay
            stage={endStage}
            name={painted.name}
            kanji={painted.kanji}
            labelY={painted.labelY}
            season={painted.season}
            height={size.h}
            bottom={chrome.bottom}
            onAnother={startPond}
            onRest={handleExit}
          />
        ) : null}
        <Animated.View pointerEvents="none" style={[styles.restNote, { bottom: chrome.bottom + size.h * 0.3 }, restNoteStyle]}>
          <Text style={[styles.restText, { color: color.ink3 }]}>{pondCopy.restNote}</Text>
        </Animated.View>
        {IS_DEV_VARIANT && phase === 'playing' ? (
          tuningOpen ? (
            <View style={[styles.tuningWrap, { bottom: chrome.bottom + 12 }]}>
              <PondTuningPanel tuning={tuning} metrics={metrics} onChange={setTuning} onClose={() => setTuningOpen(false)} />
            </View>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Tune Pond"
              onPress={() => setTuningOpen(true)}
              style={[styles.tuneBtn, { bottom: chrome.bottom + 10 }]}
            >
              <SlidersHorizontal size={16} strokeWidth={1.6} color={color.ink4} />
            </Pressable>
          )
        ) : null}
      </View>
    )
  }

  return (
    <GameShell
      gameId="pond"
      hideBest
      readyExtra={
        <Segmented
          label={pondCopy.mode}
          options={MODE_OPTIONS}
          value={saved.mode ?? 'pictures'}
          onChange={(m) => setSaved((prev) => ({ ...prev, mode: m }))}
        />
      }
      paused={paused}
      onPauseChange={handlePauseChange}
      onRestart={startPond}
      onExit={handleExit}
      immersive={{ backdrop, chromeOpacity }}
    >
      {null}
    </GameShell>
  )
}

/* ------------------------------------------------------------------ painting */

function EndOverlay({
  stage,
  name,
  kanji,
  labelY,
  season,
  height,
  bottom,
  onAnother,
  onRest,
}: {
  stage: EndStage
  name: string
  kanji: string
  labelY: number
  season: Microseason
  height: number
  bottom: number
  onAnother: () => void
  onRest: () => void
}) {
  const { color, pieces } = useTokenColors()
  const seal = useSharedValue(0)
  const choices = useSharedValue(0)
  useEffect(() => {
    if (stage >= 1) seal.set(withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) }))
    if (stage >= 2) choices.set(withTiming(1, { duration: 1400, easing: Easing.out(Easing.quad) }))
  }, [stage, seal, choices])
  const sealStyle = useAnimatedStyle(() => ({ opacity: seal.get(), transform: [{ scale: 1.14 - 0.14 * seal.get() }, { rotate: '-4deg' }] }))
  const lineStyle = useAnimatedStyle(() => ({ opacity: seal.get(), transform: [{ translateY: 6 * (1 - seal.get()) }] }))
  const choicesStyle = useAnimatedStyle(() => ({ opacity: choices.get() }))

  // Just under the picture, but never down into the choices.
  const top = Math.min(labelY + 34, height - bottom - 170)

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <View accessible accessibilityRole="image" accessibilityLabel={pondCopy.painting(name, season.english)} style={StyleSheet.absoluteFill} pointerEvents="none">
        <Animated.View style={[styles.label, { top }, lineStyle]}>
          <View style={styles.nameRow}>
            <Text style={[styles.kanji, { color: color.ink }]}>{kanji}</Text>
            <Text style={[styles.name, { color: color.ink2 }]}>{name}</Text>
            <Animated.View style={[styles.seal, { backgroundColor: pieces.sage }, sealStyle]}>
              <Text style={[styles.sealText, { color: color.accentInk }]}>静</Text>
            </Animated.View>
          </View>
          <Text style={[styles.season, { color: color.ink3 }]}>
            {season.kanji}
            {'  ·  '}
            {season.english}
          </Text>
        </Animated.View>
      </View>
      {/* The same buttons as the rest of the app: done (back to Play) on the left, the next pond on the right. */}
      <Animated.View pointerEvents={stage >= 2 ? 'box-none' : 'none'} style={[styles.choices, { bottom: bottom + 28 }, choicesStyle]}>
        <View style={styles.choice}>
          <Button variant="quiet" block onPress={onRest}>
            {pondCopy.rest}
          </Button>
        </View>
        <View style={styles.choice}>
          <Button variant="primary" block onPress={onAnother}>
            {pondCopy.another}
          </Button>
        </View>
      </Animated.View>
    </View>
  )
}

export default PondScreen

const styles = StyleSheet.create({
  fill: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  label: {
    position: 'absolute',
    left: 24,
    right: 24,
    alignItems: 'center',
    gap: 8,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  kanji: {
    fontSize: 22,
    fontWeight: '500',
    letterSpacing: 2,
  },
  name: {
    fontSize: 16,
    fontWeight: '500',
  },
  seal: {
    width: 22,
    height: 22,
    borderRadius: 3,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
  sealText: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 16,
  },
  season: {
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  choices: {
    position: 'absolute',
    left: 24,
    right: 24,
    flexDirection: 'row',
    gap: 12,
  },
  choice: {
    flex: 1,
  },
  restNote: {
    position: 'absolute',
    left: 24,
    right: 24,
    alignItems: 'center',
  },
  restText: {
    fontSize: 13,
    fontWeight: '500',
  },
  tuneBtn: {
    position: 'absolute',
    right: 14,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tuningWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 250,
  },
})
