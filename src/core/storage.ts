/**
 * Key-value persistence contract.
 *
 * Synchronous on purpose: web uses localStorage, React Native will use
 * react-native-mmkv (also synchronous), so call sites never change.
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
