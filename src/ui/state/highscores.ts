import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { GameId } from '@/core/games/catalog'
import {
  bestFor,
  EMPTY_HIGH_SCORES,
  recordScore,
  type HighScoreTable,
} from '@/core/highscores'
import { kvStorage } from './settings'

interface HighScoresState {
  table: HighScoreTable
  record: (gameId: GameId, candidate: number) => { isNewBest: boolean; best: number | null }
  bestOf: (gameId: GameId) => number | null
  clearGame: (gameId: GameId) => void
  clearAll: () => void
}

export const useHighScores = create<HighScoresState>()(
  persist(
    (set, get) => ({
      table: EMPTY_HIGH_SCORES,
      record: (gameId, candidate) => {
        const res = recordScore(get().table, gameId, candidate, Date.now())
        if (res.isNewBest) {
          set({ table: res.table })
        }
        return { isNewBest: res.isNewBest, best: res.best }
      },
      bestOf: (gameId) => bestFor(get().table, gameId),
      clearGame: (gameId) =>
        set((s) => {
          const next = { ...s.table }
          delete next[gameId]
          return { table: next }
        }),
      clearAll: () => set({ table: EMPTY_HIGH_SCORES }),
    }),
    {
      name: 'highscores',
      storage: kvStorage,
      version: 1,
    },
  ),
)
