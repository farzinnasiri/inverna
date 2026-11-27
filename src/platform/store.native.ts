import {
  ErrorCode,
  fetchProducts,
  finishTransaction,
  getAvailablePurchases,
  initConnection,
  isUserCancelledError,
  purchaseUpdatedListener,
  requestPurchase,
  restorePurchases,
  type Purchase,
} from 'expo-iap'
import type { BuyResult, Store, StoreProduct } from './store.types'

/**
 * The one-time Full Unlock purchase, through StoreKit 2 (expo-iap).
 * Ownership is always asked of StoreKit on the device, never read from
 * Inverna's own saved data, so editing storage can't unlock anything.
 * StoreKit keeps signed transactions on the phone, so a bought copy opens
 * offline too, and revocations (refunds / Family Sharing removal) are respected.
 */
const ANSWER_MS = 8000
function withinTime<T>(job: Promise<T>, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ANSWER_MS)
  })
  return Promise.race([job, timeout]).finally(() => clearTimeout(timer))
}

function isRevoked(p: Purchase): boolean {
  const ios = p as { revocationDateIOS?: number | null; revocationReasonIOS?: string | null }
  return ios.revocationDateIOS != null || ios.revocationReasonIOS != null
}

export function createStore(productId: string): Store {
  let connected: Promise<boolean> | null = null
  const connect = () => {
    connected ??= withinTime(initConnection(), false)
      .then((ok) => {
        if (!ok) connected = null
        return ok
      })
      .catch(() => {
        connected = null
        return false
      })
    return connected
  }

  const finishing = new Set<string>()
  const finished = new Set<string>()
  function finishOnce(purchase: Purchase) {
    const key = purchase.transactionId ?? purchase.id
    if (finishing.has(key) || finished.has(key)) return
    finishing.add(key)
    void finishTransaction({ purchase, isConsumable: false })
      .then(() => finished.add(key))
      .catch(() => {}) // Retry on redelivery.
      .finally(() => finishing.delete(key))
  }

  const owns = (list: readonly Purchase[]) =>
    list.some((p) => p.productId === productId && p.purchaseState === 'purchased' && !isRevoked(p))

  return {
    async owned() {
      if (!(await connect())) return null
      try {
        const list = await withinTime(getAvailablePurchases({ onlyIncludeActiveItemsIOS: true }), null)
        return list === null ? null : owns(list)
      } catch {
        return null
      }
    },

    async product(): Promise<StoreProduct | null> {
      if (!(await connect())) return null
      try {
        const products = await withinTime(fetchProducts({ skus: [productId], type: 'in-app' }), null)
        const item = products?.find((p) => p.id === productId)
        if (!item?.displayPrice) return null
        const ios = item as { isFamilyShareableIOS?: boolean }
        return {
          displayPrice: item.displayPrice,
          familyShareable: Boolean(ios.isFamilyShareableIOS),
        }
      } catch {
        return null
      }
    },

    async buy(): Promise<BuyResult> {
      if (!(await connect())) return 'failed'
      try {
        const result = await requestPurchase({ request: { apple: { sku: productId }, google: { skus: [productId] } }, type: 'in-app' })
        const list = (Array.isArray(result) ? result : result ? [result] : []) as Purchase[]
        const mine = list.find((p) => p.productId === productId)
        if (!mine) {
          // Some StoreKit flows settle via the entitlements stream even when requestPurchase returns empty.
          return (await this.owned()) === true ? 'bought' : 'failed'
        }
        if (mine.purchaseState === 'pending') return 'pending'
        if (mine.purchaseState !== 'purchased' || isRevoked(mine)) return 'failed'
        // The application-lifetime update listener owns transaction finishing.
        // Trust StoreKit's signed entitlements record over the raw purchase payload.
        return (await this.owned()) === true ? 'bought' : 'failed'
      } catch (e) {
        if (isUserCancelledError(e)) return 'cancelled'
        const code = e && typeof e === 'object' && 'code' in e ? e.code : null
        if (code === ErrorCode.DeferredPayment || code === ErrorCode.Pending) return 'pending'
        if (code === ErrorCode.AlreadyOwned && (await this.owned()) === true) return 'bought'
        return 'failed'
      }
    },

    async restore() {
      if (!(await connect())) return null
      try {
        await restorePurchases()
      } catch {
        return null
      }
      return this.owned()
    },

    subscribe(onChange) {
      let active = true
      const sub = purchaseUpdatedListener((purchase) => {
        if (!active || purchase.productId !== productId) return
        void onChange().then((delivered) => {
          if (active && delivered && purchase.purchaseState === 'purchased' && !isRevoked(purchase)) {
            finishOnce(purchase)
          }
        })
      }, { dedupeTransactionIOS: false })
      return () => {
        active = false
        sub.remove()
      }
    },
  }
}
