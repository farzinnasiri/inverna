import type { GameId } from '@/core/games/catalog'

/**
 * Flat 2-tone geometric marks: ink2 + one Dusk stone per game.
 * Drawn crisp at 32px, zero gradients, zero glow.
 */
export function GameGlyph({ id }: { id: GameId }) {
  switch (id) {
    case 'settle':
      return (
        <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden>
          <rect x="4" y="20" width="7" height="7" rx="2" fill="var(--c-ink-4)" />
          <rect x="12.5" y="20" width="7" height="7" rx="2" fill="var(--c-ink-4)" />
          <rect x="21" y="20" width="7" height="7" rx="2" fill="var(--c-ink-2)" />
          <rect x="21" y="11.5" width="7" height="7" rx="2" fill="var(--c-ink-2)" />
          <rect x="12.5" y="4" width="7" height="7" rx="2" fill="var(--p-clay)" />
          <rect x="4" y="11.5" width="7" height="7" rx="2" fill="var(--p-clay)" />
          <rect x="12.5" y="11.5" width="7" height="7" rx="2" fill="var(--p-clay)" />
        </svg>
      )
    case 'hue':
      return (
        <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden>
          <rect x="4" y="4" width="7" height="7" rx="2" fill="var(--p-bone)" />
          <rect x="12.5" y="4" width="7" height="7" rx="2" fill="var(--p-straw)" />
          <rect x="21" y="4" width="7" height="7" rx="2" fill="var(--p-ochre)" />
          <rect x="4" y="12.5" width="7" height="7" rx="2" fill="var(--p-sage)" />
          <rect x="12.5" y="12.5" width="7" height="7" rx="2" fill="var(--p-stone)" />
          <rect x="21" y="12.5" width="7" height="7" rx="2" fill="var(--p-clay)" />
          <rect x="4" y="21" width="7" height="7" rx="2" fill="var(--c-ink-4)" />
          <rect x="12.5" y="21" width="7" height="7" rx="2" fill="var(--p-rosewood)" />
          <rect x="21" y="21" width="7" height="7" rx="2" fill="var(--c-surface-3)" />
        </svg>
      )
    case 'thread':
      return (
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden>
          <path d="M8 9 H21 A3 3 0 0 1 24 12 V23" stroke="var(--p-ochre)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" opacity="0.65" />
          <path d="M8 23 V16 H16 V23" stroke="var(--c-ink-2)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" opacity="0.55" />
          <circle cx="8" cy="9" r="3" fill="var(--p-ochre)" />
          <circle cx="24" cy="23" r="3" fill="var(--p-ochre)" />
          <rect x="5.5" y="20.5" width="5" height="5" rx="1.2" fill="var(--c-ink-2)" />
          <rect x="13.5" y="20.5" width="5" height="5" rx="1.2" fill="var(--c-ink-2)" />
        </svg>
      )
    case 'kindle':
      return (
        <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden>
          <rect x="4" y="4" width="10.5" height="10.5" rx="2.5" fill="var(--c-surface-3)" />
          <rect x="17.5" y="4" width="10.5" height="10.5" rx="2.5" fill="var(--c-ink-4)" />
          <rect x="4" y="17.5" width="10.5" height="10.5" rx="2.5" fill="var(--p-ochre)" />
          <rect x="17.5" y="17.5" width="10.5" height="10.5" rx="2.5" fill="var(--p-bone)" />
        </svg>
      )
    case 'pond':
      return (
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden>
          <circle cx="16" cy="16" r="11.5" stroke="var(--c-ink-4)" strokeWidth="1.2" />
          <circle cx="16" cy="16" r="7.5" stroke="var(--c-ink-3)" strokeWidth="1.1" />
          <path d="M10.5 20 C12.5 13, 18.5 11, 22 12.5 C20.5 17, 15 19, 10.5 20 Z" fill="var(--p-bone)" />
        </svg>
      )
    default:
      return (
        <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden>
          <rect x="6" y="6" width="20" height="20" rx="5" fill="var(--c-ink-4)" />
        </svg>
      )
  }
}
