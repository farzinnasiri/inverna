import { useState } from 'react'
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { router } from 'expo-router'
import { ChevronDown, ChevronRight, ChevronUp, ExternalLink, Flame, Moon, Snowflake, Sun, Trash2 } from 'lucide-react-native'
import { brightnessForDim, formatRange } from '@/core/night'
import { feel } from '@/ui/feel'
import { clearAll } from '@/core/storage'
import { notifications } from '@/platform'
import { about, settingsCopy } from '@/ui/copy'
import { planRemindersNow } from '@/ui/rn/reminders'
import { useTokenColors } from '@/ui/hooks/useTokenColors'
import { Button, FRAME_MAX_WIDTH, HoldButton, PillSlider, Sheet, Toggle } from '@/ui/rn/controls'
import { GlassSurface } from '@/ui/rn/Glass'
import { scrollEndClearance, useResponsiveLayout } from '@/ui/rn/hooks'
import { SleepAround } from '@/ui/rn/SleepAround'
import { useNightFilterMetrics } from '@/ui/rn/NightFilterOverlay'
import { ScienceSheet } from '@/ui/rn/ScienceSheet'
import { PRIVACY_URL, SUPPORT_URL } from '@/ui/links'
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

  const schedule = useSettings((s) => s.schedule)
  const sfx = useSettings((s) => s.sfx)
  const autoDescent = useSettings((s) => s.autoDescent)
  const hapticsOn = useSettings((s) => s.haptics)
  const set = useSettings((s) => s.set)
  const setSchedule = useSettings((s) => s.setSchedule)
  const learnedNights = useSettings((s) => s.rangeLearnedNights)

  const [editingBedtime, setEditingBedtime] = useState(false)
  const [lightOpen, setLightOpen] = useState(false)
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
    feel('commit')
    // Nothing of theirs stays on the lock screen or can be resumed from it (ISS-04).
    useSound.getState().reset()
    useSession.getState().dismiss()
    useHighScores.getState().clearAll()
    useNav.setState({ checkIn: null, windDownOpen: false, mixOpen: false })
    // Scheduled ones and any still in Notification Centre (they can carry their name).
    void notifications.clearReminders({ delivered: true })
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
          <Text style={[styles.title, { color: color.ink }]}>Settings</Text>

          {/* No title: the placeholder says what it is, and a name filled in speaks for itself. */}
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

          <LightAndColour open={lightOpen} onToggle={() => setLightOpen((o) => !o)} />

          <GlassSurface variant="card" radius={22} style={styles.card}>
            <Pressable
              onPress={() => setEditingBedtime((e) => !e)}
              style={[styles.row, styles.rowTall]}
              accessibilityRole="button"
              accessibilityState={{ expanded: editingBedtime }}
              accessibilityLabel={`${settingsCopy.rangeLabel}, ${formatRange(schedule)}`}
            >
              <View style={styles.rowText}>
                <Text style={[styles.rowLabel, { color: color.ink }]}>{settingsCopy.rangeLabel}</Text>
                <Text style={[styles.bedValue, { color: color.accent }]} numberOfLines={1}>
                  {formatRange(schedule)}
                </Text>
                {/* Only once it has learned: the range alone says enough until then. */}
                {learnedNights ? (
                  <Text style={[styles.rowNote, { color: color.ink3 }]}>{settingsCopy.rangeLearned(learnedNights)}</Text>
                ) : null}
              </View>
              <View style={styles.bedRight}>
                {editingBedtime ? (
                  <ChevronUp size={16} strokeWidth={1.65} color={color.ink3} />
                ) : (
                  <ChevronDown size={16} strokeWidth={1.65} color={color.ink3} />
                )}
              </View>
            </Pressable>

            {editingBedtime && (
              <View style={[styles.wheelWrap, { borderTopColor: color.line }]}>
                <SleepAround
                  compact
                  showSummary={false}
                  schedule={schedule}
                  onChange={(patch) => setSchedule({ ...patch, enabled: true })}
                />
              </View>
            )}

            {Platform.OS !== 'web' ? (
              <View style={[styles.row, styles.rowTall, styles.rowDiv, { borderTopColor: color.line }]}>
                <View style={styles.rowText}>
                  <Text style={[styles.rowLabel, { color: color.ink }]}>{settingsCopy.reminderLabel}</Text>
                  <Text style={[styles.rowNote, { color: color.ink3 }]}>
                    {reminderStatus ?? settingsCopy.reminderNote}
                  </Text>
                </View>
                <Toggle label={settingsCopy.reminderLabel} checked={reminders} onChange={(v) => void setReminders(v)} />
              </View>
            ) : null}

            <View style={[styles.row, styles.rowTall, styles.rowDiv, { borderTopColor: color.line }]}>
              <View style={styles.rowText}>
                <Text style={[styles.rowLabel, { color: color.ink }]}>{settingsCopy.slowDownLabel}</Text>
                <Text style={[styles.rowNote, { color: color.ink3 }]}>{settingsCopy.slowDownNote}</Text>
              </View>
              <Toggle
                label={settingsCopy.slowDownLabel}
                checked={autoDescent}
                onChange={(v) => {
                  set({ autoDescent: v })
                  setTimeout(() => useSound.getState().syncDescent(new Date(), 0.8), 0)
                }}
              />
            </View>

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

          <GlassSurface variant="card" radius={22} style={styles.card}>
            {(
              [
                [settingsCopy.privacy, settingsCopy.privacyNote, PRIVACY_URL],
                [settingsCopy.support, settingsCopy.supportNote, SUPPORT_URL],
              ] as const
            ).map(([label, note, url], i) => (
              <Pressable
                key={url}
                onPress={() => void Linking.openURL(url)}
                accessibilityRole="link"
                accessibilityLabel={label}
                style={({ pressed }) => [
                  styles.row,
                  i > 0 && [styles.rowDiv, { borderTopColor: color.line }],
                  { opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowLabel, { color: color.ink }]}>{label}</Text>
                  <Text style={[styles.rowNote, { color: color.ink3 }]}>{note}</Text>
                </View>
                <ExternalLink size={16} strokeWidth={1.65} color={color.ink3} />
              </Pressable>
            ))}
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
  title: {
    fontSize: 30,
    fontWeight: '300',
    letterSpacing: -0.7,
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
  /** Rows with a note under the label grow with it instead of overflowing. */
  rowTall: {
    height: undefined,
    minHeight: 54,
    paddingVertical: 12,
    gap: 12,
  },
  rowText: {
    flex: 1,
    flexShrink: 1,
  },
  lightBody: {
    gap: 18,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 16,
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
    marginTop: 2,
  },
  lightSummary: {
    fontSize: 14,
    fontWeight: '500',
  },
  wheelWrap: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
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

/**
 * Light & colour, folded by default. Two sliders (brightness, warmth) whose
 * fill shows what they do, and Adaptive light & colour above them. While
 * adaptive is on the sliders are locked and follow what it's doing now; turning
 * it off leaves them where adaptive had them, so nothing jumps.
 */
function LightAndColour({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const { color } = useTokenColors()
  const adaptive = useSettings((s) => s.adaptiveLight)
  const warmth = useSettings((s) => s.warmth)
  const brightness = useSettings((s) => s.brightness)
  const set = useSettings((s) => s.set)
  const { base } = useNightFilterMetrics()

  const shownWarmth = adaptive ? base.warmth : warmth
  const shownBrightness = adaptive ? brightnessForDim(base.dim) : brightness

  const setAdaptive = (on: boolean) => {
    set(on ? { adaptiveLight: true } : { adaptiveLight: false, warmth: base.warmth, brightness: brightnessForDim(base.dim) })
  }

  return (
    <GlassSurface variant="card" radius={22} style={styles.card}>
      <Pressable
        onPress={() => {
          onToggle()
        }}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={styles.row}
      >
        <Text style={[styles.rowLabel, { color: color.ink }]}>{settingsCopy.lightLabel}</Text>
        <View style={styles.bedRight}>
          <Text style={[styles.lightSummary, { color: adaptive ? color.accent : color.ink2 }]}>
            {adaptive ? settingsCopy.lightAdaptiveSummary : settingsCopy.lightManualSummary}
          </Text>
          {open ? (
            <ChevronUp size={16} strokeWidth={1.65} color={color.ink3} />
          ) : (
            <ChevronDown size={16} strokeWidth={1.65} color={color.ink3} />
          )}
        </View>
      </Pressable>

      {open ? (
        <View style={[styles.lightBody, { borderTopColor: color.line }]}>
          <View style={[styles.row, styles.rowTall, { paddingHorizontal: 0, paddingVertical: 0 }]}>
            <View style={styles.rowText}>
              <Text style={[styles.rowLabel, { color: color.ink }]}>{settingsCopy.adaptiveLabel}</Text>
              <Text style={[styles.rowNote, { color: color.ink3 }]}>{settingsCopy.adaptiveNote}</Text>
            </View>
            <Toggle label={settingsCopy.adaptiveLabel} checked={adaptive} onChange={setAdaptive} />
          </View>
          <PillSlider
            title={settingsCopy.brightness}
            value={shownBrightness}
            onChange={(b) => set({ brightness: b })}
            valueLabel={settingsCopy.brightnessStage}
            disabled={adaptive}
            fillColors={['rgba(255, 255, 255, 0.04)', 'rgba(255, 255, 255, 0.30)']}
            left={<Moon size={16} strokeWidth={1.65} color={color.ink3} />}
            right={<Sun size={17} strokeWidth={1.65} color={color.ink} />}
          />
          <PillSlider
            title={settingsCopy.warmth}
            value={shownWarmth}
            onChange={(w) => set({ warmth: w })}
            valueLabel={settingsCopy.warmthStage}
            disabled={adaptive}
            fillColors={['rgba(150, 185, 255, 0.16)', 'rgba(255, 140, 50, 0.48)']}
            left={<Snowflake size={16} strokeWidth={1.65} color={color.ink3} />}
            right={<Flame size={17} strokeWidth={1.65} color={color.accent} />}
          />
        </View>
      ) : null}
    </GlassSurface>
  )
}
