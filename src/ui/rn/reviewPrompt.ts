import * as StoreReview from 'expo-store-review'
import { nightKey } from '@/core/night'
import { noteNightUsed, reviewDue } from '@/core/reviewPrompt'
import { skipPaywall } from '@/platform'
import { useSettings } from '@/ui/state/settings'

/** Note that Inverna was used tonight (launch and coming back). */
export function noteNightUsedNow(): void {
  const st = useSettings.getState()
  if (!st.onboarded) return
  const nightsUsed = noteNightUsed(st.nightsUsed, nightKey(new Date()))
  if (nightsUsed.length !== st.nightsUsed.length) st.set({ nightsUsed })
}

/**
 * Right after something good (a solved round, a finished wind-down): maybe
 * Apple's own rating sheet, if core/reviewPrompt says it's time. Apple
 * decides in the end whether it shows; Dev never asks.
 */
export function maybeAskForReview(delayMs = 1400): void {
  if (skipPaywall) return
  const st = useSettings.getState()
  if (!reviewDue({ nightsUsed: st.nightsUsed, lastAskAt: st.reviewAskedAt }, new Date())) return
  setTimeout(() => {
    void (async () => {
      try {
        if (!(await StoreReview.hasAction())) return
        useSettings.getState().set({ reviewAskedAt: Date.now() })
        await StoreReview.requestReview()
      } catch {
        /* no sheet this time */
      }
    })()
  }, delayMs)
}
