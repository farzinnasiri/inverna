import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import {
  formatBedtime12h,
  formatRange,
  rangeMinutesOf,
  minutesUntilBedtime,
  nightKey,
  overrideActive,
  RIBBON_SPAN_MIN,
  ribbonBedtime,
  ribbonEarliest,
  ribbonOffset,
  type Schedule,
} from '@/core/night'
import { haptics } from '@/platform'
import { useTokenColors } from '@/ui/hooks/useTokenColors'
import { useSettings } from '@/ui/state/settings'
import { Button, Segmented, Sheet } from './controls'
import { NightRibbon } from './NightRibbon'

type Scope = 'tonight' | 'always'

function untilText(mins: number | null): string {
  if (mins === null) return ''
  if (mins < 60) return `in ${Math.max(1, mins)} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m === 0 ? `in ${h}h` : `in ${h}h ${String(m).padStart(2, '0')}m`
}

/**
 * Tap the time on Play to move bedtime, for tonight or for good.
 *
 * The night ribbon runs 8 PM to 3 AM with midnight marked. Drag the moon; the
 * brass span shows the evening left between now and bedtime. Snaps to 15
 * minutes with a soft tick, never earlier than the next free slot.
 */
export function TonightSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { color } = useTokenColors()
  const schedule = useSettings((s) => s.schedule)
  const tonight = useSettings((s) => s.tonightBedtime)
  const hapticsOn = useSettings((s) => s.haptics)
  const set = useSettings((s) => s.set)
  const setSchedule = useSettings((s) => s.setSchedule)

  const [now, setNow] = useState(() => new Date())
  const active = overrideActive(tonight, now)
  const current = active ? tonight.bedtime : schedule.bedtime
  const earliest = ribbonEarliest(now)
  // Tonight keeps the usual range's length; the block slides as a whole.
  const range = rangeMinutesOf(schedule)
  const maxOffset = RIBBON_SPAN_MIN - range

  const startOffset = () => Math.max(earliest, Math.min(maxOffset, ribbonOffset(current)))
  const [offset, setOffset] = useState(startOffset)
  const [scope, setScope] = useState<Scope>('tonight')

  // Fresh values every time the sheet opens.
  useEffect(() => {
    if (!open) return
    const n = new Date()
    setNow(n)
    const e = ribbonEarliest(n)
    const on = overrideActive(tonight, n)
    setOffset(Math.max(e, Math.min(maxOffset, ribbonOffset(on ? tonight.bedtime : schedule.bedtime))))
    setScope('tonight')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const bedtime = ribbonBedtime(offset)
  const preview: Schedule = { ...schedule, enabled: true, bedtime, days: [0, 1, 2, 3, 4, 5, 6] }
  const until = untilText(minutesUntilBedtime(preview, now))
  const nowOffset = ribbonOffset(`${now.getHours()}:${now.getMinutes()}`)
  const nowOnRibbon = nowOffset >= 0 && nowOffset <= RIBBON_SPAN_MIN

  const nudge = (mins: number) => {
    const next = Math.max(earliest, Math.min(maxOffset, offset + mins))
    if (next === offset) return
    if (hapticsOn) haptics.play('selection')
    setOffset(next)
  }

  const commit = () => {
    if (hapticsOn) haptics.play('light')
    if (scope === 'always') {
      setSchedule({ bedtime, enabled: true })
      set({ tonightBedtime: null })
    } else {
      set({ tonightBedtime: { night: nightKey(new Date()), bedtime } })
    }
    onClose()
  }

  const backToUsual = () => {
    if (hapticsOn) haptics.play('light')
    set({ tonightBedtime: null })
    onClose()
  }

  const changed = bedtime !== current

  return (
    <Sheet open={open} onClose={onClose} label="Tonight's bedtime">
      <View style={styles.head}>
        <Text style={[styles.kicker, { color: color.ink3 }]}>Tonight</Text>
        <Text style={[styles.usual, { color: color.ink3 }]}>Usually {formatRange(schedule)}</Text>
      </View>

      <Text style={[styles.time, { color: color.ink }]} accessibilityLiveRegion="polite">
        {formatBedtime12h(bedtime)}
      </Text>
      <Text style={[styles.until, { color: color.ink2 }]}>
        {until}
      </Text>

      <NightRibbon
        offset={offset}
        rangeMinutes={range}
        earliest={earliest}
        nowAt={nowOnRibbon ? nowOffset : null}
        spanFrom={nowOnRibbon ? nowOffset : 0}
        onChange={(next) => {
          if (hapticsOn) haptics.play('selection')
          setOffset(next)
        }}
      />

      <View style={styles.nudges}>
        {[-15, 15, 30, 60].map((m) => (
          <Pressable
            key={m}
            onPress={() => nudge(m)}
            accessibilityRole="button"
            accessibilityLabel={`${m > 0 ? 'Later' : 'Earlier'} by ${Math.abs(m)} minutes`}
            style={({ pressed }) => [
              styles.nudge,
              { borderColor: color.line, backgroundColor: color.surface2, opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <Text style={[styles.nudgeText, { color: color.ink2 }]}>
              {m > 0 ? '+' : '−'}
              {Math.abs(m) === 60 ? '1h' : `${Math.abs(m)}m`}
            </Text>
          </Pressable>
        ))}
      </View>

      <Segmented
        label="Apply to"
        options={[
          { value: 'tonight' as Scope, label: 'Tonight only' },
          { value: 'always' as Scope, label: 'Every night' },
        ]}
        value={scope}
        onChange={setScope}
      />

      <View style={styles.actions}>
        <Button variant="primary" block onPress={commit} disabled={!changed && scope === 'tonight' && active}>
          {scope === 'tonight' ? `Use ${formatBedtime12h(bedtime)} tonight` : `Use ${formatBedtime12h(bedtime)} every night`}
        </Button>
        {active ? (
          <Button variant="ghost" size="sm" block onPress={backToUsual}>
            Reset to {formatBedtime12h(schedule.bedtime)}
          </Button>
        ) : null}
      </View>
    </Sheet>
  )
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  kicker: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  usual: {
    fontSize: 12.5,
  },
  time: {
    fontSize: 44,
    fontWeight: '200',
    letterSpacing: -1.2,
    marginTop: 6,
    fontVariant: ['tabular-nums'],
  },
  until: {
    fontSize: 14,
    marginTop: 2,
  },
  nudges: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
    marginBottom: 14,
  },
  nudge: {
    flex: 1,
    height: 36,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nudgeText: {
    fontSize: 13.5,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  actions: {
    gap: 8,
    marginTop: 16,
  },
})
