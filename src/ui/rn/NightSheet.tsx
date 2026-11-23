import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Bell, ChevronLeft, ChevronRight, Minus, Plus } from 'lucide-react-native'
import { formatBedtimeShort, formatHHMM, parseHHMM } from '@/core/night'
import { kv } from '@/core/storage'
import { notifications } from '@/platform'
import { useTokenColors } from '@/ui/hooks/useTokenColors'
import { useHighScores } from '@/ui/state/highscores'
import { useNav } from '@/ui/state/nav'
import { useSession } from '@/ui/state/session'
import { useSettings } from '@/ui/state/settings'
import { useSound } from '@/ui/state/sound'
import { Button, HoldButton, IconButton, LightSlider, Sheet, Toggle } from './controls'

export function NightSheet() {
  const { color } = useTokenColors()
  const open = useNav((s) => s.nightOpen)
  const setOpen = useNav((s) => s.setNightOpen)
  const setOnboardingReplay = useNav((s) => s.setOnboardingReplay)

  const light = useSettings((s) => s.light)
  const followBedtime = useSettings((s) => s.followBedtime)
  const schedule = useSettings((s) => s.schedule)
  const sfx = useSettings((s) => s.sfx)
  const haptics = useSettings((s) => s.haptics)
  const set = useSettings((s) => s.set)
  const setSchedule = useSettings((s) => s.setSchedule)

  const [page, setPage] = useState<'main' | 'more'>('main')
  const [editingBedtime, setEditingBedtime] = useState(false)
  const [reminderStatus, setReminderStatus] = useState<string | null>(null)

  const close = () => {
    setOpen(false)
    setTimeout(() => {
      setPage('main')
      setEditingBedtime(false)
      setReminderStatus(null)
    }, 240)
  }

  const nudgeBedtime = (deltaMinutes: number) => {
    const { h, m } = parseHHMM(schedule.bedtime)
    const total = (h * 60 + m + deltaMinutes + 1440) % 1440
    setSchedule({ bedtime: formatHHMM(Math.floor(total / 60), total % 60) })
  }

  const handleReminder = async () => {
    const res = await notifications.scheduleBedtimeReminder(schedule)
    if (res === 'scheduled') setReminderStatus('Daily reminder set')
    else if (res === 'downloaded') setReminderStatus('Calendar file saved')
    else setReminderStatus('Notifications disabled')
  }

  const eraseAll = () => {
    useSound.getState().stop(0.2)
    useSession.getState().dismiss()
    useHighScores.getState().clearAll()
    const store = kv()
    const keys = [
      'lull:v1:settings',
      'lull:v1:session',
      'lull:v1:highscores',
      'lull:v1:game:settle',
      'lull:v1:game:cascade',
      'lull:v1:game:hue',
      'lull:v1:game:thread',
      'lull:v1:game:kindle',
      'lull:v1:game:pond',
      'lull:v1:game:drift',
      'lull:v1:game:nine',
      'lull:v1:game:weave',
      'lull:v1:game:patience',
      'lull:v1:game:lanterns',
      'lull:v1:game:rally',
      'lull:v1:game:chime',
    ]
    for (const k of keys) store.removeItem(k)
    set({
      light: 0.3,
      followBedtime: true,
      sfx: true,
      haptics: true,
      hasCustomMix: false,
      lastGame: null,
      onboarded: false,
    })
    close()
  }

  return (
    <Sheet open={open} onClose={close} label="Night">
      {page === 'main' ? (
        <View style={styles.body}>
          <Text style={[styles.title, { color: color.ink }]}>Night</Text>

          <View style={styles.block}>
            <Text style={[styles.label, { color: color.ink3 }]}>Light</Text>
            <LightSlider value={light} onChange={(v) => set({ light: v })} />
          </View>

          <View style={[styles.card, { backgroundColor: color.surface2, borderColor: color.line }]}>
            <Pressable
              onPress={() => setEditingBedtime((e) => !e)}
              style={styles.row}
              accessibilityRole="button"
              accessibilityLabel="Bedtime"
            >
              <Text style={[styles.rowLabel, { color: color.ink }]}>Bedtime</Text>
              <Text style={[styles.bedValue, { color: color.accent }]}>
                {formatBedtimeShort(schedule.bedtime)}
              </Text>
            </Pressable>

            {editingBedtime && (
              <View style={[styles.stepperRow, { borderTopColor: color.line }]}>
                <Button size="sm" onPress={() => nudgeBedtime(-60)} accessibilityLabel="Minus 1 hour">
                  −1h
                </Button>
                <IconButton label="Minus 15 minutes" onPress={() => nudgeBedtime(-15)}>
                  <Minus size={18} color={color.ink} />
                </IconButton>
                <Text style={[styles.stepperTime, { color: color.ink }]}>
                  {formatBedtimeShort(schedule.bedtime)}
                </Text>
                <IconButton label="Plus 15 minutes" onPress={() => nudgeBedtime(15)}>
                  <Plus size={18} color={color.ink} />
                </IconButton>
                <Button size="sm" onPress={() => nudgeBedtime(60)} accessibilityLabel="Plus 1 hour">
                  +1h
                </Button>
              </View>
            )}

            <View style={[styles.row, styles.rowDiv, { borderTopColor: color.line }]}>
              <Text style={[styles.rowLabel, { color: color.ink }]}>Dim before bed</Text>
              <Toggle
                label="Dim before bed"
                checked={followBedtime}
                onChange={(v) => set({ followBedtime: v })}
              />
            </View>
          </View>

          <Pressable
            onPress={() => setPage('more')}
            style={({ pressed }) => [
              styles.moreRow,
              {
                backgroundColor: pressed ? color.surface3 : color.surface2,
                borderColor: color.line,
              },
            ]}
          >
            <Text style={[styles.rowLabel, { color: color.ink }]}>More</Text>
            <ChevronRight size={18} strokeWidth={1.6} color={color.ink3} />
          </Pressable>
        </View>
      ) : (
        <View style={styles.body}>
          <View style={styles.moreHead}>
            <IconButton label="Back to Night" onPress={() => setPage('main')} style={{ marginLeft: -10 }}>
              <ChevronLeft size={20} strokeWidth={1.6} color={color.ink2} />
            </IconButton>
            <Text style={[styles.title, { color: color.ink }]}>More</Text>
          </View>

          <View style={[styles.card, { backgroundColor: color.surface2, borderColor: color.line }]}>
            <View style={styles.row}>
              <Text style={[styles.rowLabel, { color: color.ink }]}>Game sounds</Text>
              <Toggle label="Game sounds" checked={sfx} onChange={(v) => set({ sfx: v })} />
            </View>
            <View style={[styles.row, styles.rowDiv, { borderTopColor: color.line }]}>
              <Text style={[styles.rowLabel, { color: color.ink }]}>Haptics</Text>
              <Toggle label="Haptics" checked={haptics} onChange={(v) => set({ haptics: v })} />
            </View>
          </View>

          <Button block onPress={() => void handleReminder()}>
            <Bell size={16} strokeWidth={1.6} color={color.ink2} />
            <Text style={[styles.btnInlineText, { color: color.ink }]}>
              {reminderStatus ?? 'Bedtime reminder'}
            </Text>
          </Button>

          <Button
            block
            onPress={() => {
              close()
              setOnboardingReplay(true)
            }}
          >
            Re-tune Lull
          </Button>

          <HoldButton label="Hold to erase local data" onConfirm={eraseAll} />
        </View>
      )}
    </Sheet>
  )
}

const styles = StyleSheet.create({
  body: {
    gap: 14,
  },
  title: {
    fontSize: 21,
    fontWeight: '600',
    letterSpacing: -0.3,
  },
  block: {
    gap: 8,
  },
  label: {
    fontSize: 12.5,
    fontWeight: '500',
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    height: 54,
  },
  rowDiv: {
    borderTopWidth: 1,
  },
  rowLabel: {
    fontSize: 15.5,
    fontWeight: '500',
  },
  bedValue: {
    fontSize: 16,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
  },
  stepperTime: {
    fontSize: 17,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  moreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
  },
  moreHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  btnInlineText: {
    fontSize: 15.5,
    fontWeight: '500',
  },
})
