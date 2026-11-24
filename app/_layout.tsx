import '@/platform/boot'
import { useEffect } from 'react'
import { Platform, StyleSheet, View } from 'react-native'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { applyTokens } from '@/design/tokens'
import { sound } from '@/platform'
import { NightCheckIn } from '@/ui/rn/NightCheckIn'
import { NightFilterOverlay } from '@/ui/rn/NightFilterOverlay'
import { NightSheet } from '@/ui/rn/NightSheet'
import { Onboarding } from '@/ui/rn/Onboarding'
import { SessionCurtain } from '@/ui/rn/SessionCurtain'
import { WindDownSheet } from '@/ui/rn/WindDownSheet'
import { useSession } from '@/ui/state/session'
import { useSettings } from '@/ui/state/settings'
import { useSound } from '@/ui/state/sound'

// Initialize design tokens synchronously before first render.
applyTokens({ warmth: 0, force: true })

export default function RootLayout() {
  const session = useSession((s) => s.session)
  const sessionActive = useSession((s) => Boolean(s.session && !s.ended))
  const soundPlaying = useSound((s) => s.playing)
  const soundPresetId = useSound((s) => s.presetId)
  const syncDescent = useSound((s) => s.syncDescent)

  const schedule = useSettings((s) => s.schedule)
  const modulationDepth = useSettings((s) => s.modulationDepth)
  const autoDescent = useSettings((s) => s.autoDescent)
  const savedPreset = useSettings((s) => s.sessionPreset)
  const sfx = useSettings((s) => s.sfx)

  // Keep game cues toggle mirrored to the audio engine.
  useEffect(() => {
    sound.setCuesEnabled(sfx)
  }, [sfx])

  // Drive the live 60-minute neuroacoustic Iso-descent arc & harmonic cue key.
  useEffect(() => {
    syncDescent(new Date(), 1.2)
    const id = setInterval(() => {
      syncDescent(new Date(), 4.0)
    }, 15_000)
    return () => clearInterval(id)
  }, [schedule, modulationDepth, autoDescent, session, soundPresetId, savedPreset, syncDescent])

  // Keep screen awake during active wind-down sessions or live sound playback on native.
  useEffect(() => {
    if (Platform.OS === 'web') return
    if (sessionActive || soundPlaying) {
      void activateKeepAwakeAsync('lull-session').catch(() => {})
    } else {
      void deactivateKeepAwake('lull-session').catch(() => {})
    }
  }, [sessionActive, soundPlaying])

  // Register PWA service worker on web production builds.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !('serviceWorker' in navigator)) return
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') return
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  }, [])

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <View style={styles.root}>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: '#000000' },
              animation: 'fade',
            }}
          >
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen
              name="game/[id]"
              options={{
                headerShown: false,
                gestureEnabled: false,
                animation: 'fade_from_bottom',
                animationDuration: 240,
              }}
            />
          </Stack>

          <WindDownSheet />
          <NightSheet />
          <NightCheckIn />
          <Onboarding />
          <SessionCurtain />
          <NightFilterOverlay />
        </View>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000000',
  },
})
