/**
 * Every pond hides a picture. Each one is a constellation of lotus buds in a
 * box 1 wide and up to 1.05 tall (y down), drawn as 2–5 strokes. A stroke's
 * buds are one family: loop them all and the stroke draws itself between
 * them, in order. When every stroke is drawn, the picture is revealed.
 *
 * Hand-authored Japanese night motifs. Buds within a picture stay at least
 * MIN_SPACING apart so a lasso can fit between them (tested).
 */
export interface PictureFamily {
  /** Bud positions in stroke order. */
  points: readonly (readonly [number, number])[]
  /** The stroke closes back on itself (a ring, a box, a wing). */
  closed?: boolean
}

export interface Picture {
  id: string
  name: string
  kanji: string
  families: readonly PictureFamily[]
}

export const PICTURE_BOX_HEIGHT = 1.05
export const MIN_SPACING = 0.09

type P = [number, number]

function line(x0: number, y0: number, x1: number, y1: number, n: number): P[] {
  return Array.from({ length: n }, (_, i) => [x0 + ((x1 - x0) * i) / (n - 1), y0 + ((y1 - y0) * i) / (n - 1)] as P)
}

/** Points on an arc; angles in degrees, 0 = right, 90 = down. */
function arc(cx: number, cy: number, r: number, a0: number, a1: number, n: number, ry = r): P[] {
  return Array.from({ length: n }, (_, i) => {
    const a = ((a0 + ((a1 - a0) * i) / (n - 1)) * Math.PI) / 180
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * ry] as P
  })
}

function spiral(cx: number, cy: number, r0: number, shrink: number, a0: number, step: number, n: number): P[] {
  return Array.from({ length: n }, (_, i) => {
    const a = ((a0 + step * i) * Math.PI) / 180
    const r = r0 - shrink * i
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r] as P
  })
}

export const PICTURES: readonly Picture[] = [
  {
    id: 'crescent',
    name: 'Crescent moon',
    kanji: '三日月',
    families: [
      { points: arc(0.55, 0.55, 0.45, 60, 175, 4) },
      { points: arc(0.55, 0.55, 0.45, 205, 300, 3) },
      { points: arc(0.72, 0.55, 0.33, 95, 265, 5) },
    ],
  },
  {
    id: 'fuji',
    name: 'Mount Fuji',
    kanji: '富士',
    families: [
      { points: line(0.04, 1.0, 0.38, 0.3, 4) },
      { points: line(0.62, 0.3, 0.96, 1.0, 4) },
      { points: [[0.4, 0.47], [0.5, 0.38], [0.6, 0.47]] },
    ],
  },
  {
    id: 'wave',
    name: 'Wave',
    kanji: '波',
    families: [
      { points: spiral(0.55, 0.52, 0.34, 0.035, 180, 45, 6) },
      { points: line(0.05, 0.97, 0.95, 0.97, 5) },
      { points: [[0.08, 0.36], [0.1, 0.22], [0.2, 0.13]] },
    ],
  },
  {
    id: 'crane',
    name: 'Crane',
    kanji: '鶴',
    families: [
      { points: [[0.04, 0.26], [0.16, 0.36], [0.29, 0.44], [0.41, 0.52]] },
      { points: [[0.96, 0.26], [0.84, 0.36], [0.71, 0.44], [0.59, 0.52]] },
      { points: [[0.5, 0.45], [0.5, 0.33], [0.53, 0.21], [0.61, 0.13]] },
      { points: [[0.5, 0.65], [0.47, 0.8], [0.44, 0.95]] },
    ],
  },
  {
    id: 'hare',
    name: 'Moon hare',
    kanji: '月の兎',
    families: [
      { points: arc(0.5, 0.62, 0.46, 190, 254, 3) },
      { points: arc(0.5, 0.62, 0.46, 286, 350, 3) },
      { points: [[0.39, 0.29], [0.43, 0.41], [0.54, 0.41], [0.57, 0.29]] },
      { points: [[0.4, 0.53], [0.33, 0.66], [0.42, 0.8], [0.58, 0.8], [0.65, 0.66]] },
      { points: line(0.15, 0.97, 0.85, 0.97, 4) },
    ],
  },
  {
    id: 'maple',
    name: 'Maple leaf',
    kanji: '紅葉',
    families: [
      { points: [[0.37, 0.36], [0.5, 0.07], [0.63, 0.36]] },
      { points: [[0.12, 0.3], [0.31, 0.5], [0.2, 0.72]] },
      { points: [[0.88, 0.3], [0.69, 0.5], [0.8, 0.72]] },
      { points: [[0.5, 0.56], [0.5, 0.75], [0.5, 0.94]] },
    ],
  },
  {
    id: 'fan',
    name: 'Folding fan',
    kanji: '扇',
    families: [
      { points: arc(0.5, 0.92, 0.55, 208, 257.6, 3) },
      { points: arc(0.5, 0.92, 0.55, 282.4, 332, 3) },
      { points: arc(0.5, 0.92, 0.32, 230, 310, 3) },
      { points: [[0.42, 0.82], [0.5, 0.97], [0.58, 0.82]] },
    ],
  },
  {
    id: 'koi',
    name: 'Koi',
    kanji: '鯉',
    families: [
      { points: arc(0.55, 0.6, 0.34, 150, 330, 6) },
      { points: [[0.12, 0.87], [0.25, 0.95], [0.36, 0.88]] },
      { points: [[0.95, 0.35], [0.77, 0.57], [0.62, 0.5]] },
    ],
  },
  {
    id: 'pine',
    name: 'Pine',
    kanji: '松',
    families: [
      { points: [[0.52, 0.99], [0.46, 0.82], [0.5, 0.66], [0.44, 0.5]] },
      { points: [[0.19, 0.31], [0.34, 0.2], [0.52, 0.16], [0.69, 0.22], [0.81, 0.34]] },
      { points: [[0.6, 0.56], [0.75, 0.5], [0.89, 0.57]] },
    ],
  },
  {
    id: 'bell',
    name: 'Temple bell',
    kanji: '梵鐘',
    families: [
      { points: [[0.43, 0.07], [0.57, 0.07]] },
      { points: [[0.36, 0.2], [0.31, 0.42], [0.26, 0.64], [0.2, 0.84]] },
      { points: [[0.64, 0.2], [0.69, 0.42], [0.74, 0.64], [0.8, 0.84]] },
      { points: [[0.33, 0.96], [0.5, 0.99], [0.67, 0.96]] },
    ],
  },
  {
    id: 'lantern',
    name: 'Stone lantern',
    kanji: '灯籠',
    families: [
      { points: [[0.13, 0.36], [0.31, 0.23], [0.5, 0.15], [0.69, 0.23], [0.87, 0.36]] },
      { points: [[0.36, 0.49], [0.64, 0.49], [0.64, 0.66], [0.36, 0.66]], closed: true },
      { points: [[0.3, 0.98], [0.5, 0.82], [0.7, 0.98]] },
    ],
  },
  {
    id: 'torii',
    name: 'Torii gate',
    kanji: '鳥居',
    families: [
      { points: [[0.03, 0.2], [0.27, 0.14], [0.5, 0.12], [0.73, 0.14], [0.97, 0.2]] },
      { points: line(0.14, 0.36, 0.86, 0.36, 4) },
      { points: line(0.28, 0.52, 0.3, 0.96, 3) },
      { points: line(0.72, 0.52, 0.7, 0.96, 3) },
    ],
  },
  {
    id: 'bamboo',
    name: 'Bamboo',
    kanji: '竹',
    families: [
      { points: line(0.5, 0.99, 0.5, 0.15, 5) },
      { points: [[0.37, 0.52], [0.23, 0.44], [0.09, 0.38]] },
      { points: [[0.63, 0.32], [0.77, 0.25], [0.91, 0.2]] },
    ],
  },
  {
    id: 'plum',
    name: 'Plum blossom',
    kanji: '梅',
    families: [
      { points: arc(0.5, 0.55, 0.3, -90, 225, 8), closed: true },
      { points: [[0.5, 0.47], [0.43, 0.6], [0.57, 0.6]], closed: true },
    ],
  },
  {
    id: 'boat',
    name: 'Little boat',
    kanji: '舟',
    families: [
      { points: arc(0.5, 0.55, 0.45, 20, 160, 5) },
      { points: line(0.5, 0.76, 0.5, 0.13, 4) },
      { points: [[0.61, 0.2], [0.78, 0.38], [0.62, 0.58]], closed: true },
    ],
  },
  {
    id: 'cloud',
    name: 'Cloud',
    kanji: '雲',
    families: [{ points: spiral(0.42, 0.45, 0.36, 0.04, -90, 58, 7) }, { points: [[0.62, 0.74], [0.79, 0.81], [0.96, 0.86]] }],
  },
  {
    id: 'lotus',
    name: 'Lotus',
    kanji: '蓮',
    families: [
      { points: [[0.42, 0.42], [0.5, 0.12], [0.58, 0.42]] },
      { points: [[0.08, 0.32], [0.2, 0.52], [0.36, 0.6]] },
      { points: [[0.92, 0.32], [0.8, 0.52], [0.64, 0.6]] },
      { points: line(0.5, 0.73, 0.5, 1.0, 3) },
    ],
  },
  {
    id: 'dragonfly',
    name: 'Dragonfly',
    kanji: '蜻蛉',
    families: [
      { points: line(0.5, 0.12, 0.5, 1.0, 6) },
      { points: [[0.36, 0.26], [0.12, 0.18], [0.1, 0.38], [0.34, 0.42]], closed: true },
      { points: [[0.64, 0.26], [0.88, 0.18], [0.9, 0.38], [0.66, 0.42]], closed: true },
    ],
  },
]

export function pictureById(id: string): Picture | undefined {
  return PICTURES.find((p) => p.id === id)
}

/** Later in the night, pictures with fewer strokes. */
export function maxFamiliesForCalm(calm: number): number {
  return calm < 0.34 ? 5 : calm < 0.67 ? 4 : 3
}

/**
 * Tonight's picture: one with few enough strokes for the hour, not among
 * the last few seen. `pick` is a 0..1 random number.
 */
export function choosePicture(pick: number, calm: number, recent: readonly string[] = []): Picture {
  const max = maxFamiliesForCalm(calm)
  const fitting = PICTURES.filter((p) => p.families.length <= max)
  const fresh = fitting.filter((p) => !recent.includes(p.id))
  const pool = fresh.length ? fresh : fitting
  return pool[Math.min(pool.length - 1, Math.floor(Math.max(0, pick) * pool.length))]!
}

/** Names for generated patterns: night things that come in loose groups. */
const PATTERN_NAMES: readonly (readonly [string, string])[] = [
  ['Fireflies', '蛍'],
  ['Stream', '流れ'],
  ['Night wind', '夜風'],
  ['Rain', '雨'],
  ['Stars', '星'],
  ['Mist', '霧'],
  ['Pebbles', '石'],
  ['Willow', '柳'],
  ['Reeds', '葦'],
  ['Ripples', '波紋'],
]

const near = (a: P, b: P) => Math.hypot(a[0] - b[0], a[1] - b[1]) < MIN_SPACING * 1.15

/**
 * A new pattern for Endless: 3–4 families, each a gentle line, arc or small
 * cluster, placed so they lie close to (and curl around) each other. That
 * closeness is the puzzle: a loop has to thread between families. Buds keep
 * MIN_SPACING apart and stay in the box. `rand` gives 0..1 numbers.
 */
export function generatePicture(rand: () => number, seed: number): Picture {
  const count = rand() < 0.5 ? 3 : 4
  const families: PictureFamily[] = []
  const all: P[] = []
  const inBox = (p: P) => p[0] >= 0.05 && p[0] <= 0.95 && p[1] >= 0.05 && p[1] <= PICTURE_BOX_HEIGHT - 0.05
  let guard = 0
  while (families.length < count && guard++ < 400) {
    // Each new family starts near the ones already placed, so they interleave.
    const anchor: P = all.length ? all[Math.floor(rand() * all.length)]! : [0.5, 0.52]
    const cx = anchor[0] + (rand() - 0.5) * 0.5
    const cy = anchor[1] + (rand() - 0.5) * 0.5
    const kind = rand()
    let pts: P[]
    if (kind < 0.4) {
      const a = rand() * Math.PI
      const len = 0.28 + rand() * 0.22
      const n = 3 + Math.floor(rand() * 3)
      pts = line(cx - (Math.cos(a) * len) / 2, cy - (Math.sin(a) * len) / 2, cx + (Math.cos(a) * len) / 2, cy + (Math.sin(a) * len) / 2, n)
    } else if (kind < 0.8) {
      const r = 0.16 + rand() * 0.12
      const a0 = rand() * 360
      const span = 110 + rand() * 120
      pts = arc(cx, cy, r, a0, a0 + span, 4 + Math.floor(rand() * 2))
    } else {
      const a = rand() * Math.PI * 2
      const d = 0.11 + rand() * 0.03
      pts = [0, 1, 2].map((k) => [cx + Math.cos(a + (k * Math.PI * 2) / 3) * d, cy + Math.sin(a + (k * Math.PI * 2) / 3) * d] as P)
    }
    if (!pts.every(inBox)) continue
    if (pts.some((p) => all.some((q) => near(p, q)))) continue
    families.push({ points: pts })
    all.push(...pts)
  }
  const [name, kanji] = PATTERN_NAMES[Math.floor(rand() * PATTERN_NAMES.length)]!
  return { id: `gen-${seed >>> 0}`, name, kanji, families }
}
