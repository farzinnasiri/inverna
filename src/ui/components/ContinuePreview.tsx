import { readJSON } from '@/core/storage'
import type { GameId } from '@/core/games/catalog'

const KINDLE_RAMP: Record<number, string> = {
  2: '#171A20',
  4: '#20252E',
  8: '#2A3442',
  16: '#364B5E',
  32: '#3E6157',
  64: '#585275',
  128: '#87434B',
  256: '#9E7F43',
  512: '#B89450',
  1024: '#C9B07C',
  2048: '#DCE0E6',
}

const STONE_VAR: Record<string, string> = {
  ember: 'var(--p-clay)',
  saffron: 'var(--p-ochre)',
  honey: 'var(--p-straw)',
  moss: 'var(--p-sage)',
  clay: 'var(--p-rosewood)',
  rose: 'var(--p-stone)',
  sand: 'var(--p-bone)',
}

/** Static miniature preview of a saved board for the 2-wide Continue tile (and onboarding preview). */
export function ContinuePreview({ id, demo }: { id: GameId; demo?: boolean }) {
  if (demo || id === 'kindle') {
    const grid = Array<number>(16).fill(0)
    if (demo) {
      grid[5] = 4
      grid[6] = 16
      grid[9] = 8
      grid[10] = 64
      grid[12] = 2
      grid[13] = 32
      grid[14] = 128
      grid[15] = 16
    } else {
      const save = readJSON<{ state?: { tiles?: { row: number; col: number; value: number }[] } }>('game:kindle', {})
      const tiles = save.state?.tiles
      if (!tiles || tiles.length === 0) return null
      for (const t of tiles) {
        if (t.row >= 0 && t.row < 4 && t.col >= 0 && t.col < 4) grid[t.row * 4 + t.col] = t.value
      }
    }
    return (
      <div className="mini-board mini-board--kindle" aria-hidden>
        {grid.map((v, i) => (
          <span
            key={i}
            className="mini-cell"
            style={{ background: v ? (KINDLE_RAMP[Math.min(2048, v)] ?? KINDLE_RAMP[2048]) : 'var(--c-surface-1)' }}
          />
        ))}
      </div>
    )
  }

  if (id === 'hue') {
    const save = readJSON<{ state?: { cols?: number; rows?: number; tiles?: { color: string }[] } }>('game:hue', {})
    const tiles = save.state?.tiles
    const cols = save.state?.cols ?? 5
    const rows = save.state?.rows ?? 6
    if (!tiles || tiles.length === 0) return null
    return (
      <div
        className="mini-board mini-board--hue"
        style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)` }}
        aria-hidden
      >
        {tiles.slice(0, cols * rows).map((t, i) => (
          <span key={i} className="mini-cell" style={{ background: t.color }} />
        ))}
      </div>
    )
  }

  if (id === 'settle') {
    const save = readJSON<{ state?: { board?: (string | null)[][] } }>('game:settle', {})
    const board = save.state?.board
    if (!board || board.length < 10) return null
    const bottom = board.slice(-8)
    return (
      <div className="mini-board mini-board--settle" aria-hidden>
        {bottom.flatMap((row, r) =>
          row.map((cell, c) => (
            <span
              key={`${r}-${c}`}
              className="mini-cell"
              style={{ background: cell ? (STONE_VAR[cell] ?? 'var(--p-clay)') : 'var(--c-surface-1)' }}
            />
          )),
        )}
      </div>
    )
  }

  if (id === 'thread') {
    const save = readJSON<{
      state?: { size?: number; pairs?: { color: string; a: { row: number; col: number }; b: { row: number; col: number } }[] }
    }>('game:thread', {})
    const size = save.state?.size
    const pairs = save.state?.pairs
    if (!size || !pairs) return null
    const cells = Array<string | null>(size * size).fill(null)
    for (const p of pairs) {
      cells[p.a.row * size + p.a.col] = STONE_VAR[p.color] ?? 'var(--p-ochre)'
      cells[p.b.row * size + p.b.col] = STONE_VAR[p.color] ?? 'var(--p-ochre)'
    }
    return (
      <div
        className="mini-board mini-board--thread"
        style={{ gridTemplateColumns: `repeat(${size}, 1fr)`, gridTemplateRows: `repeat(${size}, 1fr)` }}
        aria-hidden
      >
        {cells.map((bg, i) => (
          <span
            key={i}
            className="mini-dot"
            style={{ background: bg ?? 'var(--c-ink-4)', opacity: bg ? 1 : 0.25 }}
          />
        ))}
      </div>
    )
  }

  if (id === 'cascade') {
    const save = readJSON<{
      state?: { cols?: number; rows?: number; tiles?: { row: number; col: number; color: string }[] }
    }>('game:cascade', {})
    const tiles = save.state?.tiles
    const cols = save.state?.cols ?? 9
    const rows = save.state?.rows ?? 11
    if (!tiles || tiles.length === 0) return null
    const grid = Array<string | null>(cols * rows).fill(null)
    for (const t of tiles) {
      if (t.row >= 0 && t.row < rows && t.col >= 0 && t.col < cols) {
        grid[t.row * cols + t.col] = `var(--p-${t.color})`
      }
    }
    return (
      <div
        className="mini-board mini-board--hue"
        style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)` }}
        aria-hidden
      >
        {grid.map((bg, i) => (
          <span key={i} className="mini-cell" style={{ background: bg ?? 'var(--c-bg)' }} />
        ))}
      </div>
    )
  }

  return null
}
