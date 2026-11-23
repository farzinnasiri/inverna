import type { KeyValueStore } from '@/core/storage'

/** localStorage adapter. Falls back to memory if storage is blocked. */
export function webStorage(): KeyValueStore {
  try {
    const ls = window.localStorage
    const probe = '__lull_probe__'
    ls.setItem(probe, '1')
    ls.removeItem(probe)
    return {
      getItem: (k) => ls.getItem(k),
      setItem: (k, v) => ls.setItem(k, v),
      removeItem: (k) => ls.removeItem(k),
      keys: () => Object.keys(ls),
    }
  } catch {
    const map = new Map<string, string>()
    return {
      getItem: (k) => map.get(k) ?? null,
      setItem: (k, v) => void map.set(k, v),
      removeItem: (k) => void map.delete(k),
      keys: () => [...map.keys()],
    }
  }
}
