import { create } from 'zustand'

/** Why the check-in is open: tonight's plan (Play, reminders) or help picking a sound. */
export type CheckInMode = 'tonight' | 'sound'

interface NavState {
  windDownOpen: boolean
  mixOpen: boolean
  checkIn: CheckInMode | null
  /** The bedtime-reminder offer is up. */
  reminderOffer: boolean
  setWindDownOpen: (open: boolean) => void
  setMixOpen: (open: boolean) => void
  setCheckIn: (mode: CheckInMode | null) => void
  setReminderOffer: (open: boolean) => void
}

export const useNav = create<NavState>()((set) => ({
  windDownOpen: false,
  mixOpen: false,
  checkIn: null,
  reminderOffer: false,
  setWindDownOpen: (windDownOpen) => set({ windDownOpen }),
  setMixOpen: (mixOpen) => set({ mixOpen }),
  setCheckIn: (checkIn) => set({ checkIn }),
  setReminderOffer: (reminderOffer) => set({ reminderOffer }),
}))
