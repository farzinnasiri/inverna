import { create } from 'zustand'
import { canPreviewFreeTier, skipPaywall, store } from '@/platform'
import type { BuyResult } from '@/platform/store.types'
import { startEvent } from '@/ui/log'

export type UnlockStatus = 'checking' | 'locked' | 'unlocked'

interface UnlockState {
  /**
   * Whether Full Unlock is bought. Never persisted to Inverna storage: asked
   * of StoreKit at every launch and foreground resume, so editing local storage
   * can never unlock paid features.
   */
  status: UnlockStatus
  /** StoreKit couldn't be reached the last time it was asked. */
  unreachable: boolean
  /** True while fetching localized product metadata (price, Family Sharing) from StoreKit. */
  loadingProduct: boolean
  price: string | null
  /** Mirrors StoreKit's `Product.isFamilyShareable` so we only show the badge when Apple enables it. */
  familyShareable: boolean
  /** Dev / Web only: temporarily simulates the locked free tier so locks and paywall can be tested without paying. */
  devPreviewFree: boolean
  /** Guards against double-tapping Buy or Restore while a StoreKit sheet is in flight. */
  busy: 'buy' | 'restore' | null
  check: () => Promise<void>
  buy: () => Promise<BuyResult>
  restore: () => Promise<boolean | null>
  setDevPreviewFree: (preview: boolean) => void
}

function initialPreviewFree(): boolean {
  if (!canPreviewFreeTier || typeof window === 'undefined') return false
  try {
    return new URLSearchParams(window.location.search).get('free') === '1'
  } catch {
    return false
  }
}

// Only the latest ownership read may publish its snapshot. A completed purchase
// or restore also invalidates reads that started before it settled.
let ownershipRevision = 0

export const useUnlock = create<UnlockState>()((set, get) => ({
  status: skipPaywall ? 'unlocked' : 'checking',
  unreachable: false,
  loadingProduct: false,
  price: skipPaywall ? '$6.99' : null,
  familyShareable: false,
  devPreviewFree: initialPreviewFree(),
  busy: null,

  check: async () => {
    if (skipPaywall) return
    const revision = ++ownershipRevision
    const owned = await store.owned()
    if (revision !== ownershipRevision) return
    if (owned !== null) {
      set({ status: owned ? 'unlocked' : 'locked', unreachable: false })
    } else {
      set((s) => ({ status: s.status === 'unlocked' ? 'unlocked' : 'locked', unreachable: true }))
    }
    if (!owned && get().status === 'locked') {
      // Clear any stale storefront price while refreshing so we never display
      // an outdated currency or amount if the storefront changed or failed.
      set({ loadingProduct: true, price: null, familyShareable: false })
      const product = await store.product()
      if (revision === ownershipRevision) {
        set({
          loadingProduct: false,
          price: product?.displayPrice ?? null,
          familyShareable: product?.familyShareable ?? false,
          unreachable: owned === null || !product,
        })
      }
    } else {
      set({ loadingProduct: false })
    }
  },

  buy: async () => {
    if (get().busy) return 'cancelled'
    if (canPreviewFreeTier && get().devPreviewFree) {
      set({ devPreviewFree: false, status: 'unlocked', unreachable: false })
      return 'bought'
    }
    set({ busy: 'buy' })
    const ev = startEvent('purchase', { price: get().price })
    try {
      const res = await store.buy()
      ev.add({ result: res }).end(res === 'bought' ? 'ok' : res === 'cancelled' ? 'cancelled' : 'error')
      if (res === 'bought') {
        ownershipRevision++
        set({ status: 'unlocked', unreachable: false })
      }
      return res
    } finally {
      set({ busy: null })
    }
  },

  restore: async () => {
    if (get().busy) return null
    if (canPreviewFreeTier && get().devPreviewFree) {
      set({ devPreviewFree: false, status: 'unlocked', unreachable: false })
      return true
    }
    set({ busy: 'restore' })
    try {
      const owned = await store.restore()
      if (owned !== null) ownershipRevision++
      startEvent('restore', { owned }).end(owned === null ? 'error' : 'ok')
      if (owned === true) {
        set({ status: 'unlocked', unreachable: false })
      } else if (owned === false) {
        set({ status: 'locked', unreachable: false })
      } else {
        set((s) => ({ status: s.status === 'unlocked' ? 'unlocked' : 'locked', unreachable: true }))
      }
      return owned
    } finally {
      set({ busy: null })
    }
  },

  setDevPreviewFree: (preview) => {
    if (!canPreviewFreeTier) return
    set({ devPreviewFree: preview })
  },
}))

/** True when Full Unlock is active (always respects Dev/Web free-tier preview when enabled). */
export function isAppUnlocked(s: Pick<UnlockState, 'status' | 'devPreviewFree'> = useUnlock.getState()): boolean {
  if (canPreviewFreeTier && s.devPreviewFree) return false
  return s.status === 'unlocked'
}

export function useIsUnlocked(): boolean {
  return useUnlock(isAppUnlocked)
}
