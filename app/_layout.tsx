import '@/platform/boot'
import { useEffect } from 'react'
import { AppState, Platform, StyleSheet, View } from 'react-native'
import { router, Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context'
import { applyTokens } from '@/design/tokens'
import { notifications, skipPaywall, sound, store } from '@/platform'
import { NightCheckIn } from '@/ui/rn/NightCheckIn'
import { PaywallSheet } from '@/ui/rn/Paywall'
import { DeviceInsetsProvider } from '@/ui/rn/insets'
import { ReminderOfferSheet } from '@/ui/rn/ReminderOfferSheet'
import { NightFilterOverlay } from '@/ui/rn/NightFilterOverlay'
import { LaunchVeil } from '@/ui/rn/LaunchVeil'
import { useReminderPlanner } from '@/ui/rn/reminders'
import { SessionCurtain } from '@/ui/rn/SessionCurtain'
import { noteNightUsedNow } from '@/ui/rn/reviewPrompt'
import { WindDownSheet } from '@/ui/rn/WindDownSheet'
import { useNav } from '@/ui/state/nav'
import { useSession } from '@/ui/state/session'
import { useSettings } from '@/ui/state/settings'
import { useSound } from '@/ui/state/sound'
import { useUnlock } from '@/ui/state/unlock'
import { installCrashLogging } from '@/ui/log'

// Uncaught errors become one event each (no sink: nothing leaves the phone).
installCrashLogging()

// Initialize design tokens synchronously before first render.
applyTokens({ warmth: 0, force: true })

export default function RootLayout() {
  useReminderPlanner()

  // Ask StoreKit whether Full Unlock is owned at launch, on every foreground
  // resume (catching refunds, Ask-to-Buy approvals & Family Sharing changes),
  // and whenever StoreKit emits an out-of-band transaction update.
  useEffect(() => {
    const check = async () => {
      await useUnlock.getState().check()
      const { status, unreachable } = useUnlock.getState()
      return status === 'unlocked' && !unreachable
    }
    const unsubStore = skipPaywall ? undefined : store.subscribe(check)
    void check()
    noteNightUsedNow()
    // OpenIAP 4.2.1 drops revoked Transaction.updates. Reconcile a long
    // foreground session too, without prompting for an App Store sync.
    const reconcile = !skipPaywall && Platform.OS === 'ios' ? setInterval(() => {
      if (AppState.currentState === 'active' && useUnlock.getState().status === 'unlocked') void check()
    }, 60_000) : undefined
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return
      noteNightUsedNow()
      void useUnlock.getState().check()
    })
    return () => {
      clearInterval(reconcile)
      unsubStore?.()
      sub.remove()
    }
  }, [])

  // A tapped wind-down reminder opens Play with the check-in.
  useEffect(
    () =>
      notifications.onReminderOpened(() => {
        try {
          router.navigate('/')
        } catch {
          /* navigation not ready; Play is the first screen anyway */
        }
        useNav.getState().setCheckIn('tonight')
      }),
    [],
  )

  const session = useSession((s) => s.session)
  const sessionActive = useSession((s) => Boolean(s.session && !s.ended))
  const soundPresetId = useSound((s) => s.presetId)
  const syncDescent = useSound((s) => s.syncDescent)

  const schedule = useSettings((s) => s.schedule)
  const tonightBedtime = useSettings((s) => s.tonightBedtime)
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
  }, [schedule, tonightBedtime, modulationDepth, autoDescent, session, soundPresetId, savedPreset, syncDescent])

  // Keep the screen awake during a wind down only. A playing sound must not:
  // "put my phone down" means the screen sleeps while the sound plays on.
  useEffect(() => {
    if (Platform.OS === 'web') return
    if (sessionActive) {
      void activateKeepAwakeAsync('inverna-session').catch(() => {})
    } else {
      void deactivateKeepAwake('inverna-session').catch(() => {})
    }
  }, [sessionActive])

  // Register PWA service worker on web production builds.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !('serviceWorker' in navigator)) return
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') return
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  }, [])

  return (
    <GestureHandlerRootView style={styles.root}>
      {/* Real insets from the first frame, so no screen lays out once with zero insets. */}
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <DeviceInsetsProvider>
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
              <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false, animation: 'fade' }} />
              <Stack.Screen name="paywall" options={{ headerShown: false, gestureEnabled: false, animation: 'fade' }} />
              <Stack.Screen
                name="game/[id]"
                options={{
                  headerShown: false,
                  gestureEnabled: false,
                  // The game itself steps in (GameShell scales it toward you); the route just fades.
                  animation: 'fade',
                  animationDuration: 260,
                }}
              />
            </Stack>

            <WindDownSheet />
            <NightCheckIn />
            <ReminderOfferSheet />
            <PaywallSheet />
            <SessionCurtain />
            <NightFilterOverlay />
            <LaunchVeil />
          </View>
        </DeviceInsetsProvider>
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
