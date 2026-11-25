import { Platform } from 'react-native'
import * as Notifications from 'expo-notifications'
import { upcomingWindDowns, type Schedule } from '@/core/night'
import { downloadBedtimeIcs } from './web/calendar'

const OLD_DAILY_ID = 'lull-bedtime-reminder'
const ID_PREFIX = 'lull-winddown-'
/** Nights scheduled ahead; topped up every time the app opens. */
const NIGHTS_AHEAD = 7

export interface ReminderMessage {
  title: string
  body: string
}

/**
 * One reminder a night when wind down starts, each night a different message.
 * iOS can't rotate a repeating notification's text, so the next week is
 * scheduled as one-off notifications and re-planned whenever the app opens or
 * the bedtime changes. Tapping one opens the check-in (`data.checkIn`).
 *
 * `ask`: request permission if not granted yet (only from a user action).
 */
export async function planReminders(
  schedule: Schedule,
  messages: readonly ReminderMessage[],
  { ask = false, now = new Date() }: { ask?: boolean; now?: Date } = {},
): Promise<'scheduled' | 'denied'> {
  if (Platform.OS === 'web') return 'denied'
  try {
    let { status } = await Notifications.getPermissionsAsync()
    if (status !== 'granted' && ask) status = (await Notifications.requestPermissionsAsync()).status
    if (status !== 'granted') return 'denied'

    await clearReminders()
    if (messages.length === 0) return 'scheduled'
    const starts = upcomingWindDowns(schedule, now, NIGHTS_AHEAD)
    // Rotate by calendar day so the same night always gets the same line.
    for (const start of starts) {
      const day = Math.floor(start.getTime() / 86_400_000)
      const msg = messages[day % messages.length]!
      await Notifications.scheduleNotificationAsync({
        identifier: `${ID_PREFIX}${day}`,
        content: { title: msg.title, body: msg.body, sound: false, data: { checkIn: true } },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: start },
      })
    }
    return 'scheduled'
  } catch {
    return 'denied'
  }
}

export async function clearReminders(): Promise<void> {
  if (Platform.OS === 'web') return
  try {
    await Notifications.cancelScheduledNotificationAsync(OLD_DAILY_ID).catch(() => {})
    const all = await Notifications.getAllScheduledNotificationsAsync()
    await Promise.all(
      all
        .filter((n) => n.identifier.startsWith(ID_PREFIX))
        .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => {})),
    )
  } catch {
    /* nothing scheduled */
  }
}

/** Calls `onOpen` when the user taps a wind-down reminder (also the one that launched the app). */
export function onReminderOpened(onOpen: () => void): () => void {
  if (Platform.OS === 'web') return () => {}
  const isOurs = (r: Notifications.NotificationResponse | null) =>
    Boolean(r && (r.notification.request.content.data as { checkIn?: boolean } | undefined)?.checkIn)
  void Notifications.getLastNotificationResponseAsync()
    .then((r) => {
      if (isOurs(r)) onOpen()
    })
    .catch(() => {})
  const sub = Notifications.addNotificationResponseReceivedListener((r) => {
    if (isOurs(r)) onOpen()
  })
  return () => sub.remove()
}

/** Web: a calendar file with the nightly wind-down, since browsers can't schedule notifications offline. */
export function downloadReminderCalendar(schedule: Schedule): void {
  if (Platform.OS === 'web') downloadBedtimeIcs(schedule)
}
