import { useSyncExternalStore } from 'react'
import { getResolvedTokens, subscribeTokens, type ResolvedTokens } from '@/design/tokens'

/**
 * Live resolved tokens for Canvas renderers (Pond, SoundField).
 * Re-renders only when the global warmth step (0.02) changes.
 */
export function useTokenColors(): ResolvedTokens {
  return useSyncExternalStore(subscribeTokens, getResolvedTokens, getResolvedTokens)
}
