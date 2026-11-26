import { describe, expect, it } from 'vitest'
import {
  beginStroke,
  closedBuds,
  createPond,
  DEFAULT_TUNING,
  endStroke,
  extendStroke,
  IDLE_HANDOFF_MS,
  END_SETTLE_MS,
  isPondState,
  loopAround,
  pathLength,
  pondParams,
  pondPhase,
  REST_AFTER_MS,
  restPond,
  depthIn,
  SLEEPER_SLACK,
  CULPRIT_MS,
  sleeperCount,
  nextLevel,
  pondPicture,
  pointInPolygon,
  wakePond,
  SPINE_POINTS,
  SPINE_SPACING,
  takeEvents,
  tapPond,
  tickPond,
  touchPond,
  type Bud,
  type PondEvent,
  type PondState,
  type Vec2,
} from './engine'
import { microseasonFor, MICROSEASONS } from './microseasons'
import { PICTURES } from './pictures'

const ASPECT = 844 / 390
const TOP = 110 / 390
const BOTTOM = 60 / 390

/** A pond with no sleepers unless asked (`level`), so mechanics tests see only the picture. */
function fresh(opts: { seed?: number; calm?: number; teach?: number; picture?: string; level?: number; mode?: 'pictures' | 'endless' } = {}): PondState {
  return createPond({
    seed: opts.seed ?? 7,
    calm: opts.calm ?? 0,
    aspect: ASPECT,
    top: TOP,
    bottom: BOTTOM,
    teach: opts.teach ?? 1,
    picture: opts.picture,
    level: opts.level ?? 0,
    mode: opts.mode,
  })
}

function run(state: PondState, ms: number, calm = 0): { s: PondState; events: PondEvent[] } {
  let s = state
  const events: PondEvent[] = []
  for (let t = 0; t < ms; t += 16) {
    const [ev, next] = takeEvents(tickPond(s, 16, calm))
    events.push(...ev)
    s = next
  }
  return { s, events }
}

const loops = (events: PondEvent[]) => events.filter((e): e is Extract<PondEvent, { type: 'loop' }> => e.type === 'loop')

/** Draw a lasso the way a finger would: around some buds, a little wobbly, overshooting the start. */
function drawLasso(state: PondState, around: readonly Vec2[], calm = 0, pad = 0.06): PondState {
  const loop = loopAround(around, pad)
  const pts = [...loop, ...loop.slice(0, 6)]
  let s = beginStroke(state, pts[0]!.x, pts[0]!.y)
  pts.forEach((p, i) => {
    s = extendStroke(s, p.x + Math.sin(i * 1.7) * 0.004, p.y + Math.cos(i * 1.3) * 0.004, calm)
  })
  return endStroke(s)
}

const familyBuds = (s: PondState, f: number): Bud[] => s.buds.filter((b) => b.family === f)
const isOpen = (s: PondState, id: number) => s.buds.find((b) => b.id === id)!.openAt !== null

describe('pond: a picture of lotus buds', () => {
  it('is deterministic for a seed and serialisable', () => {
    const a = fresh({ seed: 42 })
    expect(fresh({ seed: 42 })).toEqual(a)
    expect(JSON.parse(JSON.stringify(a))).toEqual(a)
    expect(isPondState(JSON.parse(JSON.stringify(a)))).toBe(true)
    expect(isPondState({ version: 2, koi: { spine: [] } })).toBe(false)
  })

  it('lays out every picture inside the water, families matching its strokes', () => {
    for (const pic of PICTURES) {
      const s = fresh({ picture: pic.id })
      expect(s.picture).toBe(pic.id)
      expect(s.families).toHaveLength(pic.families.length)
      expect(s.buds).toHaveLength(pic.families.reduce((n, f) => n + f.points.length, 0))
      for (const b of s.buds) {
        expect(b.x).toBeGreaterThan(0.04)
        expect(b.x).toBeLessThan(0.96)
        expect(b.y).toBeGreaterThan(TOP)
        expect(b.y).toBeLessThan(ASPECT - BOTTOM)
      }
      pic.families.forEach((f, i) => expect(s.families[i]!.buds).toHaveLength(f.points.length))
    }
  })

  it('builds the koi spine evenly, below the picture', () => {
    const s = fresh()
    expect(s.koi.spine).toHaveLength(SPINE_POINTS)
    for (let i = 1; i < SPINE_POINTS; i++) expect(Math.hypot(s.koi.spine[i]!.x - s.koi.spine[i - 1]!.x, s.koi.spine[i]!.y - s.koi.spine[i - 1]!.y)).toBeCloseTo(SPINE_SPACING, 6)
    expect(s.koi.y).toBeGreaterThan(Math.max(...s.buds.map((b) => b.y)))
  })

  it('chooses fewer strokes later in the night', () => {
    for (let seed = 1; seed <= 40; seed++) expect(fresh({ seed, calm: 1 }).families.length).toBeLessThanOrEqual(3)
  })
})

describe('pond: calm tuning', () => {
  it('gives a longer breath and a gentler koi as calm rises', () => {
    const lo = pondParams(0)
    const hi = pondParams(1)
    expect(hi.breath).toBeGreaterThan(lo.breath)
    expect(hi.speed).toBeLessThan(lo.speed)
    expect(pondParams(0, { ...DEFAULT_TUNING, breath: 2 }).breath).toBeCloseTo(lo.breath * 2, 6)
  })
})

describe('pond: the breath limit', () => {
  it('stops the lasso when the breath runs out, and says so once', () => {
    let s = beginStroke(fresh(), 0.1, 0.6)
    const breath = pondParams(0).breath
    let spent = 0
    for (let i = 0; i < 400; i++) {
      s = extendStroke(s, 0.1 + 0.8 * Math.abs(Math.sin(i * 0.05)), 0.6 + i * 0.002, 0)
      const [ev, next] = takeEvents(s)
      spent += ev.filter((e) => e.type === 'spent').length
      s = next
    }
    expect(s.stroke!.spent).toBe(true)
    expect(pathLength(s.stroke!.points)).toBeLessThanOrEqual(breath + 1e-6)
    expect(pathLength(s.stroke!.points)).toBeGreaterThan(breath - 0.01)
    expect(spent).toBe(1)
  })

  it('makes a confident loop round any single stroke easy: hugging it fits in one breath', () => {
    for (const pic of PICTURES) {
      const s = fresh({ picture: pic.id })
      for (const f of s.families) {
        const pts = f.buds.map((id) => s.buds.find((b) => b.id === id)!)
        // A lasso that hugs the stroke: there and back along it, round each end.
        const hug = 2 * pathLength(pts, f.closed) + 2 * Math.PI * 0.06
        const hull = pathLength(loopAround(pts), true)
        expect(Math.min(hug, hull), `${pic.id} stroke ${f.id}`).toBeLessThan(pondParams(0).breath * 0.92)
      }
    }
  })

  it('means one giant loop cannot take a picture of three or more strokes', () => {
    for (const pic of PICTURES.filter((p) => p.families.length >= 3)) {
      const s = fresh({ picture: pic.id })
      expect(pathLength(loopAround(s.buds), true), pic.id).toBeGreaterThan(pondParams(0).breath)
    }
  })
})

describe('pond: strokes and families', () => {
  it('blooms a whole family together and draws its stroke', () => {
    let s = fresh({ picture: 'fuji' })
    const fam = familyBuds(s, 2)
    s = drawLasso(s, fam)
    const { s: after, events } = run(s, 6000)
    const l = loops(events).filter((e) => e.k > 0)
    expect(l[0]?.k).toBe(fam.length)
    expect(l[0]?.strokes).toBe(1)
    expect(fam.every((b) => isOpen(after, b.id))).toBe(true)
    expect(after.families[2]!.doneAt).not.toBeNull()
    expect(after.families[0]!.doneAt).toBeNull()
  })

  it('opens part of a family without drawing its stroke: a stroke takes the whole family in one loop', () => {
    let s = fresh({ picture: 'fuji' })
    const fam = familyBuds(s, 0)
    s = drawLasso(s, fam.slice(0, 2), 0, 0.045)
    let r = run(s, 6000)
    expect(fam.slice(0, 2).every((b) => isOpen(r.s, b.id))).toBe(true)
    expect(fam.slice(2).some((b) => isOpen(r.s, b.id))).toBe(false)
    expect(r.s.families[0]!.doneAt).toBeNull()

    // The rest on its own opens them, but still no stroke: it wasn't one breath.
    s = drawLasso(r.s, fam.slice(2), 0, 0.045)
    r = run(s, 6000)
    expect(fam.every((b) => isOpen(r.s, b.id))).toBe(true)
    expect(r.s.families[0]!.doneAt).toBeNull()

    // One loop round the whole family, open buds and all: the stroke draws.
    s = drawLasso(r.s, fam, 0, 0.05)
    r = run(s, 6000)
    expect(r.s.families[0]!.doneAt).not.toBeNull()
    expect(loops(r.events).find((e) => !e.muddy)?.strokes).toBe(1)
  })

  it('muddies a loop that holds two unfinished families: nothing opens', () => {
    let s = fresh({ picture: 'fuji' })
    const both = [...familyBuds(s, 0), ...familyBuds(s, 2)]
    s = drawLasso(s, both, 0, 0.05)
    const r = run(s, 6000)
    const l = loops(r.events)
    expect(l[0]?.muddy).toBe(true)
    expect(l[0]?.k).toBe(0)
    expect(both.some((b) => isOpen(r.s, b.id))).toBe(false)
    expect(r.s.muddy).toBe(1)
  })

  it('muddies a loop that holds a sleeper, even round a single family', () => {
    for (let seed = 1; seed < 60; seed++) {
      const s0 = fresh({ picture: 'maple', seed, level: 0.9 })
      for (const f of s0.families) {
        const pts = familyBuds(s0, f.id)
        const hull = loopAround(pts, 0.05)
        if (!s0.sleepers.some((sl) => pointInPolygon(sl, hull))) continue
        if (s0.families.some((g) => g.id !== f.id && familyBuds(s0, g.id).some((b) => pointInPolygon(b, hull)))) continue
        const r = run(drawLasso(s0, pts, 0, 0.05), 6000)
        expect(loops(r.events)[0]?.muddy).toBe(true)
        expect(pts.some((b) => isOpen(r.s, b.id))).toBe(false)
        return
      }
    }
    throw new Error('no pond had a sleeper inside a lone family\'s loop')
  })

  it('forgives a sleeper that is only just inside the line, and shows what spoiled a loop', () => {
    const s0 = fresh({ picture: 'fuji' })
    const fam = familyBuds(s0, 2)
    const hull = loopAround(fam, 0.06)
    // A sleeper sitting just inside the hull's edge, and one deep inside the family.
    const edge = hull[Math.floor(hull.length / 4)]!
    const cx = fam.reduce((a, b) => a + b.x, 0) / fam.length
    const cy = fam.reduce((a, b) => a + b.y, 0) / fam.length
    const shallow = { id: 900, phase: 0, x: edge.x + (cx - edge.x) * 0.06, y: edge.y + (cy - edge.y) * 0.06 }
    expect(depthIn(shallow, hull)).toBeLessThan(SLEEPER_SLACK)
    let r = run(drawLasso({ ...s0, sleepers: [shallow] }, fam, 0, 0.06), 6000)
    expect(loops(r.events)[0]?.muddy).toBe(false)
    expect(r.s.families[2]!.doneAt).not.toBeNull()

    // The deep one spoils the loop, and is shown as the culprit right away...
    const deep = { id: 901, phase: 0, x: cx, y: cy + 0.03 }
    let st = drawLasso({ ...s0, sleepers: [deep] }, fam, 0, 0.06)
    const seen: PondEvent[] = []
    for (let t = 0; t < 3000 && loops(seen).length === 0; t += 16) {
      const [ev, next] = takeEvents(tickPond(st, 16, 0))
      seen.push(...ev)
      st = next
    }
    expect(loops(seen)[0]?.muddy).toBe(true)
    expect(st.culprits).toEqual([expect.objectContaining({ x: deep.x, y: deep.y })])
    // ...and stops being shown once CULPRIT_MS has passed.
    st = run(st, CULPRIT_MS + 200).s
    expect(st.culprits).toEqual([])
  })

  it('cannot be finished by one giant loop round the whole picture', () => {
    for (const pic of PICTURES.filter((p) => p.families.length >= 2)) {
      let s = fresh({ picture: pic.id })
      const all = s.buds
      let st = beginStroke(s, all[0]!.x, all[0]!.y)
      for (const p of loopAround(all, 0.06)) st = extendStroke(st, p.x, p.y, 0, { ...DEFAULT_TUNING, breath: 10 })
      s = endStroke(st)
      const r = run(s, 8000)
      expect(r.s.completedAt, pic.id).toBeNull()
      expect(r.s.families.some((f) => f.doneAt !== null), pic.id).toBe(false)
    }
  })

  it('opens a bud you tap on (the koi circles it), at any level; tapping alone never finishes a picture', () => {
    for (const pic of PICTURES) {
      let s = fresh({ picture: pic.id, level: 0.9, seed: 3 })
      while (closedBuds(s).length) {
        const target = closedBuds(s).reduce((a, b) => (Math.hypot(a.x - s.koi.x, a.y - s.koi.y) < Math.hypot(b.x - s.koi.x, b.y - s.koi.y) ? a : b))
        s = tapPond(s, target.x, target.y)
        let t = 0
        for (; t < 8000 && !isOpen(s, target.id); t += 32) s = takeEvents(tickPond(s, 32, 0))[1]
        expect(isOpen(s, target.id), `${pic.id} bud ${target.id}`).toBe(true)
      }
      expect(s.completedAt).toBeNull()
    }
  })

  it('glides to a tap on open water without opening anything', () => {
    let s = fresh({ picture: 'bamboo' })
    s = tapPond(s, 0.9, s.koi.y - 0.05)
    const { s: after, events } = run(s, 3000)
    expect(Math.hypot(after.koi.x - 0.9, after.koi.y - (s.koi.y - 0.05))).toBeLessThan(0.12)
    expect(loops(events)).toHaveLength(0)
    expect(closedBuds(after)).toHaveLength(s.buds.length)
  })

  it('swims an open stroke without catching anything', () => {
    let s = beginStroke(fresh({ picture: 'bamboo' }), 0.1, 1.5)
    for (let i = 1; i <= 30; i++) s = extendStroke(s, 0.1 + i * 0.025, 1.5 - i * 0.004, 0)
    s = endStroke(s)
    expect(s.plans[0]?.kind).toBe('path')
    const { events } = run(s, 4000)
    expect(loops(events)).toHaveLength(0)
  })

  it('is responsive: the koi crosses half the pond in about a second', () => {
    let s = fresh()
    s = tapPond(s, 0.5, s.koi.y - 0.5)
    const { s: after } = run(s, 1200)
    expect(Math.abs(after.koi.y - (s.koi.y - 0.5))).toBeLessThan(0.08)
  })
})

describe('pond: sleepers, Endless and the level', () => {
  it('deals more sleepers at higher levels, none on first play, never too close to a bud', () => {
    expect(sleeperCount(0)).toBe(0)
    expect(sleeperCount(0.5)).toBeGreaterThan(sleeperCount(0.2))
    expect(fresh({ level: 0.9, teach: 0 }).sleepers).toHaveLength(0)
    for (const pic of PICTURES) {
      const s = fresh({ picture: pic.id, level: 0.9, seed: 11 })
      expect(s.sleepers.length, pic.id).toBeGreaterThan(0)
      for (const sl of s.sleepers) for (const b of s.buds) expect(Math.hypot(sl.x - b.x, sl.y - b.y)).toBeGreaterThanOrEqual(0.07)
    }
  })

  it('Endless deals new patterns and mirrored pictures, deterministically, all playable', () => {
    let custom = 0
    for (let seed = 1; seed <= 60; seed++) {
      const a = fresh({ seed, mode: 'endless', level: 0.4 })
      expect(fresh({ seed, mode: 'endless', level: 0.4 })).toEqual(a)
      expect(isPondState(JSON.parse(JSON.stringify(a)))).toBe(true)
      if (a.custom) {
        custom++
        expect(a.families.length).toBeGreaterThanOrEqual(3)
        for (let i = 0; i < a.buds.length; i++)
          for (let j = i + 1; j < a.buds.length; j++) expect(Math.hypot(a.buds[i]!.x - a.buds[j]!.x, a.buds[i]!.y - a.buds[j]!.y)).toBeGreaterThan(0.06)
        expect(pondPicture(a).name.length).toBeGreaterThan(0)
      }
    }
    expect(custom).toBeGreaterThan(8)
    expect(custom).toBeLessThan(40)
  })

  it('raises the Endless level after a clean pond and lowers it after a muddled one', () => {
    expect(nextLevel(0.4, { loopsMade: 4, muddy: 0, families: 4, auto: false })).toBeGreaterThan(0.4)
    expect(nextLevel(0.4, { loopsMade: 12, muddy: 5, families: 4, auto: false })).toBeLessThan(0.4)
    expect(nextLevel(0.4, { loopsMade: 1, muddy: 0, families: 4, auto: true })).toBe(0.4)
    expect(nextLevel(0.95, { loopsMade: 3, muddy: 0, families: 3, auto: false })).toBeLessThanOrEqual(0.95)
  })
})

describe('pond: the end', () => {
  it('the koi finishes every picture by itself, at any calm, if left alone', () => {
    for (const pic of PICTURES) {
      for (const [calm, level] of [[0, 0], [1, 0], [0, 0.9]] as const) {
        const s0 = fresh({ picture: pic.id, calm, level })
        const early = run(s0, IDLE_HANDOFF_MS - 500, calm)
        expect(early.s.settling).toBe(false)
        let s = early.s
        const events: PondEvent[] = []
        for (let t = 0; t < 5 * 60_000 && s.completedAt === null; t += 32) {
          const [ev, n] = takeEvents(tickPond(s, 32, calm))
          events.push(...ev)
          s = n
        }
        expect(s.completedAt, `${pic.id} at calm ${calm}`).not.toBeNull()
        expect(s.families.every((f) => f.doneAt !== null)).toBe(true)
        expect(loops(events).filter((e) => e.k > 0).every((e) => e.auto)).toBe(true)
        expect(loops(events).filter((e) => e.k > 0).at(-1)!.last).toBe(true)
      }
    }
  })

  it('hands control back on any touch', () => {
    let s = run(fresh(), IDLE_HANDOFF_MS + 1500).s
    expect(s.settling).toBe(true)
    s = touchPond(s)
    expect(s.settling).toBe(false)
    expect(s.route).toBeNull()
    s = run(s, 10_000).s
    expect(s.settling).toBe(false)
  })

  it('ignores stray taps and lassos once done, and rests by itself or on Rest', () => {
    const base = fresh()
    const done: PondState = { ...base, buds: base.buds.map((b) => ({ ...b, openAt: 0 })), families: base.families.map((f) => ({ ...f, doneAt: 0 })), completedAt: 0 }
    expect(tapPond(done, 0.5, 0.8).plans).toHaveLength(0)
    expect(beginStroke(done, 0.5, 0.8).stroke).toBeNull()
    const soon = run(done, END_SETTLE_MS + REST_AFTER_MS - 500)
    expect(soon.s.restedAt).toBeNull()
    expect(pondPhase(soon.s)).toBe('painting')
    const later = run(soon.s, 1500)
    expect(later.events).toContainEqual({ type: 'rest', auto: true })
    const rested = restPond(done)
    expect(pondPhase(rested)).toBe('resting')
    expect(takeEvents(rested)[0]).toContainEqual({ type: 'rest', auto: false })
    expect(restPond(base)).toBe(base)
  })

  it('wakes from rest on a touch: the painting comes back, then rests again after a quiet while', () => {
    const base = fresh()
    const done: PondState = { ...base, buds: base.buds.map((b) => ({ ...b, openAt: 0 })), families: base.families.map((f) => ({ ...f, doneAt: 0 })), completedAt: 0 }
    const rested = run(restPond(done), END_SETTLE_MS + 1000).s
    const woken = wakePond(rested)
    expect(pondPhase(woken)).toBe('painting')
    expect(wakePond(woken)).toBe(woken)
    expect(pondPhase(run(woken, REST_AFTER_MS - 1000).s)).toBe('painting')
    expect(pondPhase(run(woken, REST_AFTER_MS + 1000).s)).toBe('resting')
  })
})

describe('pond: first play', () => {
  it('shows a ghost lasso round one glowing family, and clears it once you draw a stroke', () => {
    let s = fresh({ teach: 0, picture: 'maple' })
    expect(s.ghost).not.toBeNull()
    const fam = familyBuds(s, s.ghost!.family)
    for (const b of fam) expect(s.ghost!.points.length > 0 && b.openAt === null).toBe(true)
    s = drawLasso(s, fam)
    const { s: after, events } = run(s, 6000)
    expect(after.ghost).toBeNull()
    expect(after.teach).toBe(1)
    expect(events).toContainEqual({ type: 'taught', teach: 1 })
    expect(fresh({ teach: 1 }).ghost).toBeNull()
  })
})

describe('microseasons', () => {
  it('has all 72 and finds the season for a date, across the new year', () => {
    expect(MICROSEASONS).toHaveLength(72)
    expect(microseasonFor(11, 26).english).toBe('Rainbows hide')
    expect(microseasonFor(11, 27).kanji).toBe('朔風払葉')
    expect(microseasonFor(1, 1).english).toBe('Wheat sprouts under snow')
    expect(microseasonFor(2, 4).english).toBe('East wind melts the ice')
    expect(microseasonFor(2, 3).english).toBe('Hens start laying eggs')
  })
})
