import type { ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Infinity as InfinityIcon, Moon } from 'lucide-react-native'
import { feel } from '@/ui/feel'
import { useTokenColors } from '@/ui/hooks/useTokenColors'
import { soundTimer as copy } from '@/ui/copy'
import { UNTIL_LIGHTS_OUT } from '@/ui/state/sound'
import { Sheet } from './controls'
import { GlassSurface } from './Glass'

const MINUTES = [15, 30, 45, 60] as const

/**
 * When the sound fades out, as tiles you can take in at a glance: the end of
 * your sleep time (with its clock time) on top, four lengths in a row, all
 * night at the bottom. Picking one closes the sheet.
 */
export function TimerSheet({
  open,
  onClose,
  value,
  endClock,
  fadingAt,
  onSelect,
}: {
  open: boolean
  onClose: () => void
  /** The timer choice: UNTIL_LIGHTS_OUT, minutes, or 0 for all night. */
  value: number
  /** Clock time of the end of tonight's sleep time, "1:15 AM". */
  endClock: string
  /** When the playing sound will fade, if it's playing with a timer. */
  fadingAt: string | null
  onSelect: (choice: number) => void
}) {
  const { color } = useTokenColors()
  const pick = (choice: number) => {
    feel('tick')
    onSelect(choice)
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} label={copy.title}>
      <Text style={[styles.title, { color: color.ink }]}>{copy.title}</Text>
      <Text style={[styles.sub, { color: color.ink3 }]}>{fadingAt ? copy.fadingAt(fadingAt) : copy.sub}</Text>

      <View style={styles.grid}>
        <Tile selected={value === UNTIL_LIGHTS_OUT} onPress={() => pick(UNTIL_LIGHTS_OUT)} label={copy.untilEnd(endClock)} wide>
          <Moon size={18} strokeWidth={1.7} color={value === UNTIL_LIGHTS_OUT ? color.accent : color.ink2} />
          <View style={styles.wideText}>
            <Text style={[styles.big, { color: value === UNTIL_LIGHTS_OUT ? color.accent : color.ink }]}>{endClock}</Text>
            <Text style={[styles.small, { color: color.ink3 }]}>{copy.endOfSleep}</Text>
          </View>
        </Tile>

        <View style={styles.row}>
          {MINUTES.map((m) => (
            <Tile key={m} selected={value === m} onPress={() => pick(m)} label={copy.after(m)}>
              <Text style={[styles.big, { color: value === m ? color.accent : color.ink }]}>{m === 60 ? '1' : m}</Text>
              <Text style={[styles.small, { color: color.ink3 }]}>{m === 60 ? copy.hour : copy.min}</Text>
            </Tile>
          ))}
        </View>

        <Tile selected={value === 0} onPress={() => pick(0)} label={copy.allNight} wide>
          <InfinityIcon size={18} strokeWidth={1.7} color={value === 0 ? color.accent : color.ink2} />
          <View style={styles.wideText}>
            <Text style={[styles.mid, { color: value === 0 ? color.accent : color.ink }]}>{copy.allNightShort}</Text>
            <Text style={[styles.small, { color: color.ink3 }]}>{copy.allNightNote}</Text>
          </View>
        </Tile>
      </View>
    </Sheet>
  )
}

function Tile({
  selected,
  onPress,
  label,
  wide = false,
  children,
}: {
  selected: boolean
  onPress: () => void
  label: string
  wide?: boolean
  children: ReactNode
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={label}
      style={({ pressed }) => [wide ? styles.wideCell : styles.cell, { transform: [{ scale: pressed ? 0.97 : 1 }] }]}
    >
      <GlassSurface variant="card" radius={18} accent={selected} interactive style={wide ? styles.wideTile : styles.tile}>
        {children}
      </GlassSurface>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  title: {
    fontSize: 24,
    fontWeight: '600',
    letterSpacing: -0.4,
  },
  sub: {
    fontSize: 14,
    marginTop: 4,
    marginBottom: 16,
  },
  grid: {
    gap: 10,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  cell: {
    flex: 1,
  },
  wideCell: {
    width: '100%',
  },
  tile: {
    height: 78,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  wideTile: {
    height: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 18,
  },
  wideText: {
    gap: 1,
  },
  big: {
    fontSize: 24,
    fontWeight: '300',
    letterSpacing: -0.6,
    fontVariant: ['tabular-nums'],
  },
  mid: {
    fontSize: 18,
    fontWeight: '500',
  },
  small: {
    fontSize: 12.5,
    fontWeight: '500',
  },
})
