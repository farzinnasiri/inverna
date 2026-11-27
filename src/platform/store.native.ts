import {
  fetchProducts,
  finishTransaction,
  getAvailablePurchases,
  initConnection,
  isUserCancelledError,
  requestPurchase,
  restorePurchases,
  type Purchase,
} from 'expo-iap'
import type { Store, BuyResult } from './store.types'

/**
 * The one purchase, through StoreKit 2 (expo-iap). Ownership is always asked
 * of StoreKit on the device, never read from Inverna's own saved data, so
 * editing storage can't unlock anything. StoreKit keeps signed transactions
 * on the phone, so a bought copy opens offline too.
 */
/** StoreKit normally answers at once; past this, treat it as unreachable rather than wait forever. */
const ANSWER_MS = 8000
function withinTime<T>(job: Promise<T>, fallback: T): Promise<T> {
  return Promise.race([job, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ANSWER_MS))])
}

export function createStore(productId: string): Store {
  let connected: Promise<boolean> | null = null
  const connect = () => {
    connected ??= initConnection().catch(() => {
      connected = null
      return false
    })
    return connected
  }

  const owns = (list: readonly Purchase[]) =>
    list.some((p) => p.productId === productId && p.purchaseState === 'purchased')

  return {
    async owned() {
      if (!(await withinTime(connect(), false))) return null
      try {
        const list = await withinTime(getAvailablePurchases({ onlyIncludeActiveItemsIOS: true }), null)
        return list === null ? null : owns(list)
      } catch {
        return null
      }
    },

    async price() {
      if (!(await connect())) return null
      try {
        const products = await fetchProducts({ skus: [productId], type: 'in-app' })
        const product = products?.find((p) => p.id === productId)
        return product?.displayPrice ?? null
      } catch {
        return null
      }
    },

    async buy(): Promise<BuyResult> {
      if (!(await connect())) return 'failed'
      try {
        const result = await requestPurchase({ request: { apple: { sku: productId } }, type: 'in-app' })
        const list = (Array.isArray(result) ? result : result ? [result] : []) as Purchase[]
        const mine = list.find((p) => p.productId === productId)
        if (!mine) return 'failed'
        if (mine.purchaseState === 'pending') return 'pending'
        await finishTransaction({ purchase: mine, isConsumable: false }).catch(() => {})
        // Trust StoreKit's own record over the purchase result.
        return (await this.owned()) ? 'bought' : 'failed'
      } catch (e) {
        return isUserCancelledError(e) ? 'cancelled' : 'failed'
      }
    },

    async restore() {
      if (!(await connect())) return null
      try {
        await restorePurchases()
      } catch {
        /* still read what StoreKit has */
      }
      return this.owned()
    },
  }
}
