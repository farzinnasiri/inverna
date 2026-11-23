import type { CSSProperties } from 'react'

const EMBERS = [
  { left: '22%', dur: '17s', delay: '-3s', dx: '14px' },
  { left: '38%', dur: '14s', delay: '-9s', dx: '-10px' },
  { left: '51%', dur: '19s', delay: '-5s', dx: '18px' },
  { left: '64%', dur: '15s', delay: '-12s', dx: '-14px' },
  { left: '76%', dur: '21s', delay: '-2s', dx: '10px' },
]

/**
 * The setting sun on the horizon — Lull's signature visual.
 * `set` (0..1) sinks the sun gently below the hairline horizon as a wind-down
 * session progresses. Even at rest it breathes at 6 breaths per minute.
 */
export function Horizon({ set = 0 }: { set?: number }) {
  return (
    <div className="horizon" style={{ ['--set' as string]: set }} aria-hidden>
      <div className="horizon__sky" />
      <div className="horizon__stage">
        <div className="horizon__sun-clip">
          <div className="horizon__sun" />
        </div>
        <div className="horizon__embers">
          {EMBERS.map((e, i) => (
            <span
              key={i}
              className="horizon__ember"
              style={
                {
                  left: e.left,
                  '--dur': e.dur,
                  '--delay': e.delay,
                  '--dx': e.dx,
                } as CSSProperties
              }
            />
          ))}
        </div>
      </div>
      <div className="horizon__line" />
      <div className="horizon__water">
        <span className="horizon__shimmer" style={{ width: 136, ['--o' as string]: 0.52 }} />
        <span className="horizon__shimmer" style={{ width: 88, ['--o' as string]: 0.34, animationDelay: '-3.2s' }} />
        <span className="horizon__shimmer" style={{ width: 46, ['--o' as string]: 0.2, animationDelay: '-6.5s' }} />
      </div>
    </div>
  )
}
