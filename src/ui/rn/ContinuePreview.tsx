import { StyleSheet, View } from 'react-native'
import Svg, { Circle, Rect } from 'react-native-svg'
import type { GameId } from '@/core/games/catalog'
import { readJSON } from '@/core/storage'
import { useTokenColors } from '@/ui/hooks/useTokenColors'

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

/** Static native SVG miniature preview of a saved board (Play's lead tile). */
export function ContinuePreview({ id, demo, size = 48 }: { id: GameId; demo?: boolean; size?: number }) {
  const { color, pieces } = useTokenColors()

  const stoneColor = (key: string): string => {
    const map: Record<string, string> = {
      ember: pieces.clay,
      saffron: pieces.ochre,
      honey: pieces.straw,
      moss: pieces.sage,
      clay: pieces.rosewood,
      rose: pieces.stone,
      sand: pieces.bone,
      ochre: pieces.ochre,
      straw: pieces.straw,
      sage: pieces.sage,
      bone: pieces.bone,
    }
    return map[key] ?? pieces.clay
  }

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
      <View style={[styles.wrap, { width: size, height: size, backgroundColor: color.bg }]}>
        <Svg width={size - 6} height={size - 6} viewBox="0 0 42 42">
          {grid.map((v, i) => {
            const r = Math.floor(i / 4)
            const c = i % 4
            return (
              <Rect
                key={i}
                x={c * 10.7}
                y={r * 10.7}
                width={9.2}
                height={9.2}
                rx={2}
                fill={v ? (KINDLE_RAMP[Math.min(2048, v)] ?? KINDLE_RAMP[2048]) : color.surface1}
              />
            )
          })}
        </Svg>
      </View>
    )
  }

  if (id === 'hue') {
    const save = readJSON<{ state?: { cols?: number; rows?: number; tiles?: { color: string }[] } }>('game:hue', {})
    const tiles = save.state?.tiles
    const cols = save.state?.cols ?? 5
    const rows = save.state?.rows ?? 6
    if (!tiles || tiles.length === 0) return null
    const inner = size - 6
    const cw = inner / cols
    const ch = inner / rows
    return (
      <View style={[styles.wrap, { width: size, height: size, backgroundColor: color.bg }]}>
        <Svg width={inner} height={inner}>
          {tiles.slice(0, cols * rows).map((t, i) => (
            <Rect
              key={i}
              x={(i % cols) * cw + 0.5}
              y={Math.floor(i / cols) * ch + 0.5}
              width={Math.max(1, cw - 1)}
              height={Math.max(1, ch - 1)}
              rx={1.2}
              fill={t.color}
            />
          ))}
        </Svg>
      </View>
    )
  }

  if (id === 'cascade') {
    // The board is rows of standing tiles (or gaps); there was never a `tiles` list (ISS-17).
    const save = readJSON<{
      state?: { cols?: number; rows?: number; board?: ({ row: number; col: number; color: string } | null)[][] }
    }>('game:cascade', {})
    const board = save.state?.board
    const tiles = Array.isArray(board)
      ? board.flatMap((r) => (Array.isArray(r) ? r : [])).filter((t): t is { row: number; col: number; color: string } => Boolean(t))
      : null
    const cols = save.state?.cols ?? 9
    const rows = save.state?.rows ?? 11
    if (!tiles || tiles.length === 0) return null
    const inner = size - 6
    const cw = inner / cols
    const ch = inner / rows
    return (
      <View style={[styles.wrap, { width: size, height: size, backgroundColor: color.bg }]}>
        <Svg width={inner} height={inner}>
          {tiles.map((t, i) => (
            <Rect
              key={i}
              x={t.col * cw + 0.4}
              y={t.row * ch + 0.4}
              width={Math.max(1, cw - 0.8)}
              height={Math.max(1, ch - 0.8)}
              rx={0.8}
              fill={stoneColor(t.color)}
            />
          ))}
        </Svg>
      </View>
    )
  }

  if (id === 'thread') {
    const save = readJSON<{
      state?: { size?: number; pairs?: { color: string; a: { row: number; col: number }; b: { row: number; col: number } }[] }
    }>('game:thread', {})
    const n = save.state?.size
    const pairs = save.state?.pairs
    if (!n || !pairs) return null
    const inner = size - 6
    const step = inner / n
    return (
      <View style={[styles.wrap, { width: size, height: size, backgroundColor: color.bg }]}>
        <Svg width={inner} height={inner}>
          {pairs.flatMap((p, idx) => [
            <Circle key={`a-${idx}`} cx={(p.a.col + 0.5) * step} cy={(p.a.row + 0.5) * step} r={step * 0.28} fill={stoneColor(p.color)} />,
            <Circle key={`b-${idx}`} cx={(p.b.col + 0.5) * step} cy={(p.b.row + 0.5) * step} r={step * 0.28} fill={stoneColor(p.color)} />,
          ])}
        </Svg>
      </View>
    )
  }

  return null
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 9,
    padding: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
