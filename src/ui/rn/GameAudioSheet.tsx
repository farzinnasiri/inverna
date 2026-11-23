import { Pressable, StyleSheet, Text, View } from 'react-native'
import { PRESETS } from '@/core/sound/catalog'
import { sound } from '@/platform'
import { useTokenColors } from '@/ui/hooks/useTokenColors'
import { useSettings } from '@/ui/state/settings'
import { useSound } from '@/ui/state/sound'
import { Sheet, Slider, Toggle } from './controls'

export function GameAudioSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { color } = useTokenColors()
  const playing = useSound((s) => s.playing)
  const presetId = useSound((s) => s.presetId)
  const volume = useSound((s) => s.volume)
  const playPreset = useSound((s) => s.playPreset)
  const setVolume = useSound((s) => s.setVolume)
  const stop = useSound((s) => s.stop)

  const sessionPreset = useSettings((s) => s.sessionPreset)
  const sleepTimer = useSettings((s) => s.sleepTimer)
  const sfx = useSettings((s) => s.sfx)
  const haptics = useSettings((s) => s.haptics)
  const set = useSettings((s) => s.set)

  const toggleAmbient = (on: boolean) => {
    if (on) playPreset(presetId ?? sessionPreset ?? 'rainfall', sleepTimer)
    else stop(0.8)
  }

  return (
    <Sheet open={open} onClose={onClose} label="Sound">
      <Text style={[styles.title, { color: color.ink }]}>Sound</Text>

      <View style={[styles.row, { borderBottomColor: color.line }]}>
        <Text style={[styles.rowLabel, { color: color.ink }]}>Ambient</Text>
        <Toggle checked={playing} onChange={toggleAmbient} label="Ambient sound" />
      </View>

      <View style={styles.volBlock}>
        <View style={styles.volHead}>
          <Text style={[styles.caption, { color: color.ink3 }]}>Volume</Text>
          <Text style={[styles.caption, styles.num, { color: color.ink3 }]}>{Math.round(volume * 100)}%</Text>
        </View>
        <Slider value={volume} onChange={setVolume} label="Ambient volume" dimmed={!playing} />
      </View>

      <View style={styles.chips}>
        {PRESETS.map((p) => {
          const active = playing && presetId === p.id
          return (
            <Pressable
              key={p.id}
              onPress={() => (active ? stop(0.8) : playPreset(p.id, sleepTimer))}
              style={[
                styles.chip,
                {
                  backgroundColor: active ? color.surface3 : color.surface2,
                  borderColor: active ? color.accentDim : color.line,
                },
              ]}
            >
              <Text style={[styles.chipText, { color: active ? color.ink : color.ink2 }]}>{p.name}</Text>
            </Pressable>
          )
        })}
      </View>

      <View style={[styles.row, { borderBottomColor: color.line }]}>
        <Text style={[styles.rowLabel, { color: color.ink }]}>Game cues</Text>
        <Toggle
          checked={sfx}
          onChange={(v) => {
            set({ sfx: v })
            sound.setCuesEnabled(v)
          }}
          label="Game cues"
        />
      </View>

      <View style={styles.rowLast}>
        <Text style={[styles.rowLabel, { color: color.ink }]}>Haptics</Text>
        <Toggle checked={haptics} onChange={(v) => set({ haptics: v })} label="Haptics" />
      </View>
    </Sheet>
  )
}

const styles = StyleSheet.create({
  title: {
    fontSize: 22,
    fontWeight: '600',
    letterSpacing: -0.3,
    marginBottom: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 52,
    borderBottomWidth: 1,
  },
  rowLast: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 52,
  },
  rowLabel: {
    fontSize: 16,
    fontWeight: '500',
  },
  volBlock: {
    paddingVertical: 10,
    gap: 4,
  },
  volHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  caption: {
    fontSize: 13,
    fontWeight: '500',
  },
  num: {
    fontVariant: ['tabular-nums'],
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
    marginBottom: 12,
  },
  chip: {
    height: 36,
    paddingHorizontal: 13,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: {
    fontSize: 13.5,
    fontWeight: '500',
  },
})
