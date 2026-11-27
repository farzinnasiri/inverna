/**
 * Pure React Native + SVG renderer for Kumiko.
 *
 * Watchmaker Ink & Brass OLED aesthetic:
 * - True `#000000` OLED ground, zero shadows, zero gradients, zero busy background rings
 * - Subtle drafting corner hairpins framing only the active band
 * - Three joinery stroke styles: quarter-circle arcs, 45° wooden miters, and shippō twin-arcs
 * - Live joint alignment warmth, antique brass closure sweep & expanding hairline ripple
 */
import { memo, useMemo } from 'react'
import { StyleSheet, View } from 'react-native'
import Svg, { Circle, G, Line, Path } from 'react-native-svg'
import {
  countAlignedJoints,
  KUMIKO_COLS,
  PORT_E,
  PORT_N,
  PORT_S,
  PORT_W,
  type DuskTone,
  type KumikoBand,
  type KumikoState,
  type KumikoTile,
} from '@/core/games/kumiko/engine'
import type { ResolvedTokens } from '@/design/tokens'

export interface KumikoRipple {
  id: number
  /** Column coordinate (0..5). */
  cx: number
  /** World row coordinate. */
  cy: number
  /** 0..1 animation progress. */
  progress: number
  isCrest: boolean
}

export interface KumikoBoardLayout {
  width: number
  height: number
  cell: number
  gridX: number
  baseBottomY: number
}

export function computeBoardLayout(
  width: number,
  height: number,
  chromeTop: number,
  chromeBottom: number,
): KumikoBoardLayout {
  const usableW = Math.max(240, Math.min(width - 24, 410))
  const cell = Math.floor(usableW / KUMIKO_COLS)
  const gridX = Math.floor((width - cell * KUMIKO_COLS) / 2)
  const baseBottomY = height - Math.max(chromeBottom, 28) - Math.round(cell * 0.9)
  return { width, height, cell, gridX, baseBottomY: Math.max(chromeTop + cell * 4, baseBottomY) }
}

export function worldRowToY(worldRow: number, scrollRow: number, layout: KumikoBoardLayout): number {
  return layout.baseBottomY - (worldRow - scrollRow) * layout.cell
}

/** Build the crisp SVG path string for a tile centered at (0,0) of width `cell`. */
function buildTilePath(tile: Pick<KumikoTile, 'kind' | 'baseMask' | 'canonicalParity'>, cell: number): string {
  const h = cell / 2
  const parts: string[] = []

  if (tile.kind === 'twin') {
    // Two non-crossing quarter-arcs (shippō joinery): parity 0 pairs N↔E & S↔W, parity 1 pairs E↔S & W↔N.
    if (tile.canonicalParity === 0) {
      parts.push(`M 0 ${-h} A ${h} ${h} 0 0 0 ${h} 0`)
      parts.push(`M 0 ${h} A ${h} ${h} 0 0 0 ${-h} 0`)
    } else {
      parts.push(`M ${h} 0 A ${h} ${h} 0 0 0 0 ${h}`)
      parts.push(`M ${-h} 0 A ${h} ${h} 0 0 0 0 ${-h}`)
    }
    return parts.join(' ')
  }

  const m = tile.baseMask
  const hasN = (m & PORT_N) !== 0
  const hasE = (m & PORT_E) !== 0
  const hasS = (m & PORT_S) !== 0
  const hasW = (m & PORT_W) !== 0
  const deg = (hasN ? 1 : 0) + (hasE ? 1 : 0) + (hasS ? 1 : 0) + (hasW ? 1 : 0)

  const corner = (x1: number, y1: number, x2: number, y2: number) =>
    tile.kind === 'miter'
      ? `M ${x1} ${y1} L ${x2} ${y2}`
      : `M ${x1} ${y1} A ${h} ${h} 0 0 0 ${x2} ${y2}`

  if (deg === 2) {
    if (hasN && hasS) parts.push(`M 0 ${-h} L 0 ${h}`)
    else if (hasE && hasW) parts.push(`M ${-h} 0 L ${h} 0`)
    else if (hasN && hasE) parts.push(corner(0, -h, h, 0))
    else if (hasE && hasS) parts.push(corner(h, 0, 0, h))
    else if (hasS && hasW) parts.push(corner(0, h, -h, 0))
    else if (hasW && hasN) parts.push(corner(-h, 0, 0, -h))
  } else if (deg === 3) {
    if (hasN && hasE) parts.push(corner(0, -h, h, 0))
    if (hasE && hasS) parts.push(corner(h, 0, 0, h))
    if (hasS && hasW) parts.push(corner(0, h, -h, 0))
    if (hasW && hasN) parts.push(corner(-h, 0, 0, -h))
  } else if (deg === 4) {
    parts.push(`M 0 ${-h} L 0 ${h}`)
    parts.push(`M ${-h} 0 L ${h} 0`)
  }
  return parts.join(' ')
}

function toneHex(tone: DuskTone, pieces: ResolvedTokens['pieces']): string {
  return pieces[tone]
}

export interface KumikoBoardProps {
  state: KumikoState
  layout: KumikoBoardLayout
  chromeTop: number
  visualDegs: Readonly<Record<string, number>>
  ripples: readonly KumikoRipple[]
  focusedKey: string | null
  color: ResolvedTokens['color']
  pieces: ResolvedTokens['pieces']
}

export const KumikoBoard = memo(function KumikoBoard({
  state,
  layout,
  chromeTop,
  visualDegs,
  ripples,
  focusedKey,
  color,
  pieces,
}: KumikoBoardProps) {
  const { width, height, cell, gridX } = layout
  const h = cell / 2

  const focusBandId = useMemo(() => {
    for (const b of state.bands) {
      if (!b.solved) return b.id
    }
    return -1
  }, [state.bands])

  // Subtle watchmaker drafting hairpins around only the lowest open band's corners.
  const hairpins = useMemo(() => {
    const band = state.bands.find((b) => b.id === focusBandId)
    if (!band) return []
    const pts = new Map<string, { x: number; y: number }>()
    for (const t of band.tiles) {
      const cy = worldRowToY(t.worldRow, state.scrollRow, layout)
      if (cy < chromeTop - cell || cy > height + cell) continue
      const cx = gridX + (t.c + 0.5) * cell
      for (const dx of [-h, h]) {
        for (const dy of [-h, h]) {
          const x = Math.round(cx + dx)
          const y = Math.round(cy + dy)
          pts.set(`${x},${y}`, { x, y })
        }
      }
    }
    return Array.from(pts.values())
  }, [state.bands, state.scrollRow, focusBandId, layout, chromeTop, cell, height, gridX, h])

  if (width <= 0 || height <= 0) return null

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: color.bg }]}>
      <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        {/* Quiet drafting hairpins around the active open weave */}
        <G opacity={0.22}>
          {hairpins.map((pt, i) => (
            <G key={i}>
              <Line x1={pt.x - 2.5} y1={pt.y} x2={pt.x + 2.5} y2={pt.y} stroke={color.ink4} strokeWidth={0.9} />
              <Line x1={pt.x} y1={pt.y - 2.5} x2={pt.x} y2={pt.y + 2.5} stroke={color.ink4} strokeWidth={0.9} />
            </G>
          ))}
        </G>

        {/* Endless vertical Kumiko bands */}
        {state.bands.map((band: KumikoBand) => {
          const isFocusBand = band.id === focusBandId
          const bandTone = toneHex(band.tone, pieces)
          return (
            <G key={band.id}>
              {band.tiles.map((tile) => {
                const ty = worldRowToY(tile.worldRow, state.scrollRow, layout)
                if (ty < chromeTop - cell * 0.8 || ty > height + cell * 0.8) return null

                const tx = gridX + (tile.c + 0.5) * cell
                const key = `${band.id}:${tile.r}:${tile.c}`
                const deg = visualDegs[key] ?? tile.targetDeg

                // Soft OLED fade at top and bottom viewport edges.
                let alpha = 1
                const topFadeStart = chromeTop + cell * 0.9
                if (ty < topFadeStart) {
                  alpha = Math.max(0, Math.min(1, (ty - (chromeTop - 10)) / (topFadeStart - (chromeTop - 10))))
                }
                const botFadeStart = height - cell * 1.05
                if (ty > botFadeStart) {
                  alpha = Math.min(alpha, Math.max(0, Math.min(1, (height - 8 - ty) / (height - 8 - botFadeStart))))
                }

                const isLatestKnot = tile.solved && tile.knotId === state.latestKnotId
                if (tile.solved && !isLatestKnot) alpha *= 0.44
                if (alpha <= 0.01) return null

                const aligned = !tile.solved ? countAlignedJoints(band, tile) : 0
                const stroke = tile.solved
                  ? isLatestKnot || tile.isCrest
                    ? color.accent
                    : bandTone
                  : aligned > 0
                    ? isFocusBand
                      ? color.ink
                      : color.ink2
                    : isFocusBand
                      ? color.ink2
                      : color.ink3

                const strokeWidth = tile.solved
                  ? isLatestKnot
                    ? 2.4
                    : 1.85
                  : aligned > 0
                    ? 2.2
                    : isFocusBand
                      ? 2.0
                      : 1.75

                const d = buildTilePath(tile, cell)
                const isFocused = focusedKey === key

                return (
                  <G key={key} opacity={alpha} transform={`translate(${tx}, ${ty})`}>
                    {isFocused && !tile.solved ? (
                      <Circle cx={0} cy={0} r={h * 0.48} fill="none" stroke={color.accentDim} strokeWidth={1} opacity={0.65} />
                    ) : null}

                    {/* Subtle brass halo wash strictly on the single newest brass knot */}
                    {isLatestKnot ? (
                      <G transform={`rotate(${deg})`} opacity={0.18}>
                        <Path
                          d={d}
                          fill="none"
                          stroke={color.accent}
                          strokeWidth={6.5}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </G>
                    ) : null}

                    {/* Main crisp watchmaker hairline joinery */}
                    <G transform={`rotate(${deg})`}>
                      <Path
                        d={d}
                        fill="none"
                        stroke={stroke}
                        strokeWidth={strokeWidth}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      {/* Small center collar on 4-way hubs and shippō twin-arc crossovers */}
                      {tile.kind === 'twin' ? (
                        <Circle
                          cx={0}
                          cy={0}
                          r={3.2}
                          fill={color.bg}
                          stroke={tile.solved ? stroke : color.accentDim}
                          strokeWidth={1.1}
                          opacity={tile.solved ? 0.85 : 0.7}
                        />
                      ) : tile.baseMask === 15 ? (
                        <Circle cx={0} cy={0} r={2.6} fill={color.bg} stroke={stroke} strokeWidth={1.1} />
                      ) : null}
                    </G>
                  </G>
                )
              })}
            </G>
          )
        })}

        {/* Expanding antique brass hairline ripples on knot / crest closure */}
        <G>
          {ripples.map((rp) => {
            const rx = gridX + rp.cx * cell
            const ry = worldRowToY(rp.cy, state.scrollRow, layout)
            const eased = 1 - Math.pow(1 - rp.progress, 3)
            const radius = 10 + eased * (rp.isCrest ? cell * 2.2 : cell * 1.45)
            const opacity = (1 - rp.progress) * (rp.isCrest ? 0.65 : 0.45)
            return (
              <G key={rp.id}>
                <Circle
                  cx={rx}
                  cy={ry}
                  r={radius}
                  fill="none"
                  stroke={color.accent}
                  strokeWidth={rp.isCrest ? 1.5 : 1.1}
                  opacity={opacity}
                />
                {rp.isCrest ? (
                  <Circle
                    cx={rx}
                    cy={ry}
                    r={radius * 0.68}
                    fill="none"
                    stroke={color.accent}
                    strokeWidth={1}
                    opacity={opacity * 0.7}
                  />
                ) : null}
              </G>
            )
          })}
        </G>
      </Svg>
    </View>
  )
})
