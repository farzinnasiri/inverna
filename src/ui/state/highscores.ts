import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { GameId } from '@/core/games/catalog'
import {
  bestFor,
  EMPTY_HIGH_SCORES,
  recordScore,
  type HighScoreTable,
} from '@/core/highscores'
import { isNumber, isRecord, pickValid } from '@/core/decode'
import { kvStorage } from './storage'

interface HighScoresState {
  table: HighScoreTable
  record: (gameId: GameId, candidate: number, variant?: string) => { isNewBest: boolean; best: number | null }
  bestOf: (gameId: GameId, variant?: string) => number | null
  clearGame: (gameId: GameId) => void
  clearAll: () => void
}

export const useHighScores = create<HighScoresState>()(
  persist(
    (set, get) => ({
      table: EMPTY_HIGH_SCORES,
      record: (gameId, candidate, variant) => {
        const res = recordScore(get().table, gameId, candidate, Date.now(), variant)
        if (res.isNewBest) {
          set({ table: res.table })
        }
        return { isNewBest: res.isNewBest, best: res.best }
      },
      bestOf: (gameId, variant) => bestFor(get().table, gameId, variant),
      clearGame: (gameId) =>
        set((s) => {
          // Every size of this game.
          const next = { ...s.table }
          for (const key of Object.keys(next)) if (key === gameId || key.startsWith(`${gameId}:`)) delete next[key]
          return { table: next }
        }),
      clearAll: () => set({ table: EMPTY_HIGH_SCORES }),
    }),
    {
      name: 'highscores',
      storage: kvStorage,
      version: 1,
      // Records keep only well-formed entries; anything else is dropped.
      merge: (saved, current) =>
        pickValid(saved, current, {
          table: (v) => isRecord(v) && Object.values(v).every((e) => isRecord(e) && isNumber(e.value) && isNumber(e.updatedAt)),
        }),
    },
  ),
)
