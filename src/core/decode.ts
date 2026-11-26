/**
 * Small checks for data read back from storage. Saved data is `unknown` until
 * one of these says what it is.
 */

export const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

export const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

export const isString = (v: unknown): v is string => typeof v === 'string'

export const isBoolean = (v: unknown): v is boolean => typeof v === 'boolean'

export const isNullable =
  <T>(check: (v: unknown) => v is T) =>
  (v: unknown): v is T | null =>
    v === null || check(v)

export const isArrayOf =
  <T>(check: (v: unknown) => v is T) =>
  (v: unknown): v is T[] =>
    Array.isArray(v) && v.every(check)

export const isOneOf =
  <const T extends readonly unknown[]>(values: T) =>
  (v: unknown): v is T[number] =>
    values.includes(v)

/** A record whose values all pass `check` (keys unchecked). */
export const isRecordOf =
  <T>(check: (v: unknown) => v is T) =>
  (v: unknown): v is Record<string, T> =>
    isRecord(v) && Object.values(v).every(check)

/**
 * Keep each field of `saved` that its check accepts; anything else keeps the
 * value in `current`. Fields without a check are dropped.
 */
export function pickValid<T extends object>(
  saved: unknown,
  current: T,
  checks: { [K in keyof T]?: (v: unknown) => boolean },
): T {
  if (!isRecord(saved)) return current
  const out = { ...current }
  for (const key of Object.keys(checks) as (keyof T)[]) {
    if (!(key in saved)) continue
    const value = saved[key as string]
    if (checks[key]!(value)) out[key] = value as T[keyof T]
  }
  return out
}
