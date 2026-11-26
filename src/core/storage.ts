/**
 * Key-value persistence contract.
 *
 * Synchronous on purpose: web uses localStorage and iOS uses expo-sqlite's
 * localStorage, so call sites never change.
 * Everything lives on-device. Clearing site data clears progress — by design.
 */
export interface KeyValueStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
  keys(): string[]
}

export const NAMESPACE = 'inverna:'

function memoryStore(): KeyValueStore {
  const map = new Map<string, string>()
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
    keys: () => [...map.keys()],
  }
}

let active: KeyValueStore = memoryStore()

/** Called once at boot by the platform layer. */
export function installKeyValueStore(store: KeyValueStore): void {
  active = store
}

export function kv(): KeyValueStore {
  return active
}

export function readJSON<T>(key: string, fallback: T): T {
  const raw = active.getItem(NAMESPACE + key)
  if (raw == null) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

/**
 * Read a saved value and keep it only if `isValid` accepts it. Anything
 * missing, unreadable or the wrong shape gives `fallback`, so a damaged save
 * can never break the screen that reads it.
 */
export function loadSaved<T>(key: string, fallback: T, isValid: (v: unknown) => v is T): T {
  const raw = active.getItem(NAMESPACE + key)
  if (raw == null) return fallback
  try {
    const value: unknown = JSON.parse(raw)
    return isValid(value) ? value : fallback
  } catch {
    return fallback
  }
}

export function writeJSON(key: string, value: unknown): void {
  try {
    active.setItem(NAMESPACE + key, JSON.stringify(value))
  } catch {
    // Quota or private mode: progress is best-effort, never fatal.
  }
}

export function removeKey(key: string): void {
  active.removeItem(NAMESPACE + key)
}

/** Wipes every Inverna key. Used by Settings → "Forget everything". */
export function clearAll(): void {
  for (const k of active.keys()) if (k.startsWith(NAMESPACE)) active.removeItem(k)
}
