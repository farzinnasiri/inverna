/**
 * Lull design tokens — single source of truth.
 *
 * Plain TS so React Native can import the same object (StyleSheet / Reanimated).
 * On web, `applyTokens()` writes them to :root as CSS custom properties.
 *
 * The palette rule: almost no blue. Every colour is drawn from embers, tea,
 * clay and candle-light so the screen works like a night-light, not a lamp.
 */

export const color = {
  // Grounds — warm near-black, never neutral grey
  night0: '#0A0605',
  night1: '#120A07',
  night2: '#1B110C',
  night3: '#261811',
  line: '#3A261C',
  lineSoft: '#2A1B14',

  // Ink — parchment, not white
  ink: '#F1DCC4',
  ink2: '#BC9B81',
  ink3: '#8A6E5B',

  // Light sources
  ember: '#FF7A33',
  glow: '#FFB45E',
  candle: '#FFD9A0',
  coal: '#5C2A16',
} as const

/** Seven warm game hues — distinct by value and hue, all low-blue. */
export const pieces = {
  ember: '#E85A36',
  saffron: '#F0973A',
  honey: '#E9C46A',
  moss: '#A2A55A',
  clay: '#B5694A',
  rose: '#D97A6C',
  sand: '#E9D3AE',
} as const

export type PieceColor = keyof typeof pieces

export const font = {
  display: "'Fraunces Variable', 'Iowan Old Style', Georgia, serif",
  ui: "'Figtree Variable', ui-sans-serif, system-ui, sans-serif",
} as const

export const radius = { xs: 6, sm: 10, md: 14, lg: 22, xl: 30, pill: 999 } as const

export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48, 16: 64 } as const

/** Motion: curves from the house animation rules. Never ease-in on UI. */
export const ease = {
  out: 'cubic-bezier(0.23, 1, 0.32, 1)',
  inOut: 'cubic-bezier(0.77, 0, 0.175, 1)',
  drawer: 'cubic-bezier(0.32, 0.72, 0, 1)',
} as const

/** Same curves as arrays, for Motion / Reanimated. */
export const easeArray = {
  out: [0.23, 1, 0.32, 1] as [number, number, number, number],
  inOut: [0.77, 0, 0.175, 1] as [number, number, number, number],
  drawer: [0.32, 0.72, 0, 1] as [number, number, number, number],
}

export const duration = {
  press: 140,
  fast: 200,
  base: 260,
  sheet: 440,
  /** One full breath at 6 breaths/min — the app's ambient pulse. */
  breath: 10000,
} as const

/** Write every token to :root as a CSS variable. Web only. */
export function applyTokens(root: HTMLElement = document.documentElement): void {
  const set = (k: string, v: string) => root.style.setProperty(k, v)
  for (const [k, v] of Object.entries(color)) set(`--c-${kebab(k)}`, v)
  for (const [k, v] of Object.entries(pieces)) set(`--p-${k}`, v)
  set('--font-display', font.display)
  set('--font-ui', font.ui)
  for (const [k, v] of Object.entries(radius)) set(`--r-${k}`, `${v}px`)
  for (const [k, v] of Object.entries(ease)) set(`--ease-${kebab(k)}`, v)
  for (const [k, v] of Object.entries(duration)) set(`--d-${k}`, `${v}ms`)
}

function kebab(s: string) {
  return s.replace(/[A-Z0-9]/g, (m) => `-${m.toLowerCase()}`)
}
