import { useEffect } from 'react'
import { AppState } from 'react-native'
import { notifications } from '@/platform'
import { reminders as lines } from '@/ui/copy'
import { useSettings } from '@/ui/state/settings'
import { whileAsking } from './promptGate'

/** This week's reminder lines, with the name in some of them. */
function messages(name: string) {
  const n = name.trim()
  // The name in every other reminder at most, so it stays personal without being constant.
  return lines.map((l, i) => ({ title: n && i % 2 === 1 ? l.named.replaceAll('{name}', n) : l.title, body: l.body }))
}

/** Re-plan the coming week's wind-down reminders from current settings. */
export async function planRemindersNow({ ask = false }: { ask?: boolean } = {}) {
  const st = useSettings.getState()
  if (!st.reminders || !st.onboarded) {
    await notifications.clearReminders()
    return 'denied' as const
  }
  const plan = () => notifications.planReminders(st.schedule, messages(st.userName), { ask })
  return ask ? whileAsking(plan) : plan()
}

/**
 * Keeps reminders in step with bedtime, name and the toggle, and tops them up
 * whenever the app opens. Also notes when the app is left at night, for the
 * learned sleep range.
 */
export function useReminderPlanner() {
  const schedule = useSettings((s) => s.schedule)
  const enabled = useSettings((s) => s.reminders)
  const name = useSettings((s) => s.userName)
  const onboarded = useSettings((s) => s.onboarded)

  useEffect(() => {
    void planRemindersNow()
  }, [schedule, enabled, name, onboarded])

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void planRemindersNow()
      // Leaving Inverna at night is one hint of when they fall asleep (core/sleepRange).
      // recordSleep ignores the daytime; a changed range re-plans the reminders above.
      if (state === 'background' && useSettings.getState().onboarded) useSettings.getState().recordSleep('leftApp')
    })
    return () => sub.remove()
  }, [])
}
