import { Redirect } from 'expo-router'
import { NativeTabs } from 'expo-router/native-tabs'
import { useTokenColors } from '@/ui/hooks/useTokenColors'
import { useSettings } from '@/ui/state/settings'

/**
 * Authentic native iOS 26 Liquid Glass tab bar via `NativeTabs` (UIKit UITabBar).
 * - Gives genuine Apple hold-and-drag magnifying-lens glass physics on iOS 26.
 * - Intentionally omits `backgroundColor` so iOS 26 Liquid Glass stays active.
 * - Cleanly supports iOS, Android, and Web with zero stuck-tap gesture bugs.
 */
export default function TabsLayout() {
  const { color } = useTokenColors()
  const onboarded = useSettings((s) => s.onboarded)
  // First run (or after "Clear data"): meet Lull first.
  if (!onboarded) return <Redirect href="/onboarding" />

  return (
    <NativeTabs
      iconColor={{ default: color.ink3, selected: color.accent }}
      labelStyle={{
        default: { color: color.ink3 },
        selected: { color: color.ink },
      }}
      tintColor={color.accent}
      minimizeBehavior="never"
    >
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Play</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'square.grid.2x2', selected: 'square.grid.2x2.fill' }}
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="sounds">
        <NativeTabs.Trigger.Label>Sounds</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="waveform" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="settings">
        <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'gearshape', selected: 'gearshape.fill' }}
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  )
}
