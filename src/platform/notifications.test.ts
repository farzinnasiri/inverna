import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SCHEDULE, type Schedule } from '@/core/night'

// A fake notification centre: what's scheduled, and whether permission is given.
const centre = vi.hoisted(() => ({
  status: 'granted' as string,
  asked: 0,
  scheduled: new Map<string, { date: Date }>(),
}))

vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }))
vi.mock('expo-notifications', () => ({
  SchedulableTriggerInputTypes: { DATE: 'date' },
  getPermissionsAsync: async () => ({ status: centre.status }),
  requestPermissionsAsync: async () => {
    centre.asked++
    return { status: centre.status }
  },
  getAllScheduledNotificationsAsync: async () => [...centre.scheduled.keys()].map((identifier) => ({ identifier })),
  cancelScheduledNotificationAsync: async (id: string) => void centre.scheduled.delete(id),
  scheduleNotificationAsync: async ({ identifier, trigger }: { identifier: string; trigger: { date: Date } }) => {
    centre.scheduled.set(identifier, { date: trigger.date })
    return identifier
  },
}))

const { planReminders, clearReminders } = await import('./notifications')

const MESSAGES = [{ title: 'Time to wind down', body: 'Your evening starts now.' }]
const schedule: Schedule = { ...DEFAULT_SCHEDULE, enabled: true, days: [0, 1, 2, 3, 4, 5, 6], bedtime: '23:00', leadMinutes: 60 }

beforeEach(() => {
  centre.status = 'granted'
  centre.asked = 0
  centre.scheduled.clear()
})

describe('reminders', () => {
  it('schedules one reminder a night for the next week, an hour before bedtime', async () => {
    const now = new Date(2026, 10, 2, 12, 0)
    expect(await planReminders(schedule, MESSAGES, { now })).toBe('scheduled')
    const dates = [...centre.scheduled.values()].map((v) => v.date).sort((a, b) => +a - +b)
    expect(dates).toHaveLength(7)
    expect(dates[0]!.getHours()).toBe(22)
    expect(dates[0]!.getDate()).toBe(2)
  })

  it("doesn't ask for permission unless told to", async () => {
    centre.status = 'undetermined'
    expect(await planReminders(schedule, MESSAGES)).toBe('denied')
    expect(centre.asked).toBe(0)
  })

  it('clearing removes every reminder', async () => {
    await planReminders(schedule, MESSAGES, { now: new Date(2026, 10, 2, 12, 0) })
    await clearReminders()
    expect(centre.scheduled.size).toBe(0)
  })

  // ISS-06.2: ids come from UTC days, so across the spring change two nights
  // can share one id and one reminder is lost. Phase 1 step 5 uses local dates.
  it.skip('every night keeps its own reminder across daylight saving', async () => {
    vi.stubEnv('TZ', 'Europe/Rome')
    try {
      const late: Schedule = { ...schedule, bedtime: '02:00', leadMinutes: 30 }
      await planReminders(late, MESSAGES, { now: new Date('2026-03-26T12:00:00+01:00') })
      expect(centre.scheduled.size).toBe(7)
    } finally {
      vi.unstubAllEnvs()
    }
  })

  // ISS-06.1: turning reminders off while a plan is still running loses, and
  // the plan schedules the week anyway. Phase 1 step 5 makes off always win.
  it.skip('turning reminders off wins over a plan still running', async () => {
    const plan = planReminders(schedule, MESSAGES, { now: new Date(2026, 10, 2, 12, 0) })
    await clearReminders()
    await plan
    expect(centre.scheduled.size).toBe(0)
  })
})
