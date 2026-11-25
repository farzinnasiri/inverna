import { create } from 'zustand'
import type { GameId } from '@/core/games/catalog'
import { useSettings } from './settings'

export type Tab = 'play' | 'sounds'
/** Why the check-in is open: tonight's plan (Play, reminders) or help picking a sound. */
export type CheckInMode = 'tonight' | 'sound'

interface NavState {
  tab: Tab
  game: GameId | null
  windDownOpen: boolean
  mixOpen: boolean
  checkIn: CheckInMode | null
  setTab: (tab: Tab) => void
  openGame: (id: GameId) => void
  closeGame: () => void
  setWindDownOpen: (open: boolean) => void
  setMixOpen: (open: boolean) => void
  setCheckIn: (mode: CheckInMode | null) => void
}

export const useNav = create<NavState>()((set) => ({
  tab: 'play',
  game: null,
  windDownOpen: false,
  mixOpen: false,
  checkIn: null,
  setTab: (tab) => set({ tab }),
  openGame: (game) => {
    useSettings.getState().set({ lastGame: game })
    set({ game })
  },
  closeGame: () => set({ game: null }),
  setWindDownOpen: (windDownOpen) => set({ windDownOpen }),
  setMixOpen: (mixOpen) => set({ mixOpen }),
  setCheckIn: (checkIn) => set({ checkIn }),
}))
