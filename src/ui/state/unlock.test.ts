import { beforeEach, describe, expect, it, vi } from 'vitest'

const fake = vi.hoisted(() => ({
  owned: true as boolean | null,
  buyResult: 'bought' as 'bought' | 'cancelled' | 'pending' | 'failed',
}))

vi.mock('@/platform', () => ({
  skipPaywall: false,
  store: {
    owned: async () => fake.owned,
    price: async () => '$9.99',
    buy: async () => fake.buyResult,
    restore: async () => fake.owned,
  },
}))

const { useUnlock } = await import('./unlock')

beforeEach(() => useUnlock.setState({ status: 'checking', unreachable: false, price: null }))

describe('the purchase', () => {
  it('opens Inverna when StoreKit says it is bought', async () => {
    fake.owned = true
    await useUnlock.getState().check()
    expect(useUnlock.getState().status).toBe('unlocked')
  })

  it('stays locked, with the price, when it is not', async () => {
    fake.owned = false
    await useUnlock.getState().check()
    expect(useUnlock.getState()).toMatchObject({ status: 'locked', price: '$9.99', unreachable: false })
  })

  it("stays locked when StoreKit can't be asked, and says so", async () => {
    fake.owned = null
    await useUnlock.getState().check()
    expect(useUnlock.getState()).toMatchObject({ status: 'locked', unreachable: true })
  })

  it('a cancelled or pending purchase leaves it locked', async () => {
    fake.owned = false
    await useUnlock.getState().check()
    fake.buyResult = 'cancelled'
    await useUnlock.getState().buy()
    fake.buyResult = 'pending'
    await useUnlock.getState().buy()
    expect(useUnlock.getState().status).toBe('locked')
  })

  // Nothing about the purchase is written to storage, so editing storage can't unlock it.
  it('keeps nothing on disk', () => {
    expect('persist' in useUnlock).toBe(false)
  })
})
