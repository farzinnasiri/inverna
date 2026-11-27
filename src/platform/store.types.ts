export type BuyResult = 'bought' | 'cancelled' | 'pending' | 'failed'

/** The one-time purchase. `null` means StoreKit couldn't be asked. */
export interface Store {
  owned(): Promise<boolean | null>
  /** The localized price, as the App Store shows it ("$9.99"). */
  price(): Promise<string | null>
  buy(): Promise<BuyResult>
  restore(): Promise<boolean | null>
}
