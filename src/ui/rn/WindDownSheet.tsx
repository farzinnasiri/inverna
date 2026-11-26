import { StyleSheet, Text, View } from 'react-native'
import { formatBedtime12h, formatHHMM, nightKey } from '@/core/night'
import { feel } from '@/ui/feel'
import { useTokenColors } from '@/ui/hooks/useTokenColors'
import { useNav } from '@/ui/state/nav'
import { useSession } from '@/ui/state/session'
import { useSettings } from '@/ui/state/settings'
import { useSound } from '@/ui/state/sound'
import { Button, Segmented, Sheet } from './controls'

const DURATIONS = [
  { value: 15, label: '15 min' },
  { value: 30, label: '30 min' },
  { value: 45, label: '45 min' },
  { value: 60, label: '1 hour' },
] as const

/**
 * Wind down now: one question, how long. Starting moves tonight's bedtime to
 * now + that long, so the light, the games, the sound and the timeline on Play
 * all head for the same lights out. Sound is chosen on Play, not here.
 */
export function WindDownSheet() {
  const { color } = useTokenColors()
  const open = useNav((s) => s.windDownOpen)
  const setOpen = useNav((s) => s.setWindDownOpen)

  const minutes = useSettings((s) => s.sessionMinutes)
  const set = useSettings((s) => s.set)
  const startSession = useSession((s) => s.start)

  const lightsOut = new Date(Date.now() + minutes * 60_000)
  const lightsOutHHMM = formatHHMM(lightsOut.getHours(), lightsOut.getMinutes())

  const start = () => {
    feel('commit')
    const now = new Date()
    const end = new Date(now.getTime() + minutes * 60_000)
    set({ tonightBedtime: { night: nightKey(now), bedtime: formatHHMM(end.getHours(), end.getMinutes()) } })
    // A sound already playing now fades out by this lights out (the sound store follows the session).
    startSession(minutes, useSound.getState().presetId)
    setOpen(false)
  }

  return (
    <Sheet open={open} onClose={() => setOpen(false)} label="Wind down">
      <Text style={[styles.kicker, { color: color.ink3 }]}>Wind down</Text>
      <Text style={[styles.title, { color: color.ink }]}>How long do you want to wind down?</Text>
      <Text style={[styles.sub, { color: color.ink2 }]}>
        The screen warms and dims, games slow down, and your sound fades out gently.
      </Text>

      <View style={styles.section}>
        <Segmented
          label="Wind down length"
          options={DURATIONS}
          value={minutes}
          onChange={(v) => {
            feel('tick')
            set({ sessionMinutes: v })
          }}
        />
        <Text style={[styles.when, { color: color.ink3 }]}>
          Bedtime at <Text style={{ color: color.accent }}>{formatBedtime12h(lightsOutHHMM)}</Text>
        </Text>
      </View>

      <View style={styles.actions}>
        <Button variant="primary" block onPress={start}>
          Start winding down
        </Button>
      </View>
    </Sheet>
  )
}

const styles = StyleSheet.create({
  kicker: {
    fontSize: 11.5,
    fontWeight: '600',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 26,
    fontWeight: '600',
    letterSpacing: -0.5,
    marginTop: 2,
  },
  sub: {
    fontSize: 15,
    lineHeight: 21,
    marginTop: 8,
  },
  section: {
    marginTop: 20,
    gap: 10,
  },
  when: {
    fontSize: 13.5,
    textAlign: 'center',
  },
  actions: {
    marginTop: 20,
    gap: 8,
  },
})
