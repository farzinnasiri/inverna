import type { GameId } from '@/core/games/catalog'

/**
 * Authored minimal geometric marks for each of the ten games.
 * Drawn strictly in Lull's Ember palette — crisp shapes, no sketchy doodles.
 */
export function GameGlyph({ id }: { id: GameId }) {
  switch (id) {
    case 'settle':
      // Falling tetrominoes settling into a warm stack
      return (
        <svg width="36" height="36" viewBox="0 0 36 36" aria-hidden>
          <rect x="6" y="23" width="7" height="7" rx="1.8" fill="#B5694A" />
          <rect x="14.5" y="23" width="7" height="7" rx="1.8" fill="#B5694A" />
          <rect x="23" y="23" width="7" height="7" rx="1.8" fill="#E9C46A" />
          <rect x="23" y="14.5" width="7" height="7" rx="1.8" fill="#E9C46A" />
          <rect x="14.5" y="6" width="7" height="7" rx="1.8" fill="#FF7A33" />
          <rect x="6" y="14.5" width="7" height="7" rx="1.8" fill="#FF7A33" />
          <rect x="14.5" y="14.5" width="7" height="7" rx="1.8" fill="#FFB45E" />
        </svg>
      )
    case 'hue':
      // 3x3 smooth sunset gradient tiles
      return (
        <svg width="36" height="36" viewBox="0 0 36 36" aria-hidden>
          <rect x="5" y="5" width="8" height="8" rx="2" fill="#FFD9A0" />
          <rect x="14" y="5" width="8" height="8" rx="2" fill="#F0973A" />
          <rect x="23" y="5" width="8" height="8" rx="2" fill="#E85A36" />
          <rect x="5" y="14" width="8" height="8" rx="2" fill="#E9C46A" />
          <rect x="14" y="14" width="8" height="8" rx="2" fill="#D97A6C" />
          <rect x="23" y="14" width="8" height="8" rx="2" fill="#B5694A" />
          <rect x="5" y="23" width="8" height="8" rx="2" fill="#A2A55A" />
          <rect x="14" y="23" width="8" height="8" rx="2" fill="#8A543E" />
          <rect x="23" y="23" width="8" height="8" rx="2" fill="#5C2A16" />
        </svg>
      )
    case 'thread':
      // Non-crossing glowing paths connecting pairs
      return (
        <svg width="36" height="36" viewBox="0 0 36 36" fill="none" aria-hidden>
          <path d="M9 10 H24 A3 3 0 0 1 27 13 V25" stroke="#FF7A33" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M9 26 V18 H18 V26" stroke="#E9C46A" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="9" cy="10" r="3.4" fill="#FFD9A0" />
          <circle cx="27" cy="25" r="3.4" fill="#FF7A33" />
          <circle cx="9" cy="26" r="3.4" fill="#E9C46A" />
          <circle cx="18" cy="26" r="3.4" fill="#E9C46A" />
        </svg>
      )
    case 'kindle':
      // 2x2 glowing ember tiers (2048)
      return (
        <svg width="36" height="36" viewBox="0 0 36 36" aria-hidden>
          <rect x="5" y="5" width="12" height="12" rx="3" fill="#3A261C" />
          <rect x="19" y="5" width="12" height="12" rx="3" fill="#8A4220" />
          <rect x="5" y="19" width="12" height="12" rx="3" fill="#E85A36" />
          <rect x="19" y="19" width="12" height="12" rx="3" fill="#FFD9A0" />
        </svg>
      )
    case 'pond':
      // Concentric water ripples + koi curve
      return (
        <svg width="36" height="36" viewBox="0 0 36 36" fill="none" aria-hidden>
          <circle cx="18" cy="18" r="13" stroke="#5C2A16" strokeWidth="1.2" />
          <circle cx="18" cy="18" r="8.5" stroke="#B5694A" strokeWidth="1.2" strokeOpacity="0.65" />
          <path d="M12 22 C14 14, 21 12, 25 14 C23 19, 17 21, 12 22 Z" fill="#FFB45E" />
          <circle cx="22.5" cy="15.5" r="1.2" fill="#0A0605" />
        </svg>
      )
    case 'drift':
      // 15-puzzle sliding tiles with one open space
      return (
        <svg width="36" height="36" viewBox="0 0 36 36" aria-hidden>
          <rect x="5" y="5" width="12" height="12" rx="2.5" fill="#5C2A16" />
          <rect x="19" y="5" width="12" height="12" rx="2.5" fill="#B5694A" />
          <rect x="5" y="19" width="12" height="12" rx="2.5" fill="#E9C46A" />
          <rect x="19" y="19" width="12" height="12" rx="2.5" fill="none" stroke="#3A261C" strokeWidth="1.5" strokeDasharray="3 2" />
        </svg>
      )
    case 'nine':
      // 3x3 Sudoku grid with three warm dots
      return (
        <svg width="36" height="36" viewBox="0 0 36 36" fill="none" aria-hidden>
          <rect x="6" y="6" width="24" height="24" rx="4" stroke="#5C2A16" strokeWidth="1.5" />
          <path d="M14 6 V30 M22 6 V30 M6 14 H30 M6 22 H30" stroke="#3A261C" strokeWidth="1.2" />
          <circle cx="10" cy="10" r="2" fill="#FFB45E" />
          <circle cx="18" cy="18" r="2" fill="#FF7A33" />
          <circle cx="26" cy="26" r="2" fill="#E9C46A" />
        </svg>
      )
    case 'weave':
      // Nonogram woven cells
      return (
        <svg width="36" height="36" viewBox="0 0 36 36" aria-hidden>
          <rect x="14" y="6" width="8" height="8" rx="1.8" fill="#FFB45E" />
          <rect x="6" y="14" width="8" height="8" rx="1.8" fill="#E85A36" />
          <rect x="14" y="14" width="8" height="8" rx="1.8" fill="#E85A36" />
          <rect x="22" y="14" width="8" height="8" rx="1.8" fill="#E85A36" />
          <rect x="14" y="22" width="8" height="8" rx="1.8" fill="#B5694A" />
        </svg>
      )
    case 'patience':
      // Stacked warm playing cards
      return (
        <svg width="36" height="36" viewBox="0 0 36 36" fill="none" aria-hidden>
          <rect x="8" y="6" width="15" height="21" rx="3" fill="#261811" stroke="#5C2A16" strokeWidth="1.3" />
          <rect x="13" y="10" width="15" height="21" rx="3" fill="#3A261C" stroke="#B5694A" strokeWidth="1.3" />
          <path d="M20.5 17 L23.5 20.5 L20.5 24 L17.5 20.5 Z" fill="#FFB45E" />
        </svg>
      )
    case 'lanterns':
      // Two glowing paired lanterns
      return (
        <svg width="36" height="36" viewBox="0 0 36 36" aria-hidden>
          <rect x="7" y="10" width="9" height="16" rx="4.5" fill="#FF7A33" />
          <rect x="20" y="10" width="9" height="16" rx="4.5" fill="#FFD9A0" />
          <circle cx="11.5" cy="18" r="2.2" fill="#FFD9A0" />
          <circle cx="24.5" cy="18" r="2.2" fill="#FF7A33" />
        </svg>
      )
  }
}
