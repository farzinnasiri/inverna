import { Platform } from 'react-native'
import * as Notifications from 'expo-notifications'
import { parseHHMM, type Schedule } from '@/core/night'
import { downloadBedtimeIcs } from './web/calendar'

const BEDTIME_ID = 'lull-bedtime-reminder'

/**
 * Schedules a gentle daily on-device bedtime wind-down notification on iOS/Android
 * (using Apple's UNUserNotificationCenter via expo-notifications) or downloads
 * a recurring .ics calendar file on Web.
 */
export async function scheduleBedtimeReminder(schedule: Schedule): Promise<'scheduled' | 'downloaded' | 'denied'> {
  if (Platform.OS === 'web') {
    downloadBedtimeIcs(schedule)
    return 'downloaded'
  }

  try {
    const perms = await Notifications.getPermissionsAsync()
    let status = perms.status
    if (status !== 'granted') {
      const req = await Notifications.requestPermissionsAsync()
      status = req.status
    }
    if (status !== 'granted') return 'denied'

    await Notifications.cancelScheduledNotificationAsync(BEDTIME_ID).catch(() => {})

    const { h, m } = parseHHMM(schedule.bedtime)
    const total = (h * 60 + m - schedule.leadMinutes + 1440) % 1440
    const hour = Math.floor(total / 60)
    const minute = total % 60

    await Notifications.scheduleNotificationAsync({
      identifier: BEDTIME_ID,
      content: {
        title: 'Time to wind down',
        body: 'Put away the feeds and open Lull.',
        sound: false,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute,
      },
    })
    return 'scheduled'
  } catch {
    return 'denied'
  }
}

export async function cancelBedtimeReminder(): Promise<void> {
  if (Platform.OS === 'web') return
  await Notifications.cancelScheduledNotificationAsync(BEDTIME_ID).catch(() => {})
}
