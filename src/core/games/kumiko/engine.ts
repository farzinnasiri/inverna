/**
 * Kumiko: deterministic state machine for Inverna's endless Japanese joinery weave.
 *
 * - Tap any open tile to rotate 90° clockwise.
 * - Aligning edges with a neighbor emits an `align` event (`place` cue + `settle` haptic).
 * - Closing any valid connected component lights the knot in antique brass (`clear` + `reward`).
 * - Closing a curated Japanese crest in its canonical geometry unlocks a discovery (`chime` + `complete`).
 * - Continuously senses tap pace, overshoot rate, and Inverna's night context to
 *   ease complexity and offer one quiet sleep-timer handoff when drowsy.
 *
 * Pure TypeScript: no React, no DOM, no Math.random, no wall clock.
 */
import { isArrayOf, isBoolean, isNullable, isNumber, isOneOf, isRecord, isString } from '../../decode'
import {
  activeMaskOf,
  generateNextBand,
  isRotatableTile,
  turnsToCanonical,
} from './generator'
import {
  createPacing,
  DEFAULT_NIGHT_CONTEXT,
  evaluatePacing,
  kumikoKinetics,
  recordKnotClosed,
  recordTap,
} from './pacing'
import {
  PORT_E,
  PORT_N,
  PORT_S,
  PORT_W,
  type KumikoBand,
  type KumikoEvent,
  type KumikoNightContext,
  type KumikoState,
  type KumikoTile,
} from './types'

export * from './types'
export { KUMIKO_COLS, activeMaskOf, isRotatableTile, rotateMaskCW, twinParityOf } from './generator'
export { DEFAULT_NIGHT_CONTEXT, contextSleepPrior, initialChallenge, kumikoKinetics } from './pacing'
export { VERIFIED_CRESTS, crestById } from './patterns'

const DIRS = [
  { bit: PORT_N, opp: PORT_S, dr: -1, dc: 0 },
  { bit: PORT_E, opp: PORT_W, dr: 0, dc: 1 },
  { bit: PORT_S, opp: PORT_N, dr: 1, dc: 0 },
  { bit: PORT_W, opp: PORT_E, dr: 0, dc: -1 },
] as const

/** Keep this many world rows generated ahead of the current scroll floor. */
const LOOKAHEAD_ROWS = 11
/** Keep solved rows below the scroll floor for warm history before trimming. */
const HISTORY_ROWS = 3

/** Count how many edges of `tile` currently align cleanly with adjacent tiles in `band`. */
export function countAlignedJoints(band: KumikoBand, tile: KumikoTile): number {
  const byPos = new Map(band.tiles.map((t) => [`${t.r},${t.c}`, t]))
  const mask = activeMaskOf(tile)
  let aligned = 0
  for (const d of DIRS) {
    if (!(mask & d.bit)) continue
    const nb = byPos.get(`${tile.r + d.dr},${tile.c + d.dc}`)
    if (!nb) continue
    if (activeMaskOf(nb) & d.opp) aligned++
  }
  return aligned
}

/**
 * True when a tile currently matches its canonical orientation in a crest
 * (for `twin` tiles, checks exact arc pairing parity; for `arc`/`miter`, checks active port mask).
 */
export function isCanonicalOrientation(tile: KumikoTile): boolean {
  if (tile.kind === 'twin') return (tile.turns & 1) === 0
  return activeMaskOf(tile) === tile.canonicalMask
}

function ensureBands(state: KumikoState, ctx: KumikoNightContext): KumikoState {
  let { bands, nextWorldRow, nextBandId, rngStep, bandsSinceCrest, recentCrests } = state
  const kinetics = kumikoKinetics(state.pacing, ctx.calm)
  let changed = false

  const nextBands = [...bands]
  while (nextWorldRow < state.targetScrollRow + LOOKAHEAD_ROWS) {
    const dealt = generateNextBand({
      seed: state.seed,
      rngStep,
      bandId: nextBandId,
      worldRowBase: nextWorldRow,
      challenge: state.pacing.challenge,
      allowCrests: kinetics.allowCrests,
      bandsSinceCrest,
      recentCrests,
      discoveredCrests: state.discoveredCrests,
    })
    nextBands.push(dealt.band)
    nextWorldRow += dealt.band.tall
    nextBandId += 1
    rngStep = dealt.rngStep
    bandsSinceCrest = dealt.bandsSinceCrest
    recentCrests = dealt.recentCrests
    changed = true
  }

  // Trim bands that have drifted far off the bottom of the screen.
  while (nextBands.length > 0 && nextBands[0]!.worldRowBase + nextBands[0]!.tall < state.scrollRow - HISTORY_ROWS) {
    nextBands.shift()
    changed = true
  }

  if (!changed) return state
  return {
    ...state,
    bands: nextBands,
    nextWorldRow,
    nextBandId,
    rngStep,
    bandsSinceCrest,
    recentCrests,
  }
}

export function createKumiko(opts: {
  seed: number
  calm?: number
  context?: Partial<KumikoNightContext>
  discoveredCrests?: readonly string[]
}): KumikoState {
  const ctx: KumikoNightContext = {
    ...DEFAULT_NIGHT_CONTEXT,
    ...opts.context,
    calm: opts.calm ?? opts.context?.calm ?? DEFAULT_NIGHT_CONTEXT.calm,
  }
  const initial: KumikoState = {
    version: 1,
    seed: opts.seed >>> 0,
    rngStep: 0,
    bands: [],
    nextWorldRow: 0,
    nextBandId: 1,
    targetScrollRow: -0.25,
    scrollRow: -0.25,
    knotsClosed: 0,
    latestKnotId: 0,
    discoveredCrests: opts.discoveredCrests ? [...opts.discoveredCrests] : [],
    recentCrests: [],
    bandsSinceCrest: 0,
    elapsedMs: 0,
    idleMs: 0,
    resting: false,
    pacing: createPacing(ctx),
    events: [],
  }
  return ensureBands(initial, ctx)
}

/**
 * Inspect a band after a tile rotation and close any connected component whose
 * ports are 100% matched. Returns updated band, events, and closure metrics.
 */
function resolveBandClosures(
  band: KumikoBand,
  latestKnotId: number,
  discoveredCrests: readonly string[],
): {
  band: KumikoBand
  newKnots: number
  latestKnotId: number
  discoveredCrests: string[]
  events: KumikoEvent[]
} {
  if (band.solved) {
    return { band, newKnots: 0, latestKnotId, discoveredCrests: [...discoveredCrests], events: [] }
  }

  const nextTiles = band.tiles.map((t) => ({ ...t }))
  const byPos = new Map(nextTiles.map((t) => [`${t.r},${t.c}`, t]))
  const visited = new Set<string>()
  const events: KumikoEvent[] = []
  let newKnots = 0
  let knotId = latestKnotId
  const nextDiscovered = [...discoveredCrests]

  for (const start of nextTiles) {
    const sk = `${start.r},${start.c}`
    if (visited.has(sk) || start.solved) continue

    const q = [start]
    const comp: KumikoTile[] = []
    let closed = true
    visited.add(sk)

    while (q.length > 0) {
      const cur = q.shift()!
      comp.push(cur)
      const mask = activeMaskOf(cur)
      for (const d of DIRS) {
        if (!(mask & d.bit)) continue
        const nb = byPos.get(`${cur.r + d.dr},${cur.c + d.dc}`)
        if (!nb) {
          closed = false
          continue
        }
        if (!(activeMaskOf(nb) & d.opp)) {
          closed = false
          continue
        }
        const nk = `${nb.r},${nb.c}`
        if (!visited.has(nk)) {
          visited.add(nk)
          q.push(nb)
        }
      }
    }

    if (closed && comp.length >= 4) {
      newKnots += 1
      knotId += 1
      let sumC = 0
      let sumRow = 0
      for (const t of comp) {
        t.solved = true
        t.knotId = knotId
        sumC += t.c + 0.5
        sumRow += t.worldRow
      }
      const cx = sumC / comp.length
      const cy = sumRow / comp.length
      events.push({ type: 'knot', knotId, cx, cy, tileCount: comp.length })
    }
  }

  const allSolved = nextTiles.every((t) => t.solved)
  let crestDiscovered = band.crestDiscovered

  if (allSolved && band.crestId && !crestDiscovered) {
    const canonical = nextTiles.every(isCanonicalOrientation)
    if (canonical) {
      crestDiscovered = true
      const firstTime = !nextDiscovered.includes(band.crestId)
      if (firstTime) nextDiscovered.push(band.crestId)
      for (const t of nextTiles) t.isCrest = true
      let sumC = 0
      let sumRow = 0
      for (const t of nextTiles) {
        sumC += t.c + 0.5
        sumRow += t.worldRow
      }
      // Replace the generic knot event with the canonical crest discovery event.
      const lastEvent = events[events.length - 1]
      if (lastEvent && lastEvent.type === 'knot') events.pop()
      events.push({
        type: 'crest',
        knotId,
        crestId: band.crestId,
        name: band.crestName ?? band.crestId,
        kanji: band.crestKanji ?? '',
        firstTime,
        cx: sumC / nextTiles.length,
        cy: sumRow / nextTiles.length,
      })
    }
  }

  return {
    band: { ...band, tiles: nextTiles, solved: allSolved, crestDiscovered },
    newKnots,
    latestKnotId: knotId,
    discoveredCrests: nextDiscovered,
    events,
  }
}

/** Advance targetScrollRow so the lowest unsolved band always rests in the thumb zone. */
function nextScrollTarget(bands: readonly KumikoBand[], currentTarget: number, fallbackRow: number): number {
  let lowestOpen = fallbackRow
  for (const b of bands) {
    if (!b.solved) {
      lowestOpen = b.worldRowBase
      break
    }
  }
  return Math.max(currentTarget, lowestOpen - 1.15)
}

/**
 * Tap a single tile to rotate it 90° clockwise.
 * Pure: returns a new state with queued feedback events.
 */
export function tapTile(
  state: KumikoState,
  bandId: number,
  r: number,
  c: number,
  ctx: KumikoNightContext = DEFAULT_NIGHT_CONTEXT,
): KumikoState {
  const bIdx = state.bands.findIndex((b) => b.id === bandId)
  if (bIdx < 0) return state
  const band = state.bands[bIdx]!
  if (band.solved) return state

  const tIdx = band.tiles.findIndex((t) => t.r === r && t.c === c)
  if (tIdx < 0) return state
  const tile = band.tiles[tIdx]!
  if (tile.solved || !isRotatableTile(tile)) return state

  const jointsBefore = countAlignedJoints(band, tile)
  const distBefore = turnsToCanonical(tile)

  const rotatedTile: KumikoTile = {
    ...tile,
    turns: (tile.turns + 1) % 4,
    targetDeg: tile.targetDeg + 90,
    taps: tile.taps + 1,
  }

  const rotatedBand: KumikoBand = {
    ...band,
    tiles: band.tiles.map((t, i) => (i === tIdx ? rotatedTile : t)),
  }

  const jointsAfter = countAlignedJoints(rotatedBand, rotatedTile)
  const distAfter = turnsToCanonical(rotatedTile)
  // Overshoot: rotated away from an existing match or tapped past optimal count.
  const overshoot =
    (distBefore === 0 && distAfter > 0) ||
    (jointsAfter < jointsBefore && rotatedTile.taps > 1) ||
    rotatedTile.taps >= 4

  let nextPacing = recordTap(state.pacing, state.elapsedMs, overshoot, ctx, state.knotsClosed)

  const resolved = resolveBandClosures(rotatedBand, state.latestKnotId, state.discoveredCrests)
  const nextBands = state.bands.map((b, i) => (i === bIdx ? resolved.band : b))
  const events: KumikoEvent[] = [...state.events]

  if (resolved.events.length > 0) {
    events.push(...resolved.events)
  } else if (jointsAfter > jointsBefore) {
    events.push({ type: 'align', bandId, r, c, joints: jointsAfter })
  } else {
    events.push({ type: 'turn', bandId, r, c })
  }

  const knotsClosed = state.knotsClosed + resolved.newKnots
  if (resolved.newKnots > 0) {
    const paced = recordKnotClosed(nextPacing, state.elapsedMs, ctx, knotsClosed)
    nextPacing = paced.pacing
    if (paced.shouldOfferHandoff) {
      events.push({ type: 'handoff' })
    }
  }

  const targetScrollRow = resolved.band.solved
    ? nextScrollTarget(nextBands, state.targetScrollRow, state.nextWorldRow)
    : state.targetScrollRow

  const nextState: KumikoState = {
    ...state,
    bands: nextBands,
    targetScrollRow,
    knotsClosed,
    latestKnotId: resolved.latestKnotId,
    discoveredCrests: resolved.discoveredCrests,
    idleMs: 0,
    resting: false,
    pacing: nextPacing,
    events,
  }

  return ensureBands(nextState, ctx)
}

/**
 * Step continuous scroll smoothing and high-calm idle handoff.
 * Pure: `dtMs` comes in from the screen's frame loop.
 */
export function tickKumiko(
  state: KumikoState,
  dtMs: number,
  ctx: KumikoNightContext = DEFAULT_NIGHT_CONTEXT,
): KumikoState {
  const dt = Math.min(100, Math.max(0, dtMs))
  if (dt <= 0) return state

  const kinetics = kumikoKinetics(state.pacing, ctx.calm)
  const dtSec = dt / 1000
  const scrollDiff = state.targetScrollRow - state.scrollRow
  const scrollRow =
    Math.abs(scrollDiff) < 0.002
      ? state.targetScrollRow
      : state.scrollRow + scrollDiff * Math.min(1, dtSec * kinetics.scrollRate)

  const elapsedMs = state.elapsedMs + dt
  const idleMs = state.resting ? state.idleMs : state.idleMs + dt

  let next: KumikoState = {
    ...state,
    scrollRow,
    elapsedMs,
    idleMs,
  }

  // When untouched for long enough late in the night, gently finish the nearest
  // open band on its own (mirroring Pond's `IDLE_HANDOFF_MS`) so the weave rests.
  if (!next.resting && next.idleMs >= kinetics.idleHandoffMs && (next.pacing.sleepySignal >= 0.55 || ctx.calm >= 0.65)) {
    const openIdx = next.bands.findIndex((b) => !b.solved)
    if (openIdx >= 0) {
      const openBand = next.bands[openIdx]!
      const settledTiles = openBand.tiles.map((t) => {
        if (t.solved) return t
        const delta = turnsToCanonical(t)
        return {
          ...t,
          turns: (t.turns + delta) % 4,
          targetDeg: t.targetDeg + delta * 90,
          solved: true,
          knotId: next.latestKnotId + 1,
        }
      })
      const settledBand: KumikoBand = { ...openBand, tiles: settledTiles, solved: true }
      const nextBands = next.bands.map((b, i) => (i === openIdx ? settledBand : b))
      next = ensureBands(
        {
          ...next,
          bands: nextBands,
          latestKnotId: next.latestKnotId + 1,
          targetScrollRow: nextScrollTarget(nextBands, next.targetScrollRow, next.nextWorldRow),
          idleMs: 0,
          events: [...next.events, { type: 'idleSettle', bandId: openBand.id }],
        },
        ctx,
      )
    }
  }

  return next
}

/** Apply the player's response to the quiet sleep-handoff strip. */
export function respondToHandoff(
  state: KumikoState,
  choice: 'rest' | 'slower',
  ctx: KumikoNightContext = DEFAULT_NIGHT_CONTEXT,
): KumikoState {
  if (choice === 'rest') {
    return {
      ...state,
      resting: true,
      pacing: { ...state.pacing, handoffOffered: true },
    }
  }
  const manualSlowOffset = Math.min(1, state.pacing.manualSlowOffset + 0.45)
  const pacing = evaluatePacing(
    { ...state.pacing, handoffOffered: true, manualSlowOffset },
    ctx,
    state.knotsClosed,
  )
  return {
    ...state,
    resting: false,
    pacing,
  }
}

/** Wake the weave gently if the player touches the screen while resting. */
export function wakeKumiko(state: KumikoState): KumikoState {
  if (!state.resting) return state
  return { ...state, resting: false, idleMs: 0 }
}

/** Drain queued events without mutating the previous snapshot. */
export function takeEvents(state: KumikoState): { state: KumikoState; events: KumikoEvent[] } {
  if (state.events.length === 0) return { state, events: [] }
  return { state: { ...state, events: [] }, events: state.events }
}

/** True when a visual animation (scroll glide) still needs frames. */
export function needsAnimation(state: KumikoState): boolean {
  return Math.abs(state.targetScrollRow - state.scrollRow) >= 0.002
}

/** Runtime save validator for `useGameSave('kumiko', ...)`. */
const isTileKind = isOneOf(['arc', 'miter', 'twin'] as const)
const isTone = isOneOf(['ochre', 'straw', 'sage', 'clay', 'rosewood', 'stone', 'bone'] as const)

const isKumikoTile = (v: unknown): v is KumikoTile =>
  isRecord(v) &&
  isNumber(v.r) &&
  isNumber(v.c) &&
  isNumber(v.worldRow) &&
  isTileKind(v.kind) &&
  isNumber(v.baseMask) &&
  isNumber(v.canonicalMask) &&
  (v.canonicalParity === 0 || v.canonicalParity === 1) &&
  isNumber(v.turns) &&
  isNumber(v.targetDeg) &&
  isBoolean(v.solved) &&
  isNumber(v.knotId) &&
  isBoolean(v.isCrest) &&
  isNumber(v.taps) &&
  isNumber(v.minTurnsToSolve)

const isKumikoBand = (v: unknown): v is KumikoBand =>
  isRecord(v) &&
  isNumber(v.id) &&
  isNumber(v.worldRowBase) &&
  isNumber(v.tall) &&
  isTone(v.tone) &&
  isArrayOf(isKumikoTile)(v.tiles) &&
  isBoolean(v.solved) &&
  isNullable(isString)(v.crestId) &&
  isNullable(isString)(v.crestName) &&
  isNullable(isString)(v.crestKanji) &&
  isBoolean(v.crestDiscovered)

const isTapSample = (v: unknown): v is { atMs: number; overshoot: boolean } =>
  isRecord(v) && isNumber(v.atMs) && isBoolean(v.overshoot)

const isPacingState = (v: unknown): v is KumikoState['pacing'] =>
  isRecord(v) &&
  isArrayOf(isTapSample)(v.taps) &&
  isArrayOf(isNumber)(v.knotGapsMs) &&
  isNullable(isNumber)(v.baselineTapMs) &&
  isNumber(v.lastTapMs) &&
  isNumber(v.lastKnotMs) &&
  isNumber(v.pace) &&
  isNumber(v.sleepySignal) &&
  isNumber(v.sleepyKnots) &&
  isNumber(v.challenge) &&
  isBoolean(v.handoffOffered) &&
  isNumber(v.manualSlowOffset)

export function isKumikoState(v: unknown): v is KumikoState {
  return (
    isRecord(v) &&
    v.version === 1 &&
    isNumber(v.seed) &&
    isNumber(v.rngStep) &&
    isArrayOf(isKumikoBand)(v.bands) &&
    v.bands.length > 0 &&
    isNumber(v.nextWorldRow) &&
    isNumber(v.nextBandId) &&
    isNumber(v.targetScrollRow) &&
    isNumber(v.scrollRow) &&
    isNumber(v.knotsClosed) &&
    isNumber(v.latestKnotId) &&
    isArrayOf(isString)(v.discoveredCrests) &&
    isArrayOf(isString)(v.recentCrests) &&
    isNumber(v.bandsSinceCrest) &&
    isNumber(v.elapsedMs) &&
    isNumber(v.idleMs) &&
    isBoolean(v.resting) &&
    isPacingState(v.pacing) &&
    Array.isArray(v.events)
  )
}
