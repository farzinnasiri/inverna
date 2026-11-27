import { beforeEach, describe, expect, it, vi } from 'vitest'

const fake = vi.hoisted(() => ({
  owned: true as boolean | null,
  buyResult: 'bought' as 'bought' | 'cancelled' | 'pending' | 'failed',
  familyShareable: true,
}))

vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }))
vi.mock('@/platform', () => ({
  skipPaywall: false,
  canPreviewFreeTier: false,
  store: {
    owned: async () => fake.owned,
    product: async () => ({ displayPrice: '$6.99', familyShareable: fake.familyShareable }),
    buy: async () => fake.buyResult,
    restore: async () => fake.owned,
    subscribe: () => () => {},
  },
}))

const { useUnlock, isAppUnlocked } = await import('./unlock')

beforeEach(() =>
  useUnlock.setState({
    status: 'checking',
    unreachable: false,
    price: null,
    familyShareable: false,
    devPreviewFree: false,
    busy: null,
  }),
)

describe('the purchase', () => {
  it('opens Full Unlock when StoreKit says it is bought', async () => {
    fake.owned = true
    await useUnlock.getState().check()
    expect(useUnlock.getState().status).toBe('unlocked')
    expect(isAppUnlocked()).toBe(true)
  })

  it('stays in free tier, with StoreKit price and Family Sharing flag, when not owned', async () => {
    fake.owned = false
    fake.familyShareable = true
    await useUnlock.getState().check()
    expect(useUnlock.getState()).toMatchObject({
      status: 'locked',
      price: '$6.99',
      familyShareable: true,
      unreachable: false,
    })
    expect(isAppUnlocked()).toBe(false)
  })

  it('re-locks when StoreKit reports a refund or Family Sharing revocation', async () => {
    fake.owned = true
    await useUnlock.getState().check()
    expect(isAppUnlocked()).toBe(true)

    fake.owned = false
    await useUnlock.getState().check()
    expect(useUnlock.getState().status).toBe('locked')
    expect(isAppUnlocked()).toBe(false)
  })

  it('keeps an already-unlocked buyer unlocked when StoreKit is transiently unreachable offline', async () => {
    fake.owned = true
    await useUnlock.getState().check()
    expect(isAppUnlocked()).toBe(true)

    fake.owned = null
    await useUnlock.getState().check()
    expect(useUnlock.getState().status).toBe('unlocked')
    expect(useUnlock.getState().unreachable).toBe(true)
  })

  it("stays in free tier when StoreKit can't be asked on cold launch, and notes it", async () => {
    fake.owned = null
    await useUnlock.getState().check()
    expect(useUnlock.getState()).toMatchObject({ status: 'locked', unreachable: true })
  })

  it('a cancelled or pending purchase leaves it in free tier', async () => {
    fake.owned = false
    await useUnlock.getState().check()
    fake.buyResult = 'cancelled'
    await useUnlock.getState().buy()
    fake.buyResult = 'pending'
    await useUnlock.getState().buy()
    expect(useUnlock.getState().status).toBe('locked')
  })

  it('ignores devPreviewFree in non-dev builds', async () => {
    fake.owned = true
    await useUnlock.getState().check()
    useUnlock.getState().setDevPreviewFree(true)
    expect(useUnlock.getState().devPreviewFree).toBe(false)
    expect(isAppUnlocked()).toBe(true)
  })

  // Nothing about the purchase is written to storage, so editing storage can't unlock it.
  it('keeps nothing on disk', () => {
    expect('persist' in useUnlock).toBe(false)
  })
})

it('discards an older owner snapshot after a later check confirms revocation', async () => {
  const { store } = await import('@/platform')
  let reply!: (owned: boolean) => void
  const delayed = vi.spyOn(store, 'owned').mockImplementationOnce(() => new Promise((resolve) => { reply = resolve }))
  try {
    const old = useUnlock.getState().check()
    fake.owned = false
    await useUnlock.getState().check()
    reply(true)
    await old
    expect(isAppUnlocked()).toBe(false)
  } finally {
    delayed.mockRestore()
  }
})
