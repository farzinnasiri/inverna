/**
 * Haptics contract + web adapter.
 * Web: navigator.vibrate (Android Chrome; iOS Safari ignores it silently).
 * Native: expo-haptics maps 1:1 onto these three intents.
 */
export type HapticIntent = 'light' | 'medium' | 'success'

export interface Haptics {
  play(intent: HapticIntent): void
}

const patterns: Record<HapticIntent, number | number[]> = {
  light: 6,
  medium: 14,
  success: [10, 60, 18],
}

export const webHaptics: Haptics = {
  play(intent) {
    try {
      navigator.vibrate?.(patterns[intent])
    } catch {
      /* unsupported */
    }
  },
}
