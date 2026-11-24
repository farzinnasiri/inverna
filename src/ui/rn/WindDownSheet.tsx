import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { Play, Volume2, VolumeX } from 'lucide-react-native'
import { gameMeta, type GameId } from '@/core/games/catalog'
import { PRESETS } from '@/core/sound/catalog'
import { haptics } from '@/platform'
import { useTokenColors } from '@/ui/hooks/useTokenColors'
import { useNav } from '@/ui/state/nav'
import { useSession } from '@/ui/state/session'
import { useSettings } from '@/ui/state/settings'
import { useSound } from '@/ui/state/sound'
import { Button, Segmented, Sheet } from './controls'
import { GlassSurface } from './Glass'

const DURATIONS = [
  { value: 10, label: '10m' },
  { value: 15, label: '15m' },
  { value: 20, label: '20m' },
  { value: 30, label: '30m' },
] as const

/**
 * Unified Wind Down ritual sheet.
 * Connects Soundscapes + Timer + Dimming + Calm Game off-ramp into one coherent ritual:
 * if a sound is already playing, it carries seamlessly; tapping "Start & play" begins
 * the fade timer, audio, and launches your recommended or resumed game in one tap.
 */
export function WindDownSheet() {
  const router = useRouter()
  const { color } = useTokenColors()
  const open = useNav((s) => s.windDownOpen)
  const setOpen = useNav((s) => s.setWindDownOpen)

  const minutes = useSettings((s) => s.sessionMinutes)
  const savedPresetId = useSettings((s) => s.sessionPreset)
  const lastGame = useSettings((s) => s.lastGame)
  const tonightIntent = useSettings((s) => s.tonightIntent)
  const hapticsOn = useSettings((s) => s.haptics)
  const set = useSettings((s) => s.set)

  const startSession = useSession((s) => s.start)
  const soundPlaying = useSound((s) => s.playing)
  const activeSoundPreset = useSound((s) => s.presetId)
  const playPreset = useSound((s) => s.playPreset)
  const stopSound = useSound((s) => s.stop)
  const setSoundTimer = useSound((s) => s.setTimer)

  const selectedPreset = soundPlaying && activeSoundPreset ? activeSoundPreset : savedPresetId

  const recommendedGameId: GameId =
    lastGame ??
    (tonightIntent === 'focus'
      ? 'nine'
      : tonightIntent === 'light'
        ? 'settle'
        : 'pond')
  const targetGame = gameMeta(recommendedGameId)

  const selectSound = (id: string | null) => {
    if (hapticsOn) haptics.play('light')
    set({ sessionPreset: id })
    if (soundPlaying) {
      if (id) playPreset(id, minutes)
      else stopSound(0.6)
    }
  }

  const startRitual = (openGame: boolean) => {
    if (hapticsOn) haptics.play('medium')
    startSession(minutes, selectedPreset)
    if (selectedPreset) {
      if (soundPlaying && activeSoundPreset === selectedPreset) {
        setSoundTimer(minutes)
      } else {
        playPreset(selectedPreset, minutes)
      }
    } else if (soundPlaying) {
      stopSound(0.8)
    }
    setOpen(false)
    if (openGame) {
      set({ lastGame: recommendedGameId })
      router.push(`/game/${recommendedGameId}`)
    }
  }

  return (
    <Sheet open={open} onClose={() => setOpen(false)} label="Wind down">
      <View style={styles.body}>
        <View style={styles.head}>
          <Text style={[styles.title, { color: color.ink }]}>Wind down</Text>
          <Text style={[styles.sub, { color: color.ink2 }]}>
            Gently dims light, slows pace, and fades your soundscape to silence at the end.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={[styles.label, { color: color.ink3 }]}>Duration</Text>
          <Segmented
            label="Wind down duration"
            options={DURATIONS}
            value={minutes}
            onChange={(v) => set({ sessionMinutes: v })}
          />
        </View>

        <View style={styles.section}>
          <Text style={[styles.label, { color: color.ink3 }]}>Soundscape</Text>
          <View style={styles.soundGrid}>
            {[
              { id: null as string | null, name: 'Silence' },
              ...PRESETS.map((p) => ({ id: p.id as string | null, name: p.name })),
            ].map((opt) => {
              const active = selectedPreset === opt.id
              return (
                <Pressable
                  key={opt.id ?? 'silence'}
                  onPress={() => selectSound(opt.id)}
                  style={styles.soundChipWrap}
                >
                  <GlassSurface variant="pill" radius={14} accent={active} interactive style={styles.soundChip}>
                    {opt.id === null ? (
                      <VolumeX size={13} strokeWidth={1.65} color={active ? color.accent : color.ink3} />
                    ) : (
                      <Volume2 size={13} strokeWidth={1.65} color={active ? color.accent : color.ink3} />
                    )}
                    <Text
                      numberOfLines={1}
                      style={[styles.soundChipText, { color: active ? color.accent : color.ink2 }]}
                    >
                      {opt.name}
                    </Text>
                  </GlassSurface>
                </Pressable>
              )
            })}
          </View>
        </View>

        <View style={styles.actions}>
          <Button variant="primary" block onPress={() => startRitual(true)}>
            <Play size={15} strokeWidth={2} color={color.accentInk} />
            <Text style={[styles.primaryText, { color: color.accentInk }]}>
              Start &amp; play {targetGame.name}
            </Text>
          </Button>
          <Button variant="quiet" size="sm" block onPress={() => startRitual(false)}>
            Start timer &amp; browse games
          </Button>
        </View>
      </View>
    </Sheet>
  )
}

const styles = StyleSheet.create({
  body: {
    gap: 16,
  },
  head: {
    gap: 4,
  },
  title: {
    fontSize: 22,
    fontWeight: '600',
    letterSpacing: -0.35,
  },
  sub: {
    fontSize: 13.5,
    lineHeight: 19,
  },
  section: {
    gap: 8,
  },
  label: {
    fontSize: 12.5,
    fontWeight: '500',
  },
  soundGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  soundChipWrap: {
    width: '31%',
    flexGrow: 1,
  },
  soundChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 40,
    paddingHorizontal: 8,
  },
  soundChipText: {
    fontSize: 13,
    fontWeight: '500',
  },
  actions: {
    gap: 8,
    marginTop: 4,
  },
  primaryText: {
    fontSize: 15.5,
    fontWeight: '600',
  },
})
