import { Platform } from 'react-native'
import * as Haptics from 'expo-haptics'

export type HapticIntent = 'light' | 'medium' | 'success' | 'selection'

export interface HapticsAdapter {
  play(intent: HapticIntent): void
}

const webPatterns: Record<HapticIntent, number | number[]> = {
  selection: 4,
  light: 8,
  medium: 16,
  success: [10, 55, 18],
}

export const deviceHaptics: HapticsAdapter = {
  play(intent) {
    if (Platform.OS === 'web') {
      try {
        navigator.vibrate?.(webPatterns[intent])
      } catch {
        /* unsupported */
      }
      return
    }
    try {
      if (intent === 'selection') void Haptics.selectionAsync().catch(() => {})
      else if (intent === 'light') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
      else if (intent === 'medium') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {})
      else void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
    } catch {
      /* simulator or unsupported device */
    }
  },
}
