import { create } from 'zustand'
import type { GameId } from '@/core/games/catalog'

export type Tab = 'play' | 'sounds' | 'night'

/**
 * Tiny navigator. Deliberately not a URL router: the app is a single
 * full-screen surface, and this maps directly onto an Expo stack + tabs later.
 */
interface NavState {
  tab: Tab
  game: GameId | null
  windDownOpen: boolean
  setTab: (tab: Tab) => void
  openGame: (id: GameId) => void
  closeGame: () => void
  setWindDownOpen: (open: boolean) => void
}

export const useNav = create<NavState>()((set) => ({
  tab: 'play',
  game: null,
  windDownOpen: false,
  setTab: (tab) => set({ tab }),
  openGame: (game) => set({ game }),
  closeGame: () => set({ game: null }),
  setWindDownOpen: (windDownOpen) => set({ windDownOpen }),
}))
