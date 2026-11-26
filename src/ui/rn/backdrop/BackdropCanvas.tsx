/**
 * The living layer of the backdrop: a low-resolution field shader plus a
 * full-resolution particle/structure picture, both driven by one simulation on
 * the UI thread.
 *
 * Cost control:
 * - The simulation and redraw step on the shared ambient clock (ambientClock.ts):
 *   30 fps while playing and 15 fps idle, never the display rate.
 * - The field shader renders at ~1 pixel per 1.5pt and is scaled up by the
 *   compositor; everything in it is soft, so the upscale is invisible.
 * - Particles are one drawAtlas call; paints and transforms are reused.
 * - The tabs share one backdrop drawn behind them (app/(tabs)/_layout.tsx).
 *   The simulation and sprite atlas are module-level too, so a remount (or the
 *   onboarding backdrop) picks up where the scene is. The clock runs only while
 *   its screen is focused (`active`). With Reduce Motion on, nothing animates:
 *   scenes switch instantly.
 *
 * Default export so the web build can lazy-load it after CanvasKit is ready.
 */
import { useEffect, useMemo } from 'react'
import { PixelRatio, StyleSheet, View, useWindowDimensions } from 'react-native'
import {
  AlphaType,
  BlendMode,
  Canvas,
  ColorType,
  Fill,
  FilterMode,
  MipmapMode,
  PaintStyle,
  Picture,
  Shader,
  Skia,
  StrokeCap,
  StrokeJoin,
  createPicture,
} from '@shopify/react-native-skia'
import { makeMutable, useAnimatedReaction, useDerivedValue, useSharedValue } from 'react-native-reanimated'
import { sceneIndex, type BackdropId } from '@/core/backdrop/scenes'
import { createSim, frontEdge, prewarm, simSnap, simStep, type MotifCue, type Sim, type SimEnv } from '@/core/backdrop/sim'
import { onMotifPhrase } from '@/platform/audio/motifEvents'
import { useAmbientTime } from '../ambientClock'
import { drawFrame, fieldUniforms, makeGfx, type Gfx, type GfxEnums } from './draw'
import { FIELD_SKSL } from './fieldShader'

export interface BackdropCanvasProps {
  backdrop: BackdropId
  /** Other scenes woven in for a hand-made mix: flat [scene index, weight] pairs (`resolveBlend`). */
  blend?: readonly number[]
  playing: boolean
  /** Breath swell rate from the descent arc. */
  breathHz: number
  /** 0..1 through the bedtime descent; motion slows as it deepens. */
  descent: number
  reduced: boolean
  /** False while this tab is hidden: the clock stops and nothing redraws. */
  active: boolean
}

const FRAME_PLAYING = 1 / 30
const FRAME_IDLE = 1 / 20
/** Seconds simulated before the very first frame; spawns are already spread out. */
const FIRST_PREWARM = 3
const FIELD_PT_PER_PX = 1.5

const fieldEffect = Skia.RuntimeEffect.Make(FIELD_SKSL)
if (!fieldEffect && __DEV__) console.warn('[backdrop] field shader failed to compile')

const ENUMS: GfxEnums = {
  plus: BlendMode.Plus,
  modulate: BlendMode.Modulate,
  linear: FilterMode.Linear,
  mipLinear: MipmapMode.Linear,
  stroke: PaintStyle.Stroke,
  fill: PaintStyle.Fill,
  roundCap: StrokeCap.Round,
  roundJoin: StrokeJoin.Round,
  rgba8888: ColorType.RGBA_8888,
  premul: AlphaType.Premul,
}

interface RenderState {
  sim: Sim
  gfx: Gfx | null
  acc: number
}

/** Shared by every BackdropCanvas instance (one per tab), so tab switches reuse it. */
const sharedState = makeMutable<RenderState | null>(null)
/** Latest classical motif phrase, published once for all instances. */
const sharedCue = makeMutable<MotifCue | null>(null)
let cueId = 0
let cueSubscribed = false
function subscribeMotifCues() {
  if (cueSubscribed) return
  cueSubscribed = true
  onMotifPhrase((phrase) => {
    cueId += 1
    sharedCue.set({ id: cueId, kind: phrase.style, notes: phrase.notes })
  })
}

export default function BackdropCanvas({ backdrop, blend, playing, breathHz, descent, reduced, active }: BackdropCanvasProps) {
  const { width: W, height: H } = useWindowDimensions()
  const scene = sceneIndex(backdrop)
  const seed = useMemo(() => Date.now() >>> 0, [])

  const target = useSharedValue(scene)
  const blendSV = useSharedValue<number[]>(blend ? [...blend] : [])
  const blendKey = blend ? blend.map((v) => v.toFixed(2)).join(',') : ''
  useEffect(() => {
    blendSV.set(blend ? [...blend] : [])
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on content, not identity
  }, [blendKey, blendSV])
  const dims = useSharedValue({ W, H })
  const reducedSV = useSharedValue(reduced)
  const env = useSharedValue<SimEnv>({ timeScale: 1, intensity: 1, breathHz })
  const frameInterval = useSharedValue(playing ? FRAME_PLAYING : FRAME_IDLE)
  const state = sharedState
  const cue = sharedCue
  const tick = useSharedValue(0)

  useEffect(() => {
    target.set(scene)
  }, [scene, target])
  useEffect(() => {
    dims.set({ W, H })
  }, [W, H, dims])
  useEffect(() => {
    reducedSV.set(reduced)
  }, [reduced, reducedSV])
  useEffect(() => {
    env.set({
      timeScale: (playing ? 1 : 0.6) * (1 - 0.35 * Math.min(1, Math.max(0, descent))),
      intensity: playing ? 1 : 0.72,
      breathHz,
    })
    frameInterval.set(playing ? FRAME_PLAYING : FRAME_IDLE)
  }, [playing, descent, breathHz, env, frameInterval])
  useEffect(subscribeMotifCues, [])

  const time = useAmbientTime(active)
  useAnimatedReaction(
    () => time.get(),
    (now, prev) => {
    'worklet'
    if (prev === null) return
    const d = dims.get()
    let rs = state.get()
    if (!rs || rs.sim.W !== d.W || rs.sim.H !== d.H) {
      const sim = createSim(d.W, d.H, target.get(), seed)
      prewarm(sim, FIRST_PREWARM)
      rs = { sim, gfx: rs?.gfx ?? null, acc: 0 }
      state.set(rs)
      tick.set(tick.get() + 1)
      return
    }
    const s = rs.sim
    if (reducedSV.get()) {
      if (target.get() !== s.sceneB) {
        simSnap(s, target.get())
        prewarm(s, 3)
        tick.set(tick.get() + 1)
      }
      return
    }
    rs.acc += Math.min(0.25, Math.max(0, now - prev))
    // 0.9: playing steps every clock tick (30 fps), idle every second one (15 fps).
    if (rs.acc < frameInterval.get() * 0.9) return
    const dt = Math.min(rs.acc, 0.1)
    rs.acc = 0
    simStep(s, dt, env.get(), target.get(), cue.get(), blendSV.get())
    tick.set(tick.get() + 1)
    },
  )

  useEffect(() => {
    // Coming back into view: draw the shared scene where it is now.
    if (active) tick.set(tick.get() + 1)
  }, [active, tick])

  const pictureBounds = useMemo(() => Skia.XYWHRect(0, 0, W, H), [W, H])
  const picture = useDerivedValue(() => {
    tick.get()
    const rs = state.get()
    return createPicture((canvas) => {
      if (!rs) return
      if (!rs.gfx) rs.gfx = makeGfx(Skia, ENUMS)
      if (rs.gfx) drawFrame(canvas, rs.sim, rs.gfx)
    }, pictureBounds)
  })

  // Field canvas: small, scaled up around its centre to cover the screen.
  const k = FIELD_PT_PER_PX * PixelRatio.get()
  const fw = Math.max(1, Math.round(W / k))
  const fh = Math.max(1, Math.round(H / k))
  const scaleX = W / fw
  const scaleY = H / fh
  const uniforms = useDerivedValue(() => {
    tick.get()
    const rs = state.get()
    if (!rs) return fieldUniforms(createSim(1, 1, target.get(), 1), fw, fh, 1e3)
    return fieldUniforms(rs.sim, fw, fh, frontEdge(rs.sim))
  })

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {fieldEffect && (
        // The transform lives on a wrapping View: Skia's web Canvas ignores transforms in its own style.
        <View
          style={{
            position: 'absolute',
            width: fw,
            height: fh,
            left: (W - fw) / 2,
            top: (H - fh) / 2,
            transform: [{ scaleX }, { scaleY }],
          }}
        >
          <Canvas style={{ width: fw, height: fh }}>
            <Fill>
              <Shader source={fieldEffect} uniforms={uniforms} />
            </Fill>
          </Canvas>
        </View>
      )}
      <Canvas style={StyleSheet.absoluteFill}>
        <Picture picture={picture} />
      </Canvas>
    </View>
  )
}
