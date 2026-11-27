/**
 * The breath, from the Play page to the scene behind it and back to the page.
 *
 * The page (IslandBreath) writes where the breath gathers and how full it is,
 * and bumps `outId` when it's let out; the backdrop reads this each step and
 * hands it to the simulation (breatheIn / breatheOut in src/core/backdrop/sim.ts).
 * Shared values, so the pull drives it from the UI thread without React.
 *
 * While a breath is under way the backdrop steps at the display's rate (up to
 * 60 fps) instead of the ambient clock's 30, so the wave crosses the screen
 * smoothly; `breathFrames` says when.
 *
 * `breathWave` is the same wave for things on the page: tiles lift as it
 * passes them (`useWaveLift`), with the sim's own front and fade.
 */
import { useCallback } from 'react'
import type { LayoutChangeEvent } from 'react-native'
import { makeMutable, useAnimatedStyle, useSharedValue } from 'react-native-reanimated'
import { WAVE_WIDTH, waveFade, waveFront } from '@/core/backdrop/sim'

export interface BreathSignal {
  /** Where it gathers, in window points: just under the island. */
  x: number
  y: number
  /** How full the in-breath is, 0..1. */
  charge: number
  /** Bumped once per out-breath. */
  outId: number
  /** The out-breath's strength, 0..1: a full held breath is 1. */
  strength: number
}

export const breathSignal = makeMutable<BreathSignal>({ x: 0, y: 0, charge: 0, outId: 0, strength: 0 })

/** True from the first pull until the wave has crossed the screen. */
export const breathFrames = makeMutable(false)

/** The wave for the page: where it left from, how strong, how far it goes, the screen's width. */
export const breathWave = makeMutable({ strength: 0, x: 0, y: 0, reach: 1, width: 400 })
/** 0..1 through the wave's crossing on the page; -1 when there's none. */
export const breathWaveU = makeMutable(-1)

/** 0..1: how much the wave lifts a point on the page right now. */
export function waveLiftAt(px: number, py: number): number {
  'worklet'
  const u = breathWaveU.get()
  if (u < 0 || u >= 1 || px < 0) return 0
  const w = breathWave.get()
  const dx = px - w.x
  const dy = py - w.y
  // A little wider than the light, so things rise into it and settle after.
  const k = (Math.sqrt(dx * dx + dy * dy) - w.reach * waveFront(u)) / (w.width * WAVE_WIDTH * 1.4)
  return w.strength * waveFade(u) * Math.exp(-k * k)
}

/**
 * Lifts a view as the wave passes: a few points up and a touch larger, then
 * back. `baseX`/`baseY`: where the view's parent sits on the page (window
 * points), since its layout is relative to that parent.
 */
export function useWaveLift(baseX: number, baseY: number, amount = 1) {
  const cx = useSharedValue(-1)
  const cy = useSharedValue(-1)
  const onLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const l = e.nativeEvent.layout
      cx.set(baseX + l.x + l.width / 2)
      cy.set(baseY + l.y + l.height / 2)
    },
    [baseX, baseY, cx, cy],
  )
  const style = useAnimatedStyle(() => {
    const b = waveLiftAt(cx.get(), cy.get()) * amount
    return { transform: [{ translateY: -7 * b }, { scale: 1 + 0.04 * b }] }
  })
  return { onLayout, style }
}
