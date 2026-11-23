import { create } from 'zustand'
import type { GameId } from '@/core/games/catalog'
import { useSettings } from './settings'

export type Tab = 'play' | 'sounds'

interface NavState {
  tab: Tab
  game: GameId | null
  windDownOpen: boolean
  nightOpen: boolean
  mixOpen: boolean
  onboardingReplay: boolean
  setTab: (tab: Tab) => void
  openGame: (id: GameId) => void
  closeGame: () => void
  setWindDownOpen: (open: boolean) => void
  setNightOpen: (open: boolean) => void
  setMixOpen: (open: boolean) => void
  setOnboardingReplay: (open: boolean) => void
}

export const useNav = create<NavState>()((set) => ({
  tab: 'play',
  game: null,
  windDownOpen: false,
  nightOpen: false,
  mixOpen: false,
  onboardingReplay: false,
  setTab: (tab) => set({ tab }),
  openGame: (game) => {
    useSettings.getState().set({ lastGame: game })
    set({ game })
  },
  closeGame: () => set({ game: null }),
  setWindDownOpen: (windDownOpen) => set({ windDownOpen }),
  setNightOpen: (nightOpen) => set({ nightOpen }),
  setMixOpen: (mixOpen) => set({ mixOpen }),
  setOnboardingReplay: (onboardingReplay) => set({ onboardingReplay }),
}))
