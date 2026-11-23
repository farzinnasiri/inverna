import type { CSSProperties } from 'react'

/**
 * Quiet geometric horizon: a 1px hairline with a 10px muted-sand disc.
 * - `position` (0..1) tracks evening progression along the line (left → centre).
 * - `set` (0..1) sinks the disc gently below the hairline during wind-down.
 */
export function Horizon({ set = 0, position = 0.5 }: { set?: number; position?: number }) {
  const clampedPos = Math.min(0.88, Math.max(0.12, position))
  const clampedSet = Math.min(1, Math.max(0, set))
  return (
    <div
      className="horizon"
      style={{ '--set': clampedSet, '--pos': `${clampedPos * 100}%` } as CSSProperties}
      aria-hidden
    >
      <div className="horizon__above">
        <span className="horizon__disc" />
      </div>
      <div className="horizon__line" />
      <div className="horizon__below">
        <span className="horizon__trace" />
      </div>
    </div>
  )
}
