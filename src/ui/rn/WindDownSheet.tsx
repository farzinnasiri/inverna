import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { ChevronRight } from 'lucide-react-native'
import { PRESETS, presetById } from '@/core/sound/catalog'
import { useTokenColors } from '@/ui/hooks/useTokenColors'
import { useNav } from '@/ui/state/nav'
import { useSession } from '@/ui/state/session'
import { useSettings } from '@/ui/state/settings'
import { useSound } from '@/ui/state/sound'
import { Button, PopoverMenu, Segmented, Sheet } from './controls'

const DURATIONS = [
  { value: 10, label: '10m' },
  { value: 15, label: '15m' },
  { value: 20, label: '20m' },
  { value: 30, label: '30m' },
] as const

export function WindDownSheet() {
  const { color } = useTokenColors()
  const open = useNav((s) => s.windDownOpen)
  const setOpen = useNav((s) => s.setWindDownOpen)

  const minutes = useSettings((s) => s.sessionMinutes)
  const presetId = useSettings((s) => s.sessionPreset)
  const set = useSettings((s) => s.set)
  const startSession = useSession((s) => s.start)
  const playPreset = useSound((s) => s.playPreset)

  const [soundMenuOpen, setSoundMenuOpen] = useState(false)

  const soundOptions = [
    { value: null as string | null, label: 'Silence' },
    ...PRESETS.map((p) => ({ value: p.id as string | null, label: p.name })),
  ]

  const currentSoundName = presetId ? (presetById(presetId)?.name ?? 'Silence') : 'Silence'

  const begin = () => {
    startSession(minutes, presetId)
    if (presetId) {
      playPreset(presetId, minutes)
    }
    setOpen(false)
  }

  return (
    <>
      <Sheet open={open} onClose={() => setOpen(false)} label="Wind down">
        <View style={styles.body}>
          <Text style={[styles.title, { color: color.ink }]}>Wind down</Text>

          <View style={styles.section}>
            <Text style={[styles.label, { color: color.ink3 }]}>Duration</Text>
            <Segmented
              label="Wind down duration"
              options={DURATIONS}
              value={minutes}
              onChange={(v) => set({ sessionMinutes: v })}
            />
          </View>

          <Pressable
            onPress={() => setSoundMenuOpen(true)}
            style={[styles.soundRow, { backgroundColor: color.surface2, borderColor: color.line }]}
          >
            <Text style={[styles.soundLabel, { color: color.ink }]}>Sound</Text>
            <View style={styles.soundRight}>
              <Text style={[styles.soundVal, { color: color.ink2 }]}>{currentSoundName}</Text>
              <ChevronRight size={17} strokeWidth={1.5} color={color.ink3} />
            </View>
          </Pressable>

          <Button variant="primary" block onPress={begin} style={{ marginTop: 6 }}>
            Start
          </Button>
        </View>
      </Sheet>

      <PopoverMenu
        open={soundMenuOpen}
        onClose={() => setSoundMenuOpen(false)}
        label="Session sound"
        options={soundOptions}
        value={presetId}
        onSelect={(v) => set({ sessionPreset: v })}
      />
    </>
  )
}

const styles = StyleSheet.create({
  body: {
    gap: 16,
  },
  title: {
    fontSize: 21,
    fontWeight: '600',
    letterSpacing: -0.3,
  },
  section: {
    gap: 8,
  },
  label: {
    fontSize: 12.5,
    fontWeight: '500',
  },
  soundRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 52,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  soundLabel: {
    fontSize: 15.5,
    fontWeight: '500',
  },
  soundRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  soundVal: {
    fontSize: 15,
  },
})
