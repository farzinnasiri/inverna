import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react'
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native'
import { formatHHMM, parseHHMM } from '@/core/night'
import { haptics } from '@/platform'
import { useTokenColors } from '@/ui/hooks/useTokenColors'
import { useSettings } from '@/ui/state/settings'
import { GlassSurface } from './Glass'

const ITEM_H = 46
const VISIBLE_ROWS = 5
const WHEEL_H = ITEM_H * VISIBLE_ROWS
const PAD_V = ITEM_H * 2

const LOOP_CYCLES = 5
const CENTER_CYCLE = 2

const HOURS_12 = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const
const MINUTES_5 = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55] as const
const PERIODS = ['PM', 'AM'] as const

function to12Hour(hhmm: string): { hourIdx: number; minIdx: number; periodIdx: number } {
  const { h, m } = parseHHMM(hhmm)
  const isAm = h < 12
  const h12 = h % 12 === 0 ? 12 : h % 12
  const hourIdx = HOURS_12.indexOf(h12 as (typeof HOURS_12)[number])
  const roundedMin = (Math.round(m / 5) * 5) % 60
  const minIdx = MINUTES_5.indexOf(roundedMin as (typeof MINUTES_5)[number])
  return {
    hourIdx: hourIdx >= 0 ? hourIdx : 11,
    minIdx: minIdx >= 0 ? minIdx : 0,
    periodIdx: isAm ? 1 : 0,
  }
}

function from12Hour(hourIdx: number, minIdx: number, periodIdx: number): string {
  const h12 = HOURS_12[Math.max(0, Math.min(HOURS_12.length - 1, hourIdx))] ?? 11
  const min = MINUTES_5[Math.max(0, Math.min(MINUTES_5.length - 1, minIdx))] ?? 0
  const period = PERIODS[Math.max(0, Math.min(PERIODS.length - 1, periodIdx))] ?? 'PM'
  let h24 = h12 % 12
  if (period === 'PM') h24 += 12
  return formatHHMM(h24, min)
}

function DrumColumn({
  items,
  selectedIndex,
  onSelect,
  width,
  loop = false,
  accessibilityLabel,
}: {
  items: readonly string[]
  selectedIndex: number
  onSelect: (index: number) => void
  width: number
  loop?: boolean
  accessibilityLabel: string
}) {
  const { color } = useTokenColors()
  const hapticsOn = useSettings((s) => s.haptics)
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null)
  const baseLen = items.length

  const displayRows = useMemo(() => {
    if (!loop) return items.map((label, idx) => ({ key: `${idx}`, label, modIdx: idx }))
    const rows: { key: string; label: string; modIdx: number }[] = []
    for (let c = 0; c < LOOP_CYCLES; c++) {
      for (let i = 0; i < baseLen; i++) {
        rows.push({ key: `${c}-${i}`, label: items[i]!, modIdx: i })
      }
    }
    return rows
  }, [items, loop, baseLen])

  const centerRowFor = (modIdx: number) => (loop ? CENTER_CYCLE * baseLen + modIdx : modIdx)

  const [activeRow, setActiveRow] = useState(() => centerRowFor(selectedIndex))
  const lastModIdxRef = useRef(selectedIndex)
  const activeRowRef = useRef(activeRow)
  const draggingRef = useRef(false)
  const mountedRef = useRef(false)

  useEffect(() => {
    lastModIdxRef.current = selectedIndex
    if (!draggingRef.current) {
      const targetRow = centerRowFor(selectedIndex)
      activeRowRef.current = targetRow
      setActiveRow(targetRow)
      // On web initial mount, wait a frame so ScrollView layout is measurable.
      const scroll = () => scrollRef.current?.scrollTo({ y: targetRow * ITEM_H, animated: false })
      if (!mountedRef.current) {
        mountedRef.current = true
        scroll()
        requestAnimationFrame(scroll)
      } else {
        scroll()
      }
    }
  }, [selectedIndex, loop, baseLen])

  const commitOffset = (y: number, recenter: boolean) => {
    const rawRow = Math.round(y / ITEM_H)
    const clampedRow = Math.max(0, Math.min(displayRows.length - 1, rawRow))
    const modIdx = loop ? ((clampedRow % baseLen) + baseLen) % baseLen : clampedRow

    if (clampedRow !== activeRowRef.current) {
      activeRowRef.current = clampedRow
      setActiveRow(clampedRow)
    }

    if (modIdx !== lastModIdxRef.current) {
      lastModIdxRef.current = modIdx
      if (hapticsOn) haptics.play('light')
      onSelect(modIdx)
    }

    if (recenter && loop && (clampedRow < baseLen * 2 || clampedRow >= baseLen * (LOOP_CYCLES - 2))) {
      const centered = centerRowFor(modIdx)
      activeRowRef.current = centered
      setActiveRow(centered)
      scrollRef.current?.scrollTo({ y: centered * ITEM_H, animated: false })
    }
  }

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (Platform.OS === 'web') return
    commitOffset(e.nativeEvent.contentOffset.y, false)
  }

  const handleMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    draggingRef.current = false
    commitOffset(e.nativeEvent.contentOffset.y, true)
  }

  return (
    <View style={[styles.colWrap, { width }]} accessibilityLabel={accessibilityLabel}>
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_H}
        decelerationRate="fast"
        bounces={!loop}
        nestedScrollEnabled
        contentOffset={{ x: 0, y: centerRowFor(selectedIndex) * ITEM_H }}
        contentContainerStyle={{ paddingVertical: PAD_V }}
        onScrollBeginDrag={() => {
          draggingRef.current = true
        }}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        onMomentumScrollEnd={handleMomentumEnd}
        onScrollEndDrag={(e) => {
          if (Platform.OS === 'web') {
            draggingRef.current = false
            commitOffset(e.nativeEvent.contentOffset.y, true)
          }
        }}
      >
        {displayRows.map((row, rowIdx) => {
          const dist = Math.abs(rowIdx - activeRow)
          const active = dist === 0
          return (
            <Pressable
              key={row.key}
              onPress={() => {
                draggingRef.current = false
                activeRowRef.current = rowIdx
                setActiveRow(rowIdx)
                scrollRef.current?.scrollTo({ y: rowIdx * ITEM_H, animated: true })
                if (row.modIdx !== lastModIdxRef.current) {
                  lastModIdxRef.current = row.modIdx
                  if (hapticsOn) haptics.play('light')
                  onSelect(row.modIdx)
                }
              }}
              style={styles.itemRow}
            >
              <Text
                style={[
                  styles.itemText,
                  {
                    color: active ? color.ink : color.ink3,
                    opacity: active ? 1 : dist === 1 ? 0.52 : 0.22,
                    fontWeight: active ? '500' : '300',
                    transform: [{ scale: active ? 1 : dist === 1 ? 0.88 : 0.78 }],
                  },
                ]}
              >
                {row.label}
              </Text>
            </Pressable>
          )
        })}
      </ScrollView>
    </View>
  )
}

/**
 * Tactile iOS-style circular scroll-snap drum wheel for bedtime selection.
 * Hours (12, 1..11) and minutes (00..55) loop continuously in both directions;
 * shared across Onboarding and NightSheet for 100% consistent feel.
 */
export function BedtimeWheel({
  value,
  onChange,
  compact,
}: {
  value: string
  onChange: (hhmm: string) => void
  compact?: boolean
}) {
  const { color } = useTokenColors()
  const { hourIdx, minIdx, periodIdx } = to12Hour(value)

  const hourLabels = useMemo(() => HOURS_12.map((h) => String(h)), [])
  const minLabels = useMemo(() => MINUTES_5.map((m) => String(m).padStart(2, '0')), [])

  const wheelHeight = compact ? ITEM_H * 3 : WHEEL_H

  return (
    <GlassSurface variant="card" radius={24} style={[styles.shell, { height: wheelHeight }]}>
      {/* Center Liquid Glass selection lens */}
      <View
        pointerEvents="none"
        style={[
          styles.lens,
          {
            top: (wheelHeight - ITEM_H) / 2,
            backgroundColor: 'rgba(255, 255, 255, 0.08)',
            borderColor: 'rgba(255, 255, 255, 0.16)',
            borderCurve: 'continuous',
          },
        ]}
      />

      <View style={styles.drums}>
        <DrumColumn
          items={hourLabels}
          selectedIndex={hourIdx}
          width={76}
          loop
          accessibilityLabel="Bedtime hour"
          onSelect={(nextH) => onChange(from12Hour(nextH, minIdx, periodIdx))}
        />
        <Text style={[styles.colon, { color: color.accent }]}>:</Text>
        <DrumColumn
          items={minLabels}
          selectedIndex={minIdx}
          width={76}
          loop
          accessibilityLabel="Bedtime minute"
          onSelect={(nextM) => onChange(from12Hour(hourIdx, nextM, periodIdx))}
        />
        <DrumColumn
          items={PERIODS}
          selectedIndex={periodIdx}
          width={70}
          accessibilityLabel="AM or PM"
          onSelect={(nextP) => onChange(from12Hour(hourIdx, minIdx, nextP))}
        />
      </View>
    </GlassSurface>
  )
}

const styles = StyleSheet.create({
  shell: {
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  lens: {
    position: 'absolute',
    left: 12,
    right: 12,
    height: ITEM_H,
    borderRadius: 14,
    borderWidth: 1,
  },
  drums: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: WHEEL_H,
  },
  colWrap: {
    height: WHEEL_H,
  },
  itemRow: {
    height: ITEM_H,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemText: {
    fontSize: 28,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.6,
  },
  colon: {
    fontSize: 26,
    fontWeight: '400',
    marginHorizontal: 2,
    marginBottom: 3,
  },
})
