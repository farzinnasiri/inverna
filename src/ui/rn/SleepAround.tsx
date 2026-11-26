import { StyleSheet, Text, View } from 'react-native'
import { formatRange, giveOrTakeOf, GIVE_OR_TAKE_MIN, rangeAround, rangeCentre, type Schedule } from '@/core/night'
import { useTokenColors } from '@/ui/hooks/useTokenColors'
import { sleepAround as copy } from '@/ui/copy'
import { Segmented } from './controls'
import { TimeWheel } from './TimeWheel'

const GIVE_OR_TAKE_OPTIONS = GIVE_OR_TAKE_MIN.map((g) => ({ value: g, label: copy.giveOrTakeLabel(g) }))

/**
 * When they usually fall asleep, asked the way people say it: "around 11:45,
 * give or take half an hour". The time is a wheel, any time of day (late
 * shifts fit too). It writes the same range the rest of the app uses (see
 * `rangeAround`).
 *
 * `showSummary` spells the range out underneath; leave it off where the range
 * is already shown just above (Settings).
 */
export function SleepAround({
  schedule,
  onChange,
  compact = false,
  showSummary = true,
}: {
  schedule: Schedule
  onChange: (patch: Pick<Schedule, 'bedtime' | 'rangeMinutes'>) => void
  compact?: boolean
  showSummary?: boolean
}) {
  const { color } = useTokenColors()
  const centre = rangeCentre(schedule)
  const giveOrTake = giveOrTakeOf(schedule)

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: color.ink3 }]}>{copy.around}</Text>
      <TimeWheel compact={compact} value={centre} onChange={(hhmm) => onChange(rangeAround(hhmm, giveOrTake))} />

      <View style={styles.giveOrTake}>
        <Text style={[styles.label, { color: color.ink3 }]}>{copy.giveOrTake}</Text>
        <Segmented
          label={copy.giveOrTake}
          options={GIVE_OR_TAKE_OPTIONS}
          value={giveOrTake}
          onChange={(g) => onChange(rangeAround(centre, g))}
        />
      </View>
      {showSummary ? (
        <Text style={[styles.summary, { color: color.ink3 }]} accessibilityLiveRegion="polite">
          {copy.summary(formatRange(schedule))}
        </Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
  },
  giveOrTake: {
    gap: 8,
    marginTop: 10,
  },
  summary: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
    fontVariant: ['tabular-nums'],
  },
})
