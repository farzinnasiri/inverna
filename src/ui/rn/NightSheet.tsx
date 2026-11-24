import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Bell, ChevronDown, ChevronUp, RotateCcw, Trash2 } from 'lucide-react-native'
import { formatBedtime12h } from '@/core/night'
import { clearAll } from '@/core/storage'
import { haptics, notifications } from '@/platform'
import { useTokenColors } from '@/ui/hooks/useTokenColors'
import { useHighScores } from '@/ui/state/highscores'
import { useNav } from '@/ui/state/nav'
import { useSession } from '@/ui/state/session'
import { useSettings } from '@/ui/state/settings'
import { useSound } from '@/ui/state/sound'
import { BedtimeWheel } from './BedtimeWheel'
import { Button, HoldButton, LightSlider, Segmented, Sheet, Toggle } from './controls'
import { GlassSurface } from './Glass'

const WIND_DURATIONS = [
  { value: 10, label: '10m' },
  { value: 15, label: '15m' },
  { value: 20, label: '20m' },
  { value: 30, label: '30m' },
] as const

export function NightSheet() {
  const { color } = useTokenColors()
  const open = useNav((s) => s.nightOpen)
  const setOpen = useNav((s) => s.setNightOpen)
  const setOnboardingReplay = useNav((s) => s.setOnboardingReplay)

  const light = useSettings((s) => s.light)
  const followBedtime = useSettings((s) => s.followBedtime)
  const schedule = useSettings((s) => s.schedule)
  const sessionMinutes = useSettings((s) => s.sessionMinutes)
  const sfx = useSettings((s) => s.sfx)
  const hapticsOn = useSettings((s) => s.haptics)
  const set = useSettings((s) => s.set)
  const setSchedule = useSettings((s) => s.setSchedule)

  const [editingBedtime, setEditingBedtime] = useState(false)
  const [reminderStatus, setReminderStatus] = useState<string | null>(null)
  const [confirmWipe, setConfirmWipe] = useState(false)

  const close = () => {
    setOpen(false)
    setTimeout(() => {
      setEditingBedtime(false)
      setReminderStatus(null)
      setConfirmWipe(false)
    }, 240)
  }

  const handleReminder = async () => {
    const res = await notifications.scheduleBedtimeReminder(schedule)
    if (res === 'scheduled') setReminderStatus('Daily reminder set')
    else if (res === 'downloaded') setReminderStatus('Calendar file saved')
    else setReminderStatus('Notifications disabled')
  }

  const wipeAndRestartOnboarding = () => {
    if (hapticsOn) haptics.play('medium')
    useSound.getState().stop(0.2)
    useSession.getState().dismiss()
    useHighScores.getState().clearAll()
    // Wipe EVERY persisted `lull:*` key (settings, highscores, all 13 game saves, check-in)
    clearAll()
    set({
      light: 0.3,
      followBedtime: true,
      sessionMinutes: 15,
      sessionPreset: 'rainfall',
      sleepTimer: 30,
      sfx: true,
      haptics: true,
      hasCustomMix: false,
      lastGame: null,
      lastCheckInDate: null,
      tonightDay: null,
      tonightIntent: null,
      lastLightsOut: null,
      onboarded: false,
    })
    close()
  }

  return (
    <Sheet open={open} onClose={close} label="Settings">
      <View style={styles.body}>
        <Text style={[styles.title, { color: color.ink }]}>Settings</Text>

        {/* Live 120fps continuous in-app night light slider */}
        <View style={styles.block}>
          <Text style={[styles.label, { color: color.ink3 }]}>In-app night light</Text>
          <LightSlider value={light} onChange={(v) => set({ light: v })} />
        </View>

        {/* Wind-down default duration right on the main sheet */}
        <View style={styles.block}>
          <Text style={[styles.label, { color: color.ink3 }]}>Wind down length</Text>
          <Segmented
            label="Wind down length"
            options={WIND_DURATIONS}
            value={sessionMinutes}
            onChange={(v) => set({ sessionMinutes: v })}
          />
        </View>

        {/* Bedtime + toggles unified cleanly */}
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
                {formatBedtime12h(schedule.bedtime)}
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
            <Text style={[styles.rowLabel, { color: color.ink }]}>Warm 45m before bed</Text>
            <Toggle
              label="Warm 45 minutes before bed"
              checked={followBedtime}
              onChange={(v) => set({ followBedtime: v })}
            />
          </View>

          <View style={[styles.row, styles.rowDiv, { borderTopColor: color.line }]}>
            <Text style={[styles.rowLabel, { color: color.ink }]}>Game cues</Text>
            <Toggle label="Game cues" checked={sfx} onChange={(v) => set({ sfx: v })} />
          </View>

          <View style={[styles.row, styles.rowDiv, { borderTopColor: color.line }]}>
            <Text style={[styles.rowLabel, { color: color.ink }]}>Haptics</Text>
            <Toggle label="Haptics" checked={hapticsOn} onChange={(v) => set({ haptics: v })} />
          </View>
        </GlassSurface>

        <View style={styles.utilityRow}>
          <Button size="sm" onPress={() => void handleReminder()} style={{ flex: 1 }}>
            <Bell size={15} strokeWidth={1.65} color={color.ink2} />
            <Text style={[styles.utilText, { color: color.ink }]} numberOfLines={1}>
              {reminderStatus ?? 'Reminder'}
            </Text>
          </Button>
          <Button
            size="sm"
            onPress={() => {
              close()
              setOnboardingReplay(true)
            }}
            style={{ flex: 1 }}
          >
            <RotateCcw size={15} strokeWidth={1.65} color={color.ink2} />
            <Text style={[styles.utilText, { color: color.ink }]}>Replay intro</Text>
          </Button>
        </View>

        {confirmWipe ? (
          <View style={styles.wipeConfirm}>
            <HoldButton
              label="Hold to clear data & restart onboarding"
              onConfirm={wipeAndRestartOnboarding}
            />
            <Button variant="ghost" size="sm" block onPress={() => setConfirmWipe(false)}>
              Cancel
            </Button>
          </View>
        ) : (
          <Pressable
            onPress={() => {
              if (hapticsOn) haptics.play('light')
              setConfirmWipe(true)
            }}
            accessibilityRole="button"
            accessibilityLabel="Clear all data and restart onboarding"
            style={({ pressed }) => [
              styles.wipeRow,
              {
                borderColor: 'rgba(226, 122, 118, 0.28)',
                backgroundColor: 'rgba(226, 122, 118, 0.08)',
                opacity: pressed ? 0.8 : 1,
              },
            ]}
          >
            <Trash2 size={15} strokeWidth={1.65} color="#E27A76" />
            <Text style={styles.wipeText}>Clear data &amp; restart onboarding</Text>
          </Pressable>
        )}
      </View>
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
    fontSize: 12.5,
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
    height: 52,
  },
  rowDiv: {
    borderTopWidth: 1,
  },
  rowLabel: {
    fontSize: 15,
    fontWeight: '500',
  },
  bedRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  bedValue: {
    fontSize: 15.5,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  wheelWrap: {
    padding: 12,
    borderTopWidth: 1,
  },
  utilityRow: {
    flexDirection: 'row',
    gap: 8,
  },
  utilText: {
    fontSize: 14,
    fontWeight: '500',
  },
  wipeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderCurve: 'continuous',
  },
  wipeText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#E27A76',
  },
  wipeConfirm: {
    gap: 6,
  },
})
