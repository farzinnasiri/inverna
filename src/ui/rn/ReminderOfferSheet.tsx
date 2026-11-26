import { useState } from 'react'
import { Linking, StyleSheet, Text, View } from 'react-native'
import { BellRing } from 'lucide-react-native'
import { feel } from '@/ui/feel'
import { reminderOffer as copy } from '@/ui/copy'
import { useTokenColors } from '@/ui/hooks/useTokenColors'
import { useNav } from '@/ui/state/nav'
import { useSettings } from '@/ui/state/settings'
import { Button, Sheet } from './controls'
import { planRemindersNow } from './reminders'

/**
 * The bedtime reminder, offered now and then while it's off (core/reminderOffer
 * decides when). "Not now" twice and it stops asking.
 */
export function ReminderOfferSheet() {
  const { color } = useTokenColors()
  const open = useNav((s) => s.reminderOffer)
  const setOpen = useNav((s) => s.setReminderOffer)
  const [state, setState] = useState<'ask' | 'denied' | 'done'>('ask')

  const close = (declined: boolean) => {
    if (declined && state === 'ask') {
      const st = useSettings.getState()
      st.set({ reminderOfferDeclines: st.reminderOfferDeclines + 1 })
    }
    setOpen(false)
    setTimeout(() => setState('ask'), 300)
  }

  const accept = async () => {
    feel('commit')
    useSettings.getState().set({ reminders: true })
    const res = await planRemindersNow({ ask: true })
    if (res === 'denied') {
      useSettings.getState().set({ reminders: false })
      setState('denied')
      return
    }
    setState('done')
    setTimeout(() => close(false), 1400)
  }

  return (
    <Sheet open={open} onClose={() => close(true)} label={copy.title}>
      <View style={[styles.icon, { backgroundColor: color.accentWash }]}>
        <BellRing size={20} strokeWidth={1.7} color={color.accent} />
      </View>
      <Text style={[styles.title, { color: color.ink }]}>{copy.title}</Text>
      {state === 'denied' ? (
        <>
          <Text style={[styles.body, { color: color.ink2 }]}>{copy.denied}</Text>
          <View style={styles.actions}>
            <Button variant="primary" block onPress={() => void Linking.openSettings()}>
              {copy.openSettings}
            </Button>
            <Button variant="ghost" size="sm" block onPress={() => close(false)}>
              {copy.notNow}
            </Button>
          </View>
        </>
      ) : state === 'done' ? (
        <Text style={[styles.body, { color: color.ink2 }]}>{copy.done}</Text>
      ) : (
        <>
          <Text style={[styles.body, { color: color.ink2 }]}>{copy.body}</Text>
          <Text style={[styles.detail, { color: color.ink3 }]}>{copy.detail}</Text>
          <View style={styles.actions}>
            <Button variant="primary" block onPress={() => void accept()}>
              {copy.yes}
            </Button>
            <Button variant="ghost" size="sm" block onPress={() => close(true)}>
              {copy.notNow}
            </Button>
          </View>
        </>
      )}
    </Sheet>
  )
}

const styles = StyleSheet.create({
  icon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '600',
    letterSpacing: -0.4,
  },
  body: {
    fontSize: 16,
    lineHeight: 23,
    marginTop: 8,
  },
  detail: {
    fontSize: 14,
    lineHeight: 20,
    marginTop: 10,
  },
  actions: {
    gap: 8,
    marginTop: 20,
  },
})
