import type { Store } from './store.types'

/** The web build is for looking at screens, not for sale: always unlocked. */
export function createStore(_productId: string): Store {
  return {
    owned: async () => true,
    price: async () => null,
    buy: async () => 'bought',
    restore: async () => true,
  }
}
