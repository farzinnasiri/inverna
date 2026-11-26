import { Platform } from 'react-native'
import * as Haptics from 'expo-haptics'
import { createHapticGate } from '@/core/hapticGate'

/**
 * Inverna's haptic vocabulary. Five events, each with one meaning everywhere
 * (see docs/DESIGN.md (Haptics) for when to use which, and when to use none):
 *
 * - `tick`: a value stepped (wheel row, slider detent, segment, chip, toggle,
 *   a cell selected in a game). The lightest thing the phone can do.
 * - `settle`: something came to rest because of your touch (a piece placed,
 *   a tile slid, the ball met your paddle, a long press caught).
 * - `reward`: a small moment you earned (a line cleared, a pair found, a
 *   lotus opened). Rare by design.
 * - `complete`: the round is done (a puzzle solved). Once per round.
 * - `commit`: a deliberate app action that changes your night (start or end
 *   a wind down, lights out, erase everything).
 *
 * Buttons, tabs, sheets and navigation are silent, as on iOS itself.
 */
export type HapticIntent = 'tick' | 'settle' | 'reward' | 'complete' | 'commit'

export interface HapticsAdapter {
  play(intent: HapticIntent): void
}

/** Least time between two of the same event, lightest to heaviest (see core/hapticGate). */
const MIN_GAP_MS: Record<HapticIntent, number> = {
  tick: 45,
  settle: 70,
  reward: 140,
  commit: 400,
  complete: 1500,
}
const ANY_GAP_MS = 35

const webPatterns: Record<HapticIntent, number | number[]> = {
  tick: 4,
  settle: 7,
  reward: 10,
  complete: [10, 60, 14],
  commit: 16,
}

const admit = createHapticGate(MIN_GAP_MS, ANY_GAP_MS)

export const deviceHaptics: HapticsAdapter = {
  play(intent) {
    if (!admit(intent, Date.now())) return
    if (Platform.OS === 'web') {
      try {
        navigator.vibrate?.(webPatterns[intent])
      } catch {
        /* unsupported */
      }
      return
    }
    try {
      const done = (p: Promise<void>) => void p.catch(() => {})
      switch (intent) {
        case 'tick':
          return done(Haptics.selectionAsync())
        case 'settle':
          return done(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft))
        case 'reward':
          return done(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light))
        case 'complete':
          return done(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success))
        case 'commit':
          return done(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium))
      }
    } catch {
      /* simulator or unsupported device */
    }
  },
}
