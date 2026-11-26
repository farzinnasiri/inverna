/**
 * Inverna v3 — "Watchmaker Ink & Brass" design tokens.
 *
 * Pure TypeScript (no DOM imports) so React Native / Expo reuses this file
 * directly. Warmth is a token transform in OKLab, never an overlay:
 * black stays #000000 at every light setting.
 */

export const color = {
  bg: '#000000',
  surface1: '#0C0D10',
  surface2: '#14161A',
  surface3: '#1E2127',
  line: 'rgb(220 226 235 / 0.08)',
  lineStrong: 'rgb(220 226 235 / 0.15)',

  ink: '#E2E6EC',
  ink2: '#A8B0BC',
  ink3: '#808896',
  ink4: '#545B68',

  accent: '#C2A15F',
  accentInk: '#12100B',
  accentDim: '#7A673D',
  accentWash: 'rgb(194 161 95 / 0.14)',
} as const

/**
 * Seven architectural nocturnal tones — Watchmaker Ink & Brass.
 * Rich, crisp, zero concealer-beige / makeup blush, glare-capped for OLED.
 * Kept under the 7 stone keys so all engines & CSS stay compatible.
 */
export const pieces = {
  clay: '#446582',      // Deep Navy Slate
  ochre: '#BE9A56',     // Antique Brass
  straw: '#4E7C69',     // Pine Verdigris
  sage: '#9A4C53',      // Oxblood
  rosewood: '#67608C',  // Smoky Indigo
  stone: '#767E8A',     // Titanium Pewter
  bone: '#A6AEBA',      // Glare-capped Moon Silver
} as const

export type PieceStone = keyof typeof pieces

/** Maps logical game piece keys onto the 7 Watchmaker tones. */
export const legacyPieceMap = {
  ember: 'clay',
  saffron: 'ochre',
  honey: 'straw',
  moss: 'sage',
  clay: 'rosewood',
  rose: 'stone',
  sand: 'bone',
} as const satisfies Record<string, PieceStone>

/** Warm twins at warmth = 1 (noticeably warmer candlelight palette, zero blue glare). */
const warmInkTargets = {
  ink: '#E6CEA8',
  ink2: '#B09978',
  ink3: '#86745B',
  ink4: '#594D3D',
  accent: '#C99546',
  accentDim: '#805E2D',
} as const

const WARM_AMBER_TARGET = '#BA8D4B'

export const font = {
  ui: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Inter Variable', system-ui, sans-serif",
} as const

export const radius = { xs: 6, sm: 10, md: 14, lg: 20, xl: 28, pill: 999 } as const

export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48, 16: 64 } as const

/** Motion curves. Never ease-in on UI. */
export const ease = {
  out: 'cubic-bezier(0.23, 1, 0.32, 1)',
  inOut: 'cubic-bezier(0.77, 0, 0.175, 1)',
  drawer: 'cubic-bezier(0.32, 0.72, 0, 1)',
} as const

export const easeArray = {
  out: [0.23, 1, 0.32, 1] as [number, number, number, number],
  inOut: [0.77, 0, 0.175, 1] as [number, number, number, number],
  drawer: [0.32, 0.72, 0, 1] as [number, number, number, number],
}

export const duration = {
  press: 140,
  fast: 200,
  base: 260,
  sheet: 420,
  breath: 10000,
} as const

/* --- Pure-TS OKLab warmth interpolation --------------------------------- */

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

function linearToSrgb(c: number): number {
  const clamped = clamp01(c)
  return clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  ]
}

export function rgbToHex(r: number, g: number, b: number): string {
  const toByte = (v: number) =>
    Math.round(clamp01(v) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${toByte(r)}${toByte(g)}${toByte(b)}`.toUpperCase()
}

function rgbToOklab(r: number, g: number, b: number): [number, number, number] {
  const lr = srgbToLinear(r)
  const lg = srgbToLinear(g)
  const lb = srgbToLinear(b)

  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)

  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

function oklabToRgb(L: number, a: number, b: number): [number, number, number] {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b
  const s_ = L - 0.0894841775 * a - 1.291485548 * b

  const l = l_ * l_ * l_
  const m = m_ * m_ * m_
  const s = s_ * s_ * s_

  return [
    linearToSrgb(+4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ]
}

/** Perceptual OKLab lerp between two #RRGGBB colours. */
export function lerpHexOklab(fromHex: string, toHex: string, t: number, lightnessScale = 1): string {
  const u = clamp01(t)
  if (u <= 0 && lightnessScale === 1) return fromHex
  const [L1, a1, b1] = rgbToOklab(...hexToRgb(fromHex))
  const [L2, a2, b2] = rgbToOklab(...hexToRgb(toHex))
  const L = (L1 + (L2 - L1) * u) * lightnessScale
  const a = a1 + (a2 - a1) * u
  const b = b1 + (b2 - b1) * u
  return rgbToHex(...oklabToRgb(L, a, b))
}

export interface ResolvedTokens {
  warmth: number
  color: { -readonly [K in keyof typeof color]: string }
  pieces: { -readonly [K in keyof typeof pieces]: string }
}

/**
 * Pure colour resolution for a given warmth (0..1).
 * `bg` and `surface*` never change, so OLED black stays #000000.
 */
export function resolveTokens(warmth = 0): ResolvedTokens {
  const w = clamp01(warmth)
  const resolvedColor: { -readonly [K in keyof typeof color]: string } = {
    ...color,
    ink: lerpHexOklab(color.ink, warmInkTargets.ink, w),
    ink2: lerpHexOklab(color.ink2, warmInkTargets.ink2, w),
    ink3: lerpHexOklab(color.ink3, warmInkTargets.ink3, w),
    ink4: lerpHexOklab(color.ink4, warmInkTargets.ink4, w),
    accent: lerpHexOklab(color.accent, warmInkTargets.accent, w),
    accentDim: lerpHexOklab(color.accentDim, warmInkTargets.accentDim, w),
  }

  const resolvedPieces = {} as { -readonly [K in keyof typeof pieces]: string }
  const lScale = 1 - 0.1 * w
  for (const key of Object.keys(pieces) as PieceStone[]) {
    resolvedPieces[key] = lerpHexOklab(pieces[key], WARM_AMBER_TARGET, 0.22 * w, lScale)
  }

  return { warmth: w, color: resolvedColor, pieces: resolvedPieces }
}

/* --- Reactive token state (used by canvas renderers via useTokenColors) -- */

let currentResolved: ResolvedTokens = resolveTokens(0)
let lastStep = -1
const listeners = new Set<() => void>()

export function getResolvedTokens(): ResolvedTokens {
  return currentResolved
}

export function subscribeTokens(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function kebab(s: string) {
  return s.replace(/[A-Z0-9]/g, (m) => `-${m.toLowerCase()}`)
}

export function applyTokens(opts?: { warmth?: number; root?: HTMLElement; force?: boolean }): void {
  const w = clamp01(opts?.warmth ?? 0)
  const step = Math.round(w * 50)
  const force = opts?.force ?? lastStep === -1
  if (!force && step === lastStep) return
  lastStep = step

  const resolved = resolveTokens(step / 50)
  currentResolved = resolved

  if (typeof document !== 'undefined') {
    const root = opts?.root ?? document.documentElement
    const set = (k: string, v: string) => root.style.setProperty(k, v)
    for (const [k, v] of Object.entries(resolved.color)) set(`--c-${kebab(k)}`, v)
    for (const [k, v] of Object.entries(resolved.pieces)) set(`--p-${k}`, v)
    for (const [legacy, stone] of Object.entries(legacyPieceMap)) {
      if (!(legacy in resolved.pieces)) set(`--p-${legacy}`, resolved.pieces[stone])
    }
    set('--font-ui', font.ui)
    for (const [k, v] of Object.entries(radius)) set(`--r-${k}`, `${v}px`)
    for (const [k, v] of Object.entries(ease)) set(`--ease-${kebab(k)}`, v)
    for (const [k, v] of Object.entries(duration)) set(`--d-${k}`, `${v}ms`)
  }

  for (const fn of listeners) fn()
}
