import type { CSSProperties } from 'react'

const TICKS = Array.from({ length: 25 }, (_, i) => i)

/**
 * Watchmaker-grade Evening Timeline.
 * Precision graduated ruler showing current position moving cleanly from
 * `startLabel` (e.g. evening start or session start) toward `endLabel` (bedtime).
 */
export function Horizon({
  progress = 0.5,
  startLabel,
  endLabel,
}: {
  progress?: number
  startLabel: string
  endLabel: string
}) {
  const p = Math.min(1, Math.max(0, progress))
  return (
    <div className="timeline" style={{ '--p': p } as CSSProperties} aria-hidden>
      <div className="timeline__track">
        <div className="timeline__ticks">
          {TICKS.map((i) => {
            const frac = i / (TICKS.length - 1)
            const major = i % 6 === 0
            const passed = frac <= p + 0.005
            return (
              <span
                key={i}
                className="timeline__tick"
                data-major={major || undefined}
                data-passed={passed || undefined}
              />
            )
          })}
        </div>
        <div className="timeline__bar" />
        <div className="timeline__needle" />
      </div>
      <div className="timeline__anchors t-label num">
        <span>{startLabel}</span>
        <span>{endLabel}</span>
      </div>
    </div>
  )
}
