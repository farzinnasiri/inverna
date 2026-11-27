import { create } from 'zustand'
import { skipPaywall, store } from '@/platform'
import type { BuyResult } from '@/platform/store.types'
import { startEvent } from '@/ui/log'

export type UnlockStatus = 'checking' | 'locked' | 'unlocked'

interface UnlockState {
  /**
   * Whether Inverna is bought. Never saved: it's asked of StoreKit at every
   * launch, so it can't be set by editing what the app stores.
   */
  status: UnlockStatus
  /** StoreKit couldn't be reached the last time it was asked. */
  unreachable: boolean
  price: string | null
  check: () => Promise<void>
  buy: () => Promise<BuyResult>
  restore: () => Promise<boolean | null>
}

export const useUnlock = create<UnlockState>()((set, get) => ({
  status: skipPaywall ? 'unlocked' : 'checking',
  unreachable: false,
  price: null,

  check: async () => {
    if (skipPaywall) return
    const owned = await store.owned()
    set({ status: owned ? 'unlocked' : 'locked', unreachable: owned === null })
    if (!owned && get().price === null) {
      const price = await store.price()
      if (price) set({ price })
    }
  },

  buy: async () => {
    const ev = startEvent('purchase', { price: get().price })
    const res = await store.buy()
    ev.add({ result: res }).end(res === 'bought' ? 'ok' : res === 'cancelled' ? 'cancelled' : 'error')
    if (res === 'bought') set({ status: 'unlocked', unreachable: false })
    return res
  },

  restore: async () => {
    const owned = await store.restore()
    startEvent('restore', { owned }).end(owned === null ? 'error' : 'ok')
    if (owned) set({ status: 'unlocked', unreachable: false })
    else set({ unreachable: owned === null })
    return owned
  },
}))
