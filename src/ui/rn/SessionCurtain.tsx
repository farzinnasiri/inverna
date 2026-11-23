import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { sessionDone, sessionLevels } from '@/core/session'
import { sound } from '@/platform'
import { useTokenColors } from '@/ui/hooks/useTokenColors'
import { useSession } from '@/ui/state/session'
import { useSound } from '@/ui/state/sound'

/**
 * Drives wind-down session fade-to-black and ambient sleep timer auto-stop.
 * No celebratory victory screen — just quiet rest.
 */
export function SessionCurtain() {
  const { color } = useTokenColors()
  const session = useSession((s) => s.session)
  const ended = useSession((s) => s.ended)
  const finish = useSession((s) => s.finish)
  const dismiss = useSession((s) => s.dismiss)

  const stopAt = useSound((s) => s.stopAt)
  const playing = useSound((s) => s.playing)
  const stopSound = useSound((s) => s.stop)

  const [curtainOpacity, setCurtainOpacity] = useState(0)

  useEffect(() => {
    const tick = () => {
      const now = Date.now()

      // Ambient sleep timer check
      if (playing && stopAt && now >= stopAt) {
        stopSound(4)
      }

      // Wind-down session progression
      if (!session) {
        setCurtainOpacity(0)
        return
      }
      const lvl = sessionLevels(session, now)
      setCurtainOpacity(lvl.fade)
      if (playing) {
        const vol = useSound.getState().volume
        sound.setMaster(vol * lvl.volume, 0.8)
      }
      if (sessionDone(session, now) && !ended) {
        finish()
        stopSound(3)
      }
    }

    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [session, ended, finish, playing, stopAt, stopSound])

  if (!ended && curtainOpacity <= 0.01) return null

  return (
    <Pressable
      pointerEvents={ended ? 'auto' : 'none'}
      onPress={ended ? dismiss : undefined}
      style={[
        StyleSheet.absoluteFill,
        styles.curtain,
        { opacity: ended ? 1 : curtainOpacity },
      ]}
    >
      {ended && (
        <View style={styles.restWrap}>
          <Text style={[styles.restTitle, { color: color.ink2 }]}>Goodnight</Text>
          <Text style={[styles.restHint, { color: color.ink4 }]}>Tap anywhere to wake</Text>
        </View>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  curtain: {
    backgroundColor: '#000000',
    zIndex: 95,
    alignItems: 'center',
    justifyContent: 'center',
  },
  restWrap: {
    alignItems: 'center',
    gap: 10,
  },
  restTitle: {
    fontSize: 24,
    fontWeight: '300',
    letterSpacing: -0.4,
  },
  restHint: {
    fontSize: 13,
  },
})
