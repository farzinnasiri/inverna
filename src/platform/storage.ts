import type { KeyValueStore } from '@/core/storage'

/**
 * Universal synchronous localStorage adapter.
 * On web: browser window.localStorage.
 * On iOS/Android: installed synchronously by `expo-sqlite/localStorage/install`
 * at the top of app/_layout.tsx (exact Al Dente pattern).
 */
export function deviceStorage(): KeyValueStore {
  try {
    const ls = globalThis.localStorage
    if (ls) {
      const probe = '__inverna_probe__'
      ls.setItem(probe, '1')
      ls.removeItem(probe)
      return {
        getItem: (k) => ls.getItem(k),
        setItem: (k, v) => ls.setItem(k, v),
        removeItem: (k) => ls.removeItem(k),
        keys: () => {
          const out: string[] = []
          for (let i = 0; i < ls.length; i++) {
            const k = ls.key(i)
            if (k !== null) out.push(k)
          }
          return out
        },
      }
    }
  } catch {
    /* fallback below */
  }
  const map = new Map<string, string>()
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
    keys: () => [...map.keys()],
  }
}
