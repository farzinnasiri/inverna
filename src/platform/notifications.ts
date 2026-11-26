import { Platform } from 'react-native'
import * as Notifications from 'expo-notifications'
import { upcomingWindDowns, type Schedule } from '@/core/night'
import { downloadBedtimeIcs } from './web/calendar'

const OLD_DAILY_ID = 'inverna-bedtime-reminder'
const ID_PREFIX = 'inverna-winddown-'
/** Nights scheduled ahead; topped up every time the app opens. */
const NIGHTS_AHEAD = 7

export interface ReminderMessage {
  title: string
  body: string
}

/**
 * Every change to scheduled reminders goes through here, one at a time.
 * Each call takes a new generation; a plan still running checks it after
 * every await and stops as soon as a newer call exists, so turning
 * reminders off or erasing everything always has the last word.
 */
let generation = 0
let queue: Promise<unknown> = Promise.resolve()
function serially<T>(job: (isCurrent: () => boolean) => Promise<T>): Promise<T> {
  const mine = ++generation
  const run = queue.then(() => job(() => mine === generation))
  queue = run.catch(() => {})
  return run
}

/** The night's own id: its local date, so a clock change can't give two nights one id. */
function reminderId(start: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${ID_PREFIX}${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`
}

/** Days since 1970 by the local calendar, for rotating the messages. */
const localDay = (d: Date) => Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000)

/**
 * One reminder a night when wind down starts, each night a different message.
 * iOS can't rotate a repeating notification's text, so the next week is
 * scheduled as one-off notifications and re-planned whenever the app opens or
 * the bedtime changes. Tapping one opens the check-in (`data.checkIn`).
 *
 * `ask`: request permission if not granted yet (only from a user action).
 */
export function planReminders(
  schedule: Schedule,
  messages: readonly ReminderMessage[],
  { ask = false, now = new Date() }: { ask?: boolean; now?: Date } = {},
): Promise<'scheduled' | 'denied' | 'superseded' | 'failed'> {
  if (Platform.OS === 'web') return Promise.resolve('denied')
  return serially(async (isCurrent) => {
    try {
      let { status } = await Notifications.getPermissionsAsync()
      if (status !== 'granted' && ask) status = (await Notifications.requestPermissionsAsync()).status
      if (status !== 'granted') return 'denied'
      if (!isCurrent()) return 'superseded'

      await cancelOurs()
      if (messages.length === 0) return 'scheduled'
      const starts = upcomingWindDowns(schedule, now, NIGHTS_AHEAD)
      for (const start of starts) {
        if (!isCurrent()) return 'superseded'
        // Rotate by calendar day so the same night always gets the same line.
        const msg = messages[localDay(start) % messages.length]!
        await Notifications.scheduleNotificationAsync({
          identifier: reminderId(start),
          content: { title: msg.title, body: msg.body, sound: false, data: { checkIn: true } },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: start },
        })
      }
      // Turned off while the last one was being added: take them all back.
      if (!isCurrent()) return 'superseded'
      return 'scheduled'
    } catch {
      // Not a refusal: Settings only says "turned off in iPhone Settings" for that.
      return 'failed'
    }
  })
}

async function cancelOurs(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(OLD_DAILY_ID).catch(() => {})
  const all = await Notifications.getAllScheduledNotificationsAsync()
  await Promise.all(
    all
      .filter((n) => n.identifier.startsWith(ID_PREFIX))
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => {})),
  )
}

/**
 * Remove every reminder. Wins over any plan still running. `delivered` also
 * clears ones already in Notification Centre (Erase all data).
 */
export function clearReminders({ delivered = false }: { delivered?: boolean } = {}): Promise<void> {
  if (Platform.OS === 'web') return Promise.resolve()
  return serially(async () => {
    try {
      await cancelOurs()
      if (delivered) await Notifications.dismissAllNotificationsAsync()
    } catch {
      /* nothing scheduled */
    }
  })
}

const handledTaps = new Set<string>()

/** Calls `onOpen` when the user taps a wind-down reminder (also the one that launched the app). */
export function onReminderOpened(onOpen: () => void): () => void {
  if (Platform.OS === 'web') return () => {}
  const isOurs = (r: Notifications.NotificationResponse | null) =>
    Boolean(r && (r.notification.request.content.data as { checkIn?: boolean } | undefined)?.checkIn)
  // The tap that launched the app is reported again on every call; open it once.
  const once = (r: Notifications.NotificationResponse | null) => {
    if (!r || !isOurs(r)) return
    const id = `${r.notification.request.identifier}@${r.notification.date}`
    if (handledTaps.has(id)) return
    handledTaps.add(id)
    onOpen()
  }
  void Notifications.getLastNotificationResponseAsync()
    .then(once)
    .catch(() => {})
  const sub = Notifications.addNotificationResponseReceivedListener(once)
  return () => sub.remove()
}

/** Web: a calendar file with the nightly wind-down, since browsers can't schedule notifications offline. */
export function downloadReminderCalendar(schedule: Schedule): void {
  if (Platform.OS === 'web') downloadBedtimeIcs(schedule)
}
