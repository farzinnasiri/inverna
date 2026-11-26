import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Session } from '@/core/session'
import { isBoolean, isNullable, isNumber, isRecord, isString, pickValid } from '@/core/decode'
import { kvStorage } from './storage'

const isSession = (v: unknown): v is Session =>
  isRecord(v) && isNumber(v.startedAt) && isNumber(v.minutes) && v.minutes > 0 && isNullable(isString)(v.presetId)

interface SessionState {
  session: Session | null
  /** True once the fade to black has completed; cleared on dismiss. */
  ended: boolean
  start: (minutes: number, presetId: string | null) => void
  finish: () => void
  dismiss: () => void
}

export const useSession = create<SessionState>()(
  persist(
    (set) => ({
      session: null,
      ended: false,
      start: (minutes, presetId) => set({ session: { startedAt: Date.now(), minutes, presetId }, ended: false }),
      finish: () => set({ ended: true }),
      dismiss: () => set({ session: null, ended: false }),
    }),
    {
      name: 'session',
      storage: kvStorage,
      version: 1,
      merge: (saved, current) => pickValid(saved, current, { session: isNullable(isSession), ended: isBoolean }),
    },
  ),
)
