import { useEffect, useState } from 'react'
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native'
import { formatBedtime12h, formatHHMM, nightKey } from '@/core/night'
import { sessionDone, sessionEnd, sessionLevels } from '@/core/session'
import { sound } from '@/platform'
import { useTokenColors } from '@/ui/hooks/useTokenColors'
import { useCoverScreen } from './ambientClock'
import { maybeAskForReview } from './reviewPrompt'
import { useSession } from '@/ui/state/session'
import { useSettings } from '@/ui/state/settings'
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
  // Goodnight is opaque: everything moving underneath rests (games pause through useBackgroundPause).
  useCoverScreen(ended)

  useEffect(() => {
    const tick = () => {
      const now = Date.now()

      // Ambient sleep timer check:
      // Native CoreAudio `sleepFadeGain` already smoothly faded to 0 on time even while locked;
      // tear down idle sources & hide Now Playing immediately once expired (zero re-fade click).
      if (playing && stopAt && now >= stopAt) {
        const alreadyFaded = now - stopAt > 1500
        stopSound(alreadyFaded ? 0.05 : 2.5, { hideNotification: true })
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
        // Lights out was the deadline, even if the phone was asleep until later.
        const d = new Date(sessionEnd(session))
        useSettings.getState().set({
          lastLightsOut: formatBedtime12h(formatHHMM(d.getHours(), d.getMinutes())),
          lastLightsOutNight: nightKey(d),
        })
        useSettings.getState().recordSleep('lightsOut', d)
        finish()
        stopSound(3, { hideNotification: true })
      }
    }

    tick()
    // Nothing to watch: no wind-down in progress (none, or already at Goodnight) and no sleep timer running.
    if ((!session || ended) && !(playing && stopAt)) return
    const id = setInterval(tick, 1000)
    const appSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') tick()
    })
    return () => {
      clearInterval(id)
      appSub.remove()
    }
  }, [session, ended, finish, playing, stopAt, stopSound])

  if (!ended && curtainOpacity <= 0.01) return null

  return (
    <Pressable
      pointerEvents={ended ? 'auto' : 'none'}
      onPress={
        ended
          ? () => {
              dismiss()
              // Back from a finished wind-down: a good moment, now and then, to ask for a rating.
              maybeAskForReview(2200)
            }
          : undefined
      }
      style={[
        StyleSheet.absoluteFill,
        styles.curtain,
        { opacity: ended ? 1 : curtainOpacity },
      ]}
    >
      {ended && (
        <View style={styles.restWrap}>
          <Text style={[styles.restTitle, { color: color.ink2 }]}>Goodnight</Text>
          <Text style={[styles.restHint, { color: color.ink4 }]}>Tap anywhere to return</Text>
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
