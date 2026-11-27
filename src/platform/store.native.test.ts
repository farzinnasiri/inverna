import { beforeEach, expect, it, vi } from 'vitest'
import { createStore } from './store.native'

const sdk = vi.hoisted(() => ({
  ErrorCode: { DeferredPayment: 'deferred-payment', Pending: 'pending', AlreadyOwned: 'already-owned' },
  initConnection: vi.fn(),
  requestPurchase: vi.fn(),
  getAvailablePurchases: vi.fn(),
  restorePurchases: vi.fn(),
  finishTransaction: vi.fn(),
  purchaseUpdatedListener: vi.fn(),
  isUserCancelledError: (e: { code: string }) => e.code === 'user-cancelled',
}))
vi.mock('expo-iap', () => sdk)

const sku = 'com.oooflabs.inverna.unlock'
const purchase = { productId: sku, purchaseState: 'purchased', transactionId: '123' }

beforeEach(() => {
  vi.resetAllMocks()
  sdk.initConnection.mockResolvedValue(true)
  sdk.getAvailablePurchases.mockResolvedValue([])
  sdk.finishTransaction.mockResolvedValue(undefined)
  sdk.purchaseUpdatedListener.mockReturnValue({ remove: vi.fn() })
})

it('reports Ask to Buy as pending when the iOS bridge rejects with deferred-payment', async () => {
  sdk.requestPurchase.mockRejectedValue({ code: 'deferred-payment' })
  expect(await createStore(sku).buy()).toBe('pending')
})

it('requires active ownership even when the request returns an already owned error', async () => {
  sdk.requestPurchase.mockRejectedValue({ code: 'already-owned' })
  const store = createStore(sku)
  expect(await store.buy()).toBe('failed')
  sdk.getAvailablePurchases.mockResolvedValue([purchase])
  expect(await store.buy()).toBe('bought')
  expect(sdk.getAvailablePurchases).toHaveBeenCalledWith({ onlyIncludeActiveItemsIOS: true })
})

it('reports failed sync separately from a successful restore with no purchases', async () => {
  sdk.restorePurchases.mockRejectedValueOnce(new Error('offline'))
  const store = createStore(sku)
  expect(await store.restore()).toBeNull()
  expect(await store.restore()).toBe(false)
})

it('finishes once when both the purchase request and replayed updates deliver the same transaction', async () => {
  const store = createStore(sku)
  store.subscribe(async () => true)
  const emit = sdk.purchaseUpdatedListener.mock.calls[0]![0]
  sdk.requestPurchase.mockImplementation(async () => {
    emit(purchase)
    emit(purchase)
    return purchase
  })
  sdk.getAvailablePurchases.mockResolvedValue([purchase])
  expect(await store.buy()).toBe('bought')
  emit(purchase)
  expect(sdk.finishTransaction).toHaveBeenCalledTimes(1)
})

it('retries initialization after a stalled connection and clears completed read timers', async () => {
  vi.useFakeTimers()
  try {
    sdk.initConnection.mockImplementationOnce(() => new Promise(() => {}))
    const store = createStore(sku)
    const first = store.owned()
    await vi.runAllTimersAsync()
    expect(await first).toBeNull()
    expect(await store.owned()).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  } finally {
    vi.useRealTimers()
  }
})

it('leaves a transaction unfinished when verified delivery has to be retried', async () => {
  const store = createStore(sku)
  const delivery = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true)
  store.subscribe(delivery)
  const emit = sdk.purchaseUpdatedListener.mock.calls[0]![0]
  emit(purchase)
  await Promise.resolve()
  expect(sdk.finishTransaction).not.toHaveBeenCalled()
  emit(purchase)
  await Promise.resolve()
  expect(sdk.finishTransaction).toHaveBeenCalledTimes(1)
})
