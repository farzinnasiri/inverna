export type BuyResult = 'bought' | 'cancelled' | 'pending' | 'failed'

export interface StoreProduct {
  /** Localized price, as the App Store shows it (e.g. "$6.99"). */
  displayPrice: string
  /** True when Apple Family Sharing is enabled for this non-consumable in App Store Connect. */
  familyShareable: boolean
}

/** The one-time Full Unlock purchase. `null` means StoreKit couldn't be asked. */
export interface Store {
  owned(): Promise<boolean | null>
  product(): Promise<StoreProduct | null>
  buy(): Promise<BuyResult>
  restore(): Promise<boolean | null>
  /** Listen for out-of-band StoreKit transaction updates (Ask to Buy approvals, interrupted purchases). Return true once verified access is delivered. */
  subscribe(onChange: () => Promise<boolean>): () => void
}
