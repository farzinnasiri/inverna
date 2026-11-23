import type { GameId } from '@/core/games/catalog'

/**
 * Crisp 2-tone Watchmaker Ink & Brass geometric marks for all 10 games.
 */
export function GameGlyph({ id }: { id: GameId }) {
  switch (id) {
    case 'settle':
      return (
        <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden>
          <rect x="4" y="20" width="7" height="7" rx="1.8" fill="var(--c-ink-4)" />
          <rect x="12.5" y="20" width="7" height="7" rx="1.8" fill="var(--c-ink-4)" />
          <rect x="21" y="20" width="7" height="7" rx="1.8" fill="var(--p-ochre)" />
          <rect x="21" y="11.5" width="7" height="7" rx="1.8" fill="var(--p-ochre)" />
          <rect x="12.5" y="4" width="7" height="7" rx="1.8" fill="var(--p-clay)" />
          <rect x="4" y="11.5" width="7" height="7" rx="1.8" fill="var(--p-clay)" />
          <rect x="12.5" y="11.5" width="7" height="7" rx="1.8" fill="var(--p-clay)" />
        </svg>
      )
    case 'cascade':
      return (
        <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden>
          <rect x="4" y="4" width="7" height="7" rx="1.6" fill="var(--p-clay)" />
          <rect x="12.5" y="4" width="7" height="7" rx="1.6" fill="var(--p-straw)" />
          <rect x="21" y="4" width="7" height="7" rx="1.6" fill="var(--p-straw)" />
          <rect x="4" y="12.5" width="7" height="7" rx="1.6" fill="var(--p-clay)" />
          <rect x="13" y="14" width="7" height="7" rx="1.6" fill="var(--p-ochre)" transform="rotate(14 16.5 17.5)" />
          <rect x="21.5" y="19.5" width="7" height="7" rx="1.6" fill="var(--p-sage)" transform="rotate(-18 25 23)" />
          <rect x="5" y="22" width="7" height="7" rx="1.6" fill="var(--p-bone)" transform="rotate(24 8.5 25.5)" />
        </svg>
      )
    case 'hue':
      return (
        <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden>
          <rect x="4" y="4" width="7" height="7" rx="1.8" fill="var(--p-bone)" />
          <rect x="12.5" y="4" width="7" height="7" rx="1.8" fill="var(--p-ochre)" />
          <rect x="21" y="4" width="7" height="7" rx="1.8" fill="var(--p-sage)" />
          <rect x="4" y="12.5" width="7" height="7" rx="1.8" fill="var(--p-stone)" />
          <rect x="12.5" y="12.5" width="7" height="7" rx="1.8" fill="var(--p-straw)" />
          <rect x="21" y="12.5" width="7" height="7" rx="1.8" fill="var(--p-rosewood)" />
          <rect x="4" y="21" width="7" height="7" rx="1.8" fill="var(--p-clay)" />
          <rect x="12.5" y="21" width="7" height="7" rx="1.8" fill="var(--c-ink-4)" />
          <rect x="21" y="21" width="7" height="7" rx="1.8" fill="var(--c-surface-3)" />
        </svg>
      )
    case 'thread':
      return (
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden>
          <path d="M8 9 H21 A3 3 0 0 1 24 12 V23" stroke="var(--p-ochre)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
          <path d="M8 23 V16 H16 V23" stroke="var(--p-straw)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.75" />
          <circle cx="8" cy="9" r="3" fill="var(--p-ochre)" />
          <circle cx="24" cy="23" r="3" fill="var(--p-ochre)" />
          <rect x="5.5" y="20.5" width="5" height="5" rx="1.2" fill="var(--p-straw)" />
          <rect x="13.5" y="20.5" width="5" height="5" rx="1.2" fill="var(--p-straw)" />
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
          <circle cx="16" cy="16" r="7.5" stroke="var(--p-clay)" strokeWidth="1.2" />
          <path d="M10.5 20 C12.5 13, 18.5 11, 22 12.5 C20.5 17, 15 19, 10.5 20 Z" fill="var(--p-bone)" />
          <circle cx="18" cy="14" r="1.4" fill="var(--p-ochre)" />
        </svg>
      )
    case 'drift':
      return (
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden>
          <rect x="4" y="4" width="10.5" height="10.5" rx="2.5" fill="var(--c-ink-4)" />
          <rect x="17.5" y="4" width="10.5" height="10.5" rx="2.5" fill="var(--p-clay)" />
          <rect x="4" y="17.5" width="10.5" height="10.5" rx="2.5" fill="var(--p-ochre)" />
          <rect x="18.25" y="18.25" width="9" height="9" rx="2" stroke="var(--c-ink-4)" strokeWidth="1.4" strokeDasharray="2.5 2" />
        </svg>
      )
    case 'nine':
      return (
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden>
          <rect x="4.5" y="4.5" width="23" height="23" rx="3.5" stroke="var(--c-ink-4)" strokeWidth="1.4" />
          <path d="M12.2 4.5 V27.5 M19.8 4.5 V27.5 M4.5 12.2 H27.5 M4.5 19.8 H27.5" stroke="var(--c-ink-4)" strokeWidth="1" />
          <circle cx="8.4" cy="8.4" r="2" fill="var(--p-ochre)" />
          <circle cx="16" cy="16" r="2" fill="var(--p-bone)" />
          <circle cx="23.6" cy="23.6" r="2" fill="var(--p-straw)" />
        </svg>
      )
    case 'weave':
      return (
        <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden>
          <rect x="12.5" y="4" width="7" height="7" rx="1.6" fill="var(--p-ochre)" />
          <rect x="4" y="12.5" width="7" height="7" rx="1.6" fill="var(--p-straw)" />
          <rect x="12.5" y="12.5" width="7" height="7" rx="1.6" fill="var(--p-straw)" />
          <rect x="21" y="12.5" width="7" height="7" rx="1.6" fill="var(--p-straw)" />
          <rect x="12.5" y="21" width="7" height="7" rx="1.6" fill="var(--c-ink-3)" />
        </svg>
      )
    case 'patience':
      return (
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden>
          <rect x="6" y="5" width="13.5" height="19" rx="2.8" fill="var(--c-surface-3)" stroke="var(--c-ink-4)" strokeWidth="1.2" />
          <rect x="12.5" y="8" width="13.5" height="19" rx="2.8" fill="var(--c-surface-2)" stroke="var(--c-ink-3)" strokeWidth="1.2" />
          <path d="M19.25 14 L22 17.5 L19.25 21 L16.5 17.5 Z" fill="var(--p-sage)" />
        </svg>
      )
    case 'lanterns':
      return (
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden>
          <rect x="5" y="8" width="9.5" height="16" rx="4.75" fill="var(--p-rosewood)" />
          <rect x="17.5" y="8" width="9.5" height="16" rx="4.75" fill="var(--p-ochre)" />
          <circle cx="9.75" cy="16" r="2.1" fill="var(--p-bone)" />
          <circle cx="22.25" cy="16" r="2.1" fill="var(--c-accent-ink)" />
        </svg>
      )
  }
}
