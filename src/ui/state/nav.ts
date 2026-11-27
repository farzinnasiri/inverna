import { create } from 'zustand'

/** Why the check-in is open: tonight's plan (Play, reminders) or help picking a sound. */
export type CheckInMode = 'tonight' | 'sound'

/** What the person tapped to open the Full Unlock sheet. */
export type PaywallReason = 'game' | 'sound' | 'custom-sound' | 'manual-light' | 'settings' | 'general'

export interface PaywallContext {
  reason: PaywallReason
  /** Specific item name when tapped (e.g. "Weave" or "Hearth & drift"). */
  label?: string
}

interface NavState {
  windDownOpen: boolean
  mixOpen: boolean
  checkIn: CheckInMode | null
  /** The bedtime-reminder offer is up. */
  reminderOffer: boolean
  /** Contextual Full Unlock sheet (null when closed). */
  paywall: PaywallContext | null
  setWindDownOpen: (open: boolean) => void
  setMixOpen: (open: boolean) => void
  setCheckIn: (mode: CheckInMode | null) => void
  setReminderOffer: (open: boolean) => void
  openPaywall: (reason: PaywallReason, label?: string) => void
  closePaywall: () => void
}

export const useNav = create<NavState>()((set) => ({
  windDownOpen: false,
  mixOpen: false,
  checkIn: null,
  reminderOffer: false,
  paywall: null,
  setWindDownOpen: (windDownOpen) => set({ windDownOpen }),
  setMixOpen: (mixOpen) => set({ mixOpen }),
  setCheckIn: (checkIn) => set({ checkIn }),
  setReminderOffer: (reminderOffer) => set({ reminderOffer }),
  openPaywall: (reason, label) => set({ paywall: label ? { reason, label } : { reason } }),
  closePaywall: () => set({ paywall: null }),
}))
