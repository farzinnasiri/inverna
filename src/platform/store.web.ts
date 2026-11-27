import type { Store } from './store.types'

/** The web build is for preview and testing, not for sale: unlocked by default, with a preview price for free-tier testing. */
export function createStore(_productId: string): Store {
  return {
    owned: async () => true,
    product: async () => ({ displayPrice: '$6.99', familyShareable: false }),
    buy: async () => 'bought',
    restore: async () => true,
    subscribe: () => () => {},
  }
}
