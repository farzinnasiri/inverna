import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Bell, ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react-native'
import { formatBedtimeShort } from '@/core/night'
import { kv } from '@/core/storage'
import { notifications } from '@/platform'
import { useTokenColors } from '@/ui/hooks/useTokenColors'
import { useHighScores } from '@/ui/state/highscores'
import { useNav } from '@/ui/state/nav'
import { useSession } from '@/ui/state/session'
import { useSettings } from '@/ui/state/settings'
import { useSound } from '@/ui/state/sound'
import { BedtimeWheel } from './BedtimeWheel'
import { Button, HoldButton, IconButton, LightSlider, Sheet, Toggle } from './controls'
import { GlassSurface } from './Glass'

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
            <Text style={[styles.label, { color: color.ink3 }]}>Night light</Text>
            <LightSlider value={light} onChange={(v) => set({ light: v })} />
          </View>

          <GlassSurface variant="card" radius={20} style={styles.card}>
            <Pressable
              onPress={() => setEditingBedtime((e) => !e)}
              style={styles.row}
              accessibilityRole="button"
              accessibilityLabel="Bedtime"
            >
              <Text style={[styles.rowLabel, { color: color.ink }]}>Bedtime</Text>
              <View style={styles.bedRight}>
                <Text style={[styles.bedValue, { color: color.accent }]}>
                  {formatBedtimeShort(schedule.bedtime)}
                </Text>
                {editingBedtime ? (
                  <ChevronUp size={16} strokeWidth={1.65} color={color.ink3} />
                ) : (
                  <ChevronDown size={16} strokeWidth={1.65} color={color.ink3} />
                )}
              </View>
            </Pressable>

            {editingBedtime && (
              <View style={[styles.wheelWrap, { borderTopColor: color.line }]}>
                <BedtimeWheel
                  compact
                  value={schedule.bedtime}
                  onChange={(bedtime) => setSchedule({ bedtime })}
                />
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
          </GlassSurface>

          <Pressable
            onPress={() => setPage('more')}
            style={({ pressed }) => [{ opacity: pressed ? 0.84 : 1 }]}
          >
            <GlassSurface variant="card" radius={18} style={styles.moreRow}>
              <Text style={[styles.rowLabel, { color: color.ink }]}>More</Text>
              <ChevronRight size={18} strokeWidth={1.65} color={color.ink3} />
            </GlassSurface>
          </Pressable>
        </View>
      ) : (
        <View style={styles.body}>
          <View style={styles.moreHead}>
            <IconButton label="Back to Night" onPress={() => setPage('main')} style={{ marginLeft: -10 }}>
              <ChevronLeft size={20} strokeWidth={1.65} color={color.ink2} />
            </IconButton>
            <Text style={[styles.title, { color: color.ink }]}>More</Text>
          </View>

          <GlassSurface variant="card" radius={20} style={styles.card}>
            <View style={styles.row}>
              <Text style={[styles.rowLabel, { color: color.ink }]}>Game sounds</Text>
              <Toggle label="Game sounds" checked={sfx} onChange={(v) => set({ sfx: v })} />
            </View>
            <View style={[styles.row, styles.rowDiv, { borderTopColor: color.line }]}>
              <Text style={[styles.rowLabel, { color: color.ink }]}>Haptics</Text>
              <Toggle label="Haptics" checked={haptics} onChange={(v) => set({ haptics: v })} />
            </View>
          </GlassSurface>

          <Button block onPress={() => void handleReminder()}>
            <Bell size={16} strokeWidth={1.65} color={color.ink2} />
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
    fontSize: 22,
    fontWeight: '600',
    letterSpacing: -0.35,
  },
  block: {
    gap: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
  },
  card: {
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
  bedRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  bedValue: {
    fontSize: 16,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  wheelWrap: {
    padding: 12,
    borderTopWidth: 1,
  },
  moreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    height: 54,
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
