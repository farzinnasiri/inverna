import type { Schedule } from '@/core/night'
import { parseHHMM } from '@/core/night'

const ICAL_DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']

/**
 * Downloads a standard recurring .ics calendar reminder for the user's
 * wind-down start time. Native Expo builds replace this with expo-notifications.
 */
export function downloadBedtimeIcs(schedule: Schedule): void {
  const { h, m } = parseHHMM(schedule.bedtime)
  const start = new Date()
  start.setHours(h, m - schedule.leadMinutes, 0, 0)
  if (start.getTime() < Date.now()) start.setDate(start.getDate() + 1)

  const pad = (n: number) => String(n).padStart(2, '0')
  const dt = (d: Date) =>
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`

  const end = new Date(start.getTime() + schedule.leadMinutes * 60_000)
  const days = schedule.days.length > 0 ? schedule.days : [0, 1, 2, 3, 4, 5, 6]
  const byday = days.map((d) => ICAL_DAYS[d]).join(',')

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Lull//Bedtime//EN',
    'BEGIN:VEVENT',
    `UID:lull-winddown-${Date.now()}@lull.local`,
    `DTSTAMP:${dt(new Date())}`,
    `DTSTART:${dt(start)}`,
    `DTEND:${dt(end)}`,
    `RRULE:FREQ=WEEKLY;BYDAY=${byday}`,
    'SUMMARY:Time to wind down',
    'DESCRIPTION:Put away the feeds and open Lull for a quiet wind-down.',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'TRIGGER:PT0M',
    'DESCRIPTION:Time to wind down',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')

  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'lull-bedtime.ics'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
