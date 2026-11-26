import { createJSONStorage } from 'zustand/middleware'
import { kv, NAMESPACE } from '@/core/storage'
import { bootPlatform } from '@/platform'

// The platform's key-value store must be in place before any store hydrates.
bootPlatform()

/** zustand persistence routed through the platform key-value store. */
export const kvStorage = createJSONStorage(() => ({
  getItem: (k: string) => kv().getItem(NAMESPACE + k),
  setItem: (k: string, v: string) => kv().setItem(NAMESPACE + k, v),
  removeItem: (k: string) => kv().removeItem(NAMESPACE + k),
}))
