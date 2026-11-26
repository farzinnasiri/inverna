import { haptics } from '@/platform'
import type { HapticIntent } from '@/platform/haptics'
import { useSettings } from '@/ui/state/settings'

export type { HapticIntent }

/**
 * Play a haptic if the person has haptics on. The one way the app's UI plays
 * haptics (games go through `useFeedback`, which pairs them with sound).
 * What each event means, and when to stay silent: docs/DESIGN.md (Haptics).
 */
export function feel(intent: HapticIntent): void {
  if (useSettings.getState().haptics) haptics.play(intent)
}
