import type { SigilId } from '@/core/games/lanterns/engine'

/**
 * Twelve bespoke astronomical / watchmaker single-weight geometric SVGs.
 * Crisp 1.5px strokes on a 40×40 viewBox — zero emoji, zero gradients.
 */
export function SigilMark({ id, className = '' }: { id: SigilId; className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 40 40"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {id === 'crescent' && (
        <>
          <path d="M23.5 9.5a11 11 0 1 0 7.2 19.3 8.8 8.8 0 0 1-7.2-19.3Z" />
          <path d="M27.5 11.5v4M25.5 13.5h4" />
        </>
      )}

      {id === 'compass' && (
        <>
          <circle cx="20" cy="20" r="12.5" />
          <polygon points="20,10.5 23,20 20,29.5 17,20" />
          <circle cx="20" cy="20" r="1.4" fill="currentColor" stroke="none" />
          <path d="M20 5.5v2M20 32.5v2M5.5 20h2M32.5 20h2" />
        </>
      )}

      {id === 'astrolabe' && (
        <>
          <circle cx="20" cy="21" r="11" />
          <ellipse cx="20" cy="21" rx="5.5" ry="11" transform="rotate(-24 20 21)" />
          <path d="M10.5 21h19" />
          <circle cx="20" cy="7.5" r="2" />
          <circle cx="20" cy="21" r="1.5" fill="currentColor" stroke="none" />
        </>
      )}

      {id === 'sundial' && (
        <>
          <path d="M8.5 26.5a11.5 11.5 0 0 1 23 0" />
          <path d="M7 26.5h26" />
          <path d="M20 26.5V10.5l7.5 16" />
          <path d="M12.5 19l1.6 1.4M27.5 19l-1.6 1.4M20 15v2.2" />
        </>
      )}

      {id === 'prism' && (
        <>
          <polygon points="20,9.5 31,28.5 9,28.5" />
          <path d="M5.5 20h8.5" />
          <path d="M25.2 18.5l8.8-2.5" />
          <path d="M26.8 21.5l7.7 2.5" />
        </>
      )}

      {id === 'wave' && (
        <>
          <path d="M7 16.5c2.6-3.2 5.4-3.2 8 0s5.4 3.2 8 0 5.4-3.2 10 0" />
          <path d="M7 23.5c2.6-3.2 5.4-3.2 8 0s5.4 3.2 8 0 5.4-3.2 10 0" />
          <circle cx="7" cy="16.5" r="1.2" fill="currentColor" stroke="none" />
          <circle cx="33" cy="23.5" r="1.2" fill="currentColor" stroke="none" />
        </>
      )}

      {id === 'star' && (
        <>
          <path d="M20 7v8M20 25v8M7 20h8M25 20h8" />
          <path d="M11.5 11.5l5 5M23.5 23.5l5 5M28.5 11.5l-5 5M16.5 23.5l-5 5" />
          <circle cx="20" cy="20" r="3" />
        </>
      )}

      {id === 'hourglass' && (
        <>
          <path d="M12 8.5h16M12 31.5h16" />
          <path d="M14 8.5v4.5c0 3.2 6 5.5 6 7s-6 3.8-6 7v4.5" />
          <path d="M26 8.5v4.5c0 3.2-6 5.5-6 7s6 3.8 6 7v4.5" />
          <circle cx="20" cy="24.5" r="1.2" fill="currentColor" stroke="none" />
        </>
      )}

      {id === 'rings' && (
        <>
          <circle cx="20" cy="20" r="6.8" />
          <ellipse cx="20" cy="20" rx="14" ry="4.8" transform="rotate(-24 20 20)" />
        </>
      )}

      {id === 'horizon' && (
        <>
          <path d="M12.5 22a7.5 7.5 0 0 1 15 0" />
          <path d="M7 22h26" />
          <path d="M11 26.5h18" />
          <path d="M15 30.5h10" />
        </>
      )}

      {id === 'diamond' && (
        <>
          <polygon points="20,7.5 31,20 20,32.5 9,20" />
          <polygon points="20,13.5 25.5,20 20,26.5 14.5,20" />
          <path d="M20 7.5v6M20 26.5v6M9 20h5.5M25.5 20H31" />
        </>
      )}

      {id === 'leaf' && (
        <>
          <path d="M20 8c7.5 4.2 10 11 7 18.5-2 4.8-7 5.5-7 5.5s-5-.7-7-5.5C10 19 12.5 12.2 20 8Z" />
          <path d="M20 11v21" />
          <path d="M20 18l4-2.5M20 18l-4-2.5M20 24l4.5-2.5M20 24l-4.5-2.5" />
        </>
      )}
    </svg>
  )
}

/** Subtle machined watchmaker crosshair/dot guilloché mark for card backs. */
export function CardBackMark({ className = '' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 40 40"
      fill="none"
      stroke="currentColor"
      strokeWidth={1}
      strokeLinecap="round"
      aria-hidden
    >
      <circle cx="20" cy="20" r="10.5" strokeDasharray="1.5 3.5" />
      <path d="M20 6v4M20 30v4M6 20h4M30 20h4" />
      <circle cx="20" cy="20" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  )
}
