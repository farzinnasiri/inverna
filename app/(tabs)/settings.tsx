import { useState } from 'react'
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { router } from 'expo-router'
import { ChevronDown, ChevronRight, ChevronUp, Trash2 } from 'lucide-react-native'
import { formatRange } from '@/core/night'
import { clearAll } from '@/core/storage'
import { haptics, notifications } from '@/platform'
import { about, settingsCopy } from '@/ui/copy'
import { planRemindersNow } from '@/ui/rn/reminders'
import { useTokenColors } from '@/ui/hooks/useTokenColors'
import { BedtimeWheel } from '@/ui/rn/BedtimeWheel'
import { Button, FRAME_MAX_WIDTH, HoldButton, LightSlider, Sheet, Toggle } from '@/ui/rn/controls'
import { GlassSurface } from '@/ui/rn/Glass'
import { scrollEndClearance, useResponsiveLayout } from '@/ui/rn/hooks'
import { ScienceSheet } from '@/ui/rn/ScienceSheet'
import { useHighScores } from '@/ui/state/highscores'
import { useNav } from '@/ui/state/nav'
import { useSession } from '@/ui/state/session'
import { useSettings } from '@/ui/state/settings'
import { useSound } from '@/ui/state/sound'

export default function SettingsScreen() {
  const { color } = useTokenColors()
  const { insets, isCompact, sideMargin } = useResponsiveLayout()
  const userName = useSettings((s) => s.userName)
  const reminders = useSettings((s) => s.reminders)

  const light = useSettings((s) => s.light)
  const followBedtime = useSettings((s) => s.followBedtime)
  const schedule = useSettings((s) => s.schedule)
  const sfx = useSettings((s) => s.sfx)
  const hapticsOn = useSettings((s) => s.haptics)
  const set = useSettings((s) => s.set)
  const setSchedule = useSettings((s) => s.setSchedule)
  const learnedNights = useSettings((s) => s.rangeLearnedNights)

  const [editingBedtime, setEditingBedtime] = useState(false)
  const [reminderStatus, setReminderStatus] = useState<string | null>(null)
  const [confirmWipe, setConfirmWipe] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [scienceOpen, setScienceOpen] = useState(false)

  const setReminders = async (on: boolean) => {
    set({ reminders: on })
    setReminderStatus(null)
    if (!on) return
    const res = await planRemindersNow({ ask: true })
    if (res === 'denied' && Platform.OS !== 'web') setReminderStatus(settingsCopy.reminderDenied)
  }

  // Erase everything and start again from the first onboarding page.
  const eraseAll = () => {
    if (hapticsOn) haptics.play('medium')
    useSound.getState().stop(0.2)
    useSession.getState().dismiss()
    useHighScores.getState().clearAll()
    useNav.setState({ checkIn: null, windDownOpen: false, mixOpen: false })
    void notifications.clearReminders()
    clearAll()
    useSettings.setState(useSettings.getInitialState())
    setConfirmWipe(false)
    setEditingBedtime(false)
    router.replace('/onboarding')
  }

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        // Insets are counted once, here, so the last row clears the floating tab bar.
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustsScrollIndicatorInsets={false}
        contentContainerStyle={[
          styles.content,
          {
            paddingHorizontal: sideMargin,
            paddingTop: insets.top + (isCompact ? 12 : 20),
            paddingBottom: scrollEndClearance(insets.bottom),
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.frame}>
          <View style={styles.head}>
            <Text style={[styles.title, { color: color.ink }]}>Settings</Text>
            <Text style={[styles.subtitle, { color: color.ink3 }]}>
              Bedtime, screen warmth, and sound
            </Text>
          </View>

          <View style={styles.block}>
            <Text style={[styles.label, { color: color.ink3 }]}>{settingsCopy.nameLabel}</Text>
            <GlassSurface variant="card" radius={18} style={styles.nameCard}>
              <TextInput
                value={userName}
                onChangeText={(v) => set({ userName: v.slice(0, 24) })}
                placeholder={settingsCopy.namePlaceholder}
                placeholderTextColor={color.ink3}
                autoCapitalize="words"
                autoCorrect={false}
                autoComplete="given-name"
                textContentType="givenName"
                returnKeyType="done"
                style={[styles.nameInput, { color: color.ink }]}
                accessibilityLabel={settingsCopy.nameLabel}
              />
            </GlassSurface>
          </View>

          <View style={styles.block}>
            <LightSlider value={light} onChange={(v) => set({ light: v })} />
          </View>

          <GlassSurface variant="card" radius={22} style={styles.card}>
            <Pressable
              onPress={() => setEditingBedtime((e) => !e)}
              style={styles.row}
              accessibilityRole="button"
              accessibilityLabel={`${settingsCopy.rangeLabel}, ${formatRange(schedule)}`}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowLabel, { color: color.ink }]}>{settingsCopy.rangeLabel}</Text>
                <Text style={[styles.rowNote, { color: color.ink3 }]}>
                  {learnedNights ? settingsCopy.rangeLearned(learnedNights) : settingsCopy.rangeNote}
                </Text>
              </View>
              <View style={styles.bedRight}>
                <Text style={[styles.bedValue, { color: color.accent }]} numberOfLines={1}>
                  {formatRange(schedule)}
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
              <Text style={[styles.rowLabel, { color: color.ink }]}>Warm screen before bed</Text>
              <Toggle
                label="Warm 60 minutes before bed"
                checked={followBedtime}
                onChange={(v) => set({ followBedtime: v })}
              />
            </View>

            {Platform.OS !== 'web' ? (
              <View style={[styles.row, styles.rowDiv, { borderTopColor: color.line }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowLabel, { color: color.ink }]}>{settingsCopy.reminderLabel}</Text>
                  <Text style={[styles.rowNote, { color: color.ink3 }]}>
                    {reminderStatus ?? settingsCopy.reminderNote}
                  </Text>
                </View>
                <Toggle label={settingsCopy.reminderLabel} checked={reminders} onChange={(v) => void setReminders(v)} />
              </View>
            ) : null}

            <View style={[styles.row, styles.rowDiv, { borderTopColor: color.line }]}>
              <Text style={[styles.rowLabel, { color: color.ink }]}>Game sounds</Text>
              <Toggle label="Game sounds" checked={sfx} onChange={(v) => set({ sfx: v })} />
            </View>

            <View style={[styles.row, styles.rowDiv, { borderTopColor: color.line }]}>
              <Text style={[styles.rowLabel, { color: color.ink }]}>Haptics</Text>
              <Toggle label="Haptics" checked={hapticsOn} onChange={(v) => set({ haptics: v })} />
            </View>
          </GlassSurface>

          <GlassSurface variant="card" radius={22} style={styles.card}>
            <Pressable
              onPress={() => {
                if (hapticsOn) haptics.play('light')
                setScienceOpen(true)
              }}
              accessibilityRole="button"
              accessibilityLabel={settingsCopy.howItWorks}
              style={({ pressed }) => [styles.row, { opacity: pressed ? 0.7 : 1 }]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowLabel, { color: color.ink }]}>{settingsCopy.howItWorks}</Text>
                <Text style={[styles.rowNote, { color: color.ink3 }]}>{settingsCopy.howItWorksNote}</Text>
              </View>
              <ChevronRight size={17} strokeWidth={1.65} color={color.ink3} />
            </Pressable>
          </GlassSurface>

          {confirmWipe ? (
            <View style={styles.wipeConfirm}>
              <HoldButton
                label={settingsCopy.eraseHold}
                onConfirm={eraseAll}
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
              accessibilityLabel={settingsCopy.erase}
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
              <Text style={styles.wipeText}>{settingsCopy.erase}</Text>
            </Pressable>
          )}

          {/* A small note from the person who made it. */}
          <Pressable
            onPress={() => {
              if (hapticsOn) haptics.play('light')
              setAboutOpen(true)
            }}
            accessibilityRole="button"
            style={({ pressed }) => [styles.credit, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Text style={[styles.creditText, { color: color.ink3 }]}>{about.credit}</Text>
          </Pressable>
        </View>
      </ScrollView>

      <ScienceSheet open={scienceOpen} onClose={() => setScienceOpen(false)} />

      <Sheet open={aboutOpen} onClose={() => setAboutOpen(false)} label={about.title}>
        <Text style={[styles.aboutTitle, { color: color.ink }]}>{about.title}</Text>
        {about.lines.map((line) => (
          <Text key={line} style={[styles.aboutLine, { color: color.ink2 }]}>
            {line}
          </Text>
        ))}
        <Text style={[styles.aboutSign, { color: color.accent }]}>{about.signature}</Text>
      </Sheet>
    </View>
  )
}

const styles = StyleSheet.create({
  credit: {
    alignSelf: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    marginTop: 8,
  },
  creditText: {
    fontSize: 13.5,
    fontWeight: '500',
  },
  aboutTitle: {
    fontSize: 26,
    fontWeight: '600',
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  aboutLine: {
    fontSize: 16,
    lineHeight: 24,
    marginTop: 10,
  },
  aboutSign: {
    fontSize: 16,
    fontWeight: '500',
    fontStyle: 'italic',
    marginTop: 18,
    marginBottom: 8,
  },
  nameCard: {
    height: 52,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  nameInput: {
    fontSize: 16,
    fontWeight: '500',
  },
  rowNote: {
    fontSize: 12.5,
    marginTop: 2,
  },
  root: {
    flex: 1,
    // The backdrop is drawn once behind all tabs (app/(tabs)/_layout.tsx).
    backgroundColor: 'transparent',
  },
  scroll: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    alignItems: 'center',
  },
  frame: {
    width: '100%',
    maxWidth: FRAME_MAX_WIDTH,
    gap: 18,
  },
  head: {
    gap: 3,
  },
  title: {
    fontSize: 30,
    fontWeight: '300',
    letterSpacing: -0.7,
  },
  subtitle: {
    fontSize: 13.5,
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
    height: 54,
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
    gap: 10,
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
    height: 46,
    borderRadius: 16,
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
