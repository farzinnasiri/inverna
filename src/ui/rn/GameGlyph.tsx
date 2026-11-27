import Svg, { Circle, Line, Path, Rect, Text as SvgText } from 'react-native-svg'
import type { GameId } from '@/core/games/catalog'
import { useTokenColors } from '@/ui/hooks/useTokenColors'

/**
 * A tiny picture of each game's own board (falling blocks, a sudoku grid,
 * numbered tiles...), so people find "the falling-blocks one" by sight
 * rather than by remembering its name. Same palette as the games.
 */
export function GameGlyph({ id, size = 30 }: { id: GameId; size?: number }) {
  const { color, pieces } = useTokenColors()

  switch (id) {
    case 'kumiko':
      // Endless Japanese joinery: interlocking arcs and a 45° mitered diamond lit in brass.
      return (
        <Svg width={size} height={size} viewBox="0 0 32 32" fill="none">
          <Path d="M16 4 L28 16 L16 28 L4 16 Z" stroke={color.ink4} strokeWidth={1.3} strokeLinejoin="round" />
          <Path d="M10 10 A6 6 0 0 1 16 16 A6 6 0 0 1 10 22" stroke={pieces.ochre} strokeWidth={1.8} strokeLinecap="round" />
          <Path d="M22 10 A6 6 0 0 0 16 16 A6 6 0 0 0 22 22" stroke={pieces.ochre} strokeWidth={1.8} strokeLinecap="round" />
          <Path d="M10 10 A6 6 0 0 0 16 4 A6 6 0 0 0 22 10" stroke={color.accent} strokeWidth={1.8} strokeLinecap="round" />
          <Circle cx="16" cy="16" r="2.1" fill={color.bg} stroke={color.accent} strokeWidth={1.3} />
        </Svg>
      )
    case 'settle':
      // Falling blocks: a piece coming down toward a stack with one gap.
      return (
        <Svg width={size} height={size} viewBox="0 0 32 32">
          <Rect x="11" y="2" width="5.5" height="5.5" rx="1.2" fill={pieces.ochre} />
          <Rect x="11" y="8" width="5.5" height="5.5" rx="1.2" fill={pieces.ochre} />
          <Rect x="17" y="8" width="5.5" height="5.5" rx="1.2" fill={pieces.ochre} />
          <Rect x="2" y="20" width="5.5" height="5.5" rx="1.2" fill={pieces.clay} />
          <Rect x="2" y="26" width="5.5" height="5.5" rx="1.2" fill={pieces.clay} />
          <Rect x="8" y="26" width="5.5" height="5.5" rx="1.2" fill={color.ink4} />
          <Rect x="14" y="26" width="5.5" height="5.5" rx="1.2" fill={color.ink4} />
          <Rect x="26" y="20" width="5.5" height="5.5" rx="1.2" fill={pieces.sage} />
          <Rect x="26" y="26" width="5.5" height="5.5" rx="1.2" fill={pieces.sage} />
        </Svg>
      )
    case 'cascade':
      return (
        <Svg width={size} height={size} viewBox="0 0 32 32">
          <Rect x="4" y="4" width="7" height="7" rx="1.6" fill={pieces.clay} />
          <Rect x="12.5" y="4" width="7" height="7" rx="1.6" fill={pieces.straw} />
          <Rect x="21" y="4" width="7" height="7" rx="1.6" fill={pieces.straw} />
          <Rect x="4" y="12.5" width="7" height="7" rx="1.6" fill={pieces.clay} />
          <Rect x="13" y="14" width="7" height="7" rx="1.6" fill={pieces.ochre} transform="rotate(14 16.5 17.5)" />
          <Rect x="21.5" y="19.5" width="7" height="7" rx="1.6" fill={pieces.sage} transform="rotate(-18 25 23)" />
          <Rect x="5" y="22" width="7" height="7" rx="1.6" fill={pieces.bone} transform="rotate(24 8.5 25.5)" />
        </Svg>
      )
    case 'hue':
      return (
        <Svg width={size} height={size} viewBox="0 0 32 32">
          <Rect x="4" y="4" width="7" height="7" rx="1.8" fill={pieces.bone} />
          <Rect x="12.5" y="4" width="7" height="7" rx="1.8" fill={pieces.ochre} />
          <Rect x="21" y="4" width="7" height="7" rx="1.8" fill={pieces.sage} />
          <Rect x="4" y="12.5" width="7" height="7" rx="1.8" fill={pieces.stone} />
          <Rect x="12.5" y="12.5" width="7" height="7" rx="1.8" fill={pieces.straw} />
          <Rect x="21" y="12.5" width="7" height="7" rx="1.8" fill={pieces.rosewood} />
          <Rect x="4" y="21" width="7" height="7" rx="1.8" fill={pieces.clay} />
          <Rect x="12.5" y="21" width="7" height="7" rx="1.8" fill={color.ink4} />
          <Rect x="21" y="21" width="7" height="7" rx="1.8" fill={color.surface3} />
        </Svg>
      )
    case 'thread':
      return (
        <Svg width={size} height={size} viewBox="0 0 32 32" fill="none">
          <Path d="M8 9 H21 A3 3 0 0 1 24 12 V23" stroke={pieces.ochre} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" opacity={0.7} />
          <Path d="M8 23 V16 H16 V23" stroke={pieces.straw} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" opacity={0.75} />
          <Circle cx="8" cy="9" r="3" fill={pieces.ochre} />
          <Circle cx="24" cy="23" r="3" fill={pieces.ochre} />
          <Rect x="5.5" y="20.5" width="5" height="5" rx="1.2" fill={pieces.straw} />
          <Rect x="13.5" y="20.5" width="5" height="5" rx="1.2" fill={pieces.straw} />
        </Svg>
      )
    case 'kindle':
      // 2048: numbered tiles that merge.
      return (
        <Svg width={size} height={size} viewBox="0 0 32 32">
          <Rect x="3" y="3" width="12" height="12" rx="2.6" fill={color.surface3} />
          <Rect x="17" y="3" width="12" height="12" rx="2.6" fill={pieces.straw} />
          <Rect x="3" y="17" width="12" height="12" rx="2.6" fill={pieces.ochre} />
          <Rect x="17" y="17" width="12" height="12" rx="2.6" fill={pieces.clay} />
          <SvgText x="23" y="12.6" fontSize="9" fontWeight="700" textAnchor="middle" fill={color.accentInk}>4</SvgText>
          <SvgText x="9" y="26.6" fontSize="9" fontWeight="700" textAnchor="middle" fill={color.accentInk}>8</SvgText>
          <SvgText x="23" y="26.2" fontSize="7.5" fontWeight="700" textAnchor="middle" fill={color.accentInk}>16</SvgText>
        </Svg>
      )
    case 'pond':
      return (
        <Svg width={size} height={size} viewBox="0 0 32 32" fill="none">
          <Circle cx="16" cy="16" r="11.5" stroke={color.ink4} strokeWidth={1.2} />
          <Circle cx="16" cy="16" r="7.5" stroke={pieces.clay} strokeWidth={1.2} />
          <Path d="M10.5 20 C12.5 13, 18.5 11, 22 12.5 C20.5 17, 15 19, 10.5 20 Z" fill={pieces.bone} />
          <Circle cx="18" cy="14" r="1.4" fill={pieces.ochre} />
        </Svg>
      )
    case 'drift':
      // Sliding tiles: a 3 by 3 board with one empty slot.
      return (
        <Svg width={size} height={size} viewBox="0 0 32 32" fill="none">
          <Rect x="2.5" y="2.5" width="8.4" height="8.4" rx="1.8" fill={pieces.clay} />
          <Rect x="11.8" y="2.5" width="8.4" height="8.4" rx="1.8" fill={pieces.clay} />
          <Rect x="21.1" y="2.5" width="8.4" height="8.4" rx="1.8" fill={pieces.ochre} />
          <Rect x="2.5" y="11.8" width="8.4" height="8.4" rx="1.8" fill={color.ink4} />
          <Rect x="11.8" y="11.8" width="8.4" height="8.4" rx="1.8" fill={pieces.ochre} />
          <Rect x="21.1" y="11.8" width="8.4" height="8.4" rx="1.8" fill={color.ink4} />
          <Rect x="2.5" y="21.1" width="8.4" height="8.4" rx="1.8" fill={pieces.straw} />
          <Rect x="11.8" y="21.1" width="8.4" height="8.4" rx="1.8" fill={pieces.straw} />
          <Rect x="21.6" y="21.6" width="7.4" height="7.4" rx="1.6" stroke={color.ink4} strokeWidth={1.1} strokeDasharray="2 1.8" />
        </Svg>
      )
    case 'nine':
      // Sudoku: a 3 by 3 grid with digits.
      return (
        <Svg width={size} height={size} viewBox="0 0 32 32" fill="none">
          <Rect x="3.5" y="3.5" width="25" height="25" rx="3.5" stroke={color.ink4} strokeWidth={1.4} />
          <Path d="M11.8 3.5 V28.5 M20.2 3.5 V28.5 M3.5 11.8 H28.5 M3.5 20.2 H28.5" stroke={color.ink4} strokeWidth={1} />
          <SvgText x="7.7" y="10.4" fontSize="7" fontWeight="700" textAnchor="middle" fill={pieces.ochre}>5</SvgText>
          <SvgText x="16" y="18.8" fontSize="7" fontWeight="700" textAnchor="middle" fill={color.ink}>3</SvgText>
          <SvgText x="24.3" y="10.4" fontSize="7" fontWeight="700" textAnchor="middle" fill={color.ink2}>9</SvgText>
          <SvgText x="24.3" y="27.2" fontSize="7" fontWeight="700" textAnchor="middle" fill={pieces.ochre}>8</SvgText>
        </Svg>
      )
    case 'weave':
      // Nonogram: clue numbers along the edges, a picture filling in.
      return (
        <Svg width={size} height={size} viewBox="0 0 32 32">
          <SvgText x="15" y="6" fontSize="5.5" fontWeight="700" textAnchor="middle" fill={color.ink3}>1</SvgText>
          <SvgText x="21.5" y="6" fontSize="5.5" fontWeight="700" textAnchor="middle" fill={color.ink3}>3</SvgText>
          <SvgText x="28" y="6" fontSize="5.5" fontWeight="700" textAnchor="middle" fill={color.ink3}>1</SvgText>
          <SvgText x="5" y="14.5" fontSize="5.5" fontWeight="700" textAnchor="middle" fill={color.ink3}>1</SvgText>
          <SvgText x="5" y="21" fontSize="5.5" fontWeight="700" textAnchor="middle" fill={color.ink3}>3</SvgText>
          <SvgText x="5" y="27.5" fontSize="5.5" fontWeight="700" textAnchor="middle" fill={color.ink3}>1</SvgText>
          <Rect x="12" y="9" width="6" height="6" rx="1" fill={color.surface3} />
          <Rect x="18.5" y="9" width="6" height="6" rx="1" fill={pieces.ochre} />
          <Rect x="25" y="9" width="6" height="6" rx="1" fill={color.surface3} />
          <Rect x="12" y="15.5" width="6" height="6" rx="1" fill={pieces.straw} />
          <Rect x="18.5" y="15.5" width="6" height="6" rx="1" fill={pieces.straw} />
          <Rect x="25" y="15.5" width="6" height="6" rx="1" fill={pieces.straw} />
          <Rect x="12" y="22" width="6" height="6" rx="1" fill={color.surface3} />
          <Rect x="18.5" y="22" width="6" height="6" rx="1" fill={pieces.ochre} />
          <Rect x="25" y="22" width="6" height="6" rx="1" fill={color.surface3} />
        </Svg>
      )
    case 'dim':
      return (
        <Svg width={size} height={size} viewBox="0 0 32 32" fill="none">
          <Rect x="4" y="4" width="7" height="7" rx="1.8" fill={color.surface3} />
          <Rect x="12.5" y="4" width="7" height="7" rx="1.8" fill={color.accent} opacity={0.9} />
          <Rect x="21" y="4" width="7" height="7" rx="1.8" fill={color.surface3} />
          <Rect x="4" y="12.5" width="7" height="7" rx="1.8" fill={color.accent} opacity={0.9} />
          <Rect x="12.5" y="12.5" width="7" height="7" rx="1.8" fill={color.accent} />
          <Rect x="21" y="12.5" width="7" height="7" rx="1.8" fill={color.accent} opacity={0.9} />
          <Rect x="4" y="21" width="7" height="7" rx="1.8" fill={color.surface3} />
          <Rect x="12.5" y="21" width="7" height="7" rx="1.8" fill={color.accent} opacity={0.9} />
          <Rect x="21" y="21" width="7" height="7" rx="1.8" fill={color.ink4} />
        </Svg>
      )
    case 'lanterns':
      // Memory pairs: two cards turned up and matching, two still face down.
      return (
        <Svg width={size} height={size} viewBox="0 0 32 32" fill="none">
          <Rect x="3" y="3" width="12" height="12" rx="2.4" fill={color.surface3} stroke={color.ink4} strokeWidth={0.8} />
          <Rect x="17" y="3" width="12" height="12" rx="2.4" fill={pieces.rosewood} />
          <Rect x="3" y="17" width="12" height="12" rx="2.4" fill={pieces.rosewood} />
          <Rect x="17" y="17" width="12" height="12" rx="2.4" fill={color.surface3} stroke={color.ink4} strokeWidth={0.8} />
          <Path d="M23 6.2 C25.2 8.2 25.2 10.4 23 12.4 C20.8 10.4 20.8 8.2 23 6.2 Z" fill={pieces.bone} />
          <Path d="M9 20.2 C11.2 22.2 11.2 24.4 9 26.4 C6.8 24.4 6.8 22.2 9 20.2 Z" fill={pieces.bone} />
          <Circle cx="9" cy="9" r="1.2" fill={color.ink4} />
          <Circle cx="23" cy="23" r="1.2" fill={color.ink4} />
        </Svg>
      )
    case 'rally':
      return (
        <Svg width={size} height={size} viewBox="0 0 32 32" fill="none">
          <Rect x="11" y="5" width="10" height="3" rx="1.5" fill={pieces.clay} />
          <Line x1="6" y1="16" x2="26" y2="16" stroke={color.ink4} strokeWidth={1.2} strokeDasharray="3 3" />
          <Circle cx="19" cy="12" r="2.5" fill={pieces.ochre} />
          <Rect x="10" y="24" width="12" height="3" rx="1.5" fill={pieces.bone} />
        </Svg>
      )
    case 'chime':
      return (
        <Svg width={size} height={size} viewBox="0 0 32 32" fill="none">
          <Rect x="4" y="5" width="7" height="4" rx="1.2" fill={pieces.sage} />
          <Rect x="12.5" y="5" width="7" height="4" rx="1.2" fill={pieces.ochre} />
          <Rect x="21" y="5" width="7" height="4" rx="1.2" fill={pieces.straw} />
          <Rect x="4" y="10.5" width="7" height="4" rx="1.2" fill={pieces.clay} />
          <Rect x="21" y="10.5" width="7" height="4" rx="1.2" fill={pieces.rosewood} />
          <Circle cx="16" cy="18.5" r="2.3" fill={pieces.ochre} />
          <Rect x="10" y="24.5" width="12" height="3" rx="1.5" fill={pieces.bone} />
        </Svg>
      )
  }
}
