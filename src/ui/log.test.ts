import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }))
const { logError, setLogSink, startEvent } = await import('./log')
type WideEvent = import('./log').WideEvent

afterEach(() => setLogSink(null))

describe('wide events', () => {
  it('with no sink, nothing is recorded', () => {
    const send = vi.fn()
    startEvent('round', { game: 'nine' }).add({ moves: 3 }).end()
    expect(send).not.toHaveBeenCalled()
  })

  it('one event per unit of work, with everything added along the way', () => {
    const sent: WideEvent[] = []
    setLogSink({ send: (e) => sent.push(e) })
    const ev = startEvent('round', { game: 'nine' })
    ev.add({ moves: 3 }).add({ solved: true })
    ev.end()
    ev.end()
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ name: 'round', outcome: 'ok', fields: { game: 'nine', moves: 3, solved: true, platform: 'ios' } })
  })

  it('a caught error carries where it happened', () => {
    const sent: WideEvent[] = []
    setLogSink({ send: (e) => sent.push(e) })
    logError('reminders', new Error('denied'))
    expect(sent[0]).toMatchObject({ name: 'error', outcome: 'error', fields: { where: 'reminders' }, error: { message: 'denied' } })
  })
})
