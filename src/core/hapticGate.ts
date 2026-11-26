/**
 * Keeps haptics from piling up: a least gap between two of the same event, and
 * between any two (unless the new one weighs more, so a puzzle solved right
 * after the last move is still felt). A fast drag across a board or a wheel
 * would otherwise buzz continuously; a dropped tick is never missed, a buzzing
 * phone at night is.
 *
 * `minGapMs` lists the events from lightest to heaviest.
 * Pure: time comes in as an argument.
 */
export function createHapticGate<K extends string>(minGapMs: Record<K, number>, anyGapMs: number) {
  const weight = Object.fromEntries(Object.keys(minGapMs).map((k, i) => [k, i])) as Record<K, number>
  const lastAt: Partial<Record<K, number>> = {}
  let last: { kind: K; at: number } | null = null
  return function admit(kind: K, now: number): boolean {
    if (last && now - last.at < anyGapMs && weight[kind] <= weight[last.kind]) return false
    if (now - (lastAt[kind] ?? -Infinity) < minGapMs[kind]) return false
    lastAt[kind] = now
    last = { kind, at: now }
    return true
  }
}
