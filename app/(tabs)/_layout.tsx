import { StyleSheet, View } from 'react-native'
import { Redirect } from 'expo-router'
import { NativeTabs } from 'expo-router/native-tabs'
import { useTokenColors } from '@/ui/hooks/useTokenColors'
import { AmbientBackdrop } from '@/ui/rn/AmbientBackdrop'
import { useSettings } from '@/ui/state/settings'

/**
 * See-through tabs: one backdrop lives behind all three tabs, so switching tabs
 * never swaps it out (no restart, no stale frame, one canvas instead of three).
 * The container gets an almost-clear colour rather than 'transparent', which
 * the native side could read as "unset" and replace with the system background.
 */
const SEE_THROUGH = { backgroundColor: 'rgba(0,0,0,0.004)' } as const
const CLEAR_CONTENT = { backgroundColor: 'transparent' } as const

/**
 * Native iOS 26 Liquid Glass tab bar via `NativeTabs` (UIKit UITabBar).
 * - No tab bar `backgroundColor`, so Liquid Glass stays active.
 * - Works on iOS, Android and web.
 */
export default function TabsLayout() {
  const { color } = useTokenColors()
  const onboarded = useSettings((s) => s.onboarded)
  // First run (or after "Clear data"): meet Lull first.
  if (!onboarded) return <Redirect href="/onboarding" />

  return (
    <View style={styles.root}>
      <AmbientBackdrop />
      <NativeTabs
        unstable_nativeProps={{ nativeContainerStyle: SEE_THROUGH }}
        iconColor={{ default: color.ink3, selected: color.accent }}
        labelStyle={{
          default: { color: color.ink3 },
          selected: { color: color.ink },
        }}
        tintColor={color.accent}
        minimizeBehavior="never"
      >
        <NativeTabs.Trigger name="index" contentStyle={CLEAR_CONTENT}>
          <NativeTabs.Trigger.Label>Play</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf={{ default: 'square.grid.2x2', selected: 'square.grid.2x2.fill' }} />
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="sounds" contentStyle={CLEAR_CONTENT}>
          <NativeTabs.Trigger.Label>Sounds</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf="waveform" />
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="settings" contentStyle={CLEAR_CONTENT}>
          <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf={{ default: 'gearshape', selected: 'gearshape.fill' }} />
        </NativeTabs.Trigger>
      </NativeTabs>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000000',
  },
})
