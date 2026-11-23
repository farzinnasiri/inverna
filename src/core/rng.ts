/**
 * Small seeded RNG (mulberry32). Engines take an `Rng` instead of calling
 * Math.random so games are deterministic, testable, and serialisable:
 * persist `rng.state()` and resume with `createRng(savedState)`.
 */
export interface Rng {
  /** Float in [0, 1). */
  next(): number
  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number
  pick<T>(items: readonly T[]): T
  shuffle<T>(items: readonly T[]): T[]
  /** Current internal state; feed back into createRng to resume. */
  state(): number
}

export function createRng(seed: number = Date.now() >>> 0): Rng {
  let s = seed >>> 0
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1))
  return {
    next,
    int,
    pick: (items) => items[Math.floor(next() * items.length)]!,
    shuffle: (items) => {
      const a = items.slice()
      for (let i = a.length - 1; i > 0; i--) {
        const j = int(0, i)
        ;[a[i], a[j]] = [a[j]!, a[i]!]
      }
      return a
    },
    state: () => s,
  }
}
