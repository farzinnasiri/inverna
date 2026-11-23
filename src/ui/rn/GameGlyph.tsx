import Svg, { Circle, Line, Path, Rect } from 'react-native-svg'
import type { GameId } from '@/core/games/catalog'
import { useTokenColors } from '@/ui/hooks/useTokenColors'

/**
 * Crisp 2-tone Watchmaker Ink & Brass geometric SVG marks for all 13 games
 * (powered by react-native-svg — renders identically on iOS, Android, and Web).
 */
export function GameGlyph({ id, size = 30 }: { id: GameId; size?: number }) {
  const { color, pieces } = useTokenColors()

  switch (id) {
    case 'settle':
      return (
        <Svg width={size} height={size} viewBox="0 0 32 32">
          <Rect x="4" y="20" width="7" height="7" rx="1.8" fill={color.ink4} />
          <Rect x="12.5" y="20" width="7" height="7" rx="1.8" fill={color.ink4} />
          <Rect x="21" y="20" width="7" height="7" rx="1.8" fill={pieces.ochre} />
          <Rect x="21" y="11.5" width="7" height="7" rx="1.8" fill={pieces.ochre} />
          <Rect x="12.5" y="4" width="7" height="7" rx="1.8" fill={pieces.clay} />
          <Rect x="4" y="11.5" width="7" height="7" rx="1.8" fill={pieces.clay} />
          <Rect x="12.5" y="11.5" width="7" height="7" rx="1.8" fill={pieces.clay} />
        </Svg>
      )
    case 'cascade':
      return (
        <Svg width={size} height={size} viewBox="0 0 32 32">
          <Rect x="4" y="4" width="7" height="7" rx="1.6" fill={pieces.clay} />
          <Rect x="12.5" y="4" width="7" height="7" rx="1.6" fill={pieces.straw} />
          <Rect x="21" y="4" width="7" height="7" rx="1.6" fill={pieces.straw} />
          <Rect x="4" y="12.5" width="7" height="7" rx="1.6" fill={pieces.clay} />
          <Rect x="13" y="14" width="7" height="7" rx="1.6" fill={pieces.ochre} rotation={14} origin="16.5, 17.5" />
          <Rect x="21.5" y="19.5" width="7" height="7" rx="1.6" fill={pieces.sage} rotation={-18} origin="25, 23" />
          <Rect x="5" y="22" width="7" height="7" rx="1.6" fill={pieces.bone} rotation={24} origin="8.5, 25.5" />
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
      return (
        <Svg width={size} height={size} viewBox="0 0 32 32">
          <Rect x="4" y="4" width="10.5" height="10.5" rx="2.5" fill={color.surface3} />
          <Rect x="17.5" y="4" width="10.5" height="10.5" rx="2.5" fill={color.ink4} />
          <Rect x="4" y="17.5" width="10.5" height="10.5" rx="2.5" fill={pieces.ochre} />
          <Rect x="17.5" y="17.5" width="10.5" height="10.5" rx="2.5" fill={pieces.bone} />
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
      return (
        <Svg width={size} height={size} viewBox="0 0 32 32" fill="none">
          <Rect x="4" y="4" width="10.5" height="10.5" rx="2.5" fill={color.ink4} />
          <Rect x="17.5" y="4" width="10.5" height="10.5" rx="2.5" fill={pieces.clay} />
          <Rect x="4" y="17.5" width="10.5" height="10.5" rx="2.5" fill={pieces.ochre} />
          <Rect x="18.25" y="18.25" width="9" height="9" rx="2" stroke={color.ink4} strokeWidth={1.4} strokeDasharray="2.5 2" />
        </Svg>
      )
    case 'nine':
      return (
        <Svg width={size} height={size} viewBox="0 0 32 32" fill="none">
          <Rect x="4.5" y="4.5" width="23" height="23" rx="3.5" stroke={color.ink4} strokeWidth={1.4} />
          <Path d="M12.2 4.5 V27.5 M19.8 4.5 V27.5 M4.5 12.2 H27.5 M4.5 19.8 H27.5" stroke={color.ink4} strokeWidth={1} />
          <Circle cx="8.4" cy="8.4" r="2" fill={pieces.ochre} />
          <Circle cx="16" cy="16" r="2" fill={pieces.bone} />
          <Circle cx="23.6" cy="23.6" r="2" fill={pieces.straw} />
        </Svg>
      )
    case 'weave':
      return (
        <Svg width={size} height={size} viewBox="0 0 32 32">
          <Rect x="12.5" y="4" width="7" height="7" rx="1.6" fill={pieces.ochre} />
          <Rect x="4" y="12.5" width="7" height="7" rx="1.6" fill={pieces.straw} />
          <Rect x="12.5" y="12.5" width="7" height="7" rx="1.6" fill={pieces.straw} />
          <Rect x="21" y="12.5" width="7" height="7" rx="1.6" fill={pieces.straw} />
          <Rect x="12.5" y="21" width="7" height="7" rx="1.6" fill={color.ink3} />
        </Svg>
      )
    case 'patience':
      return (
        <Svg width={size} height={size} viewBox="0 0 32 32" fill="none">
          <Rect x="6" y="5" width="13.5" height="19" rx="2.8" fill={color.surface3} stroke={color.ink4} strokeWidth={1.2} />
          <Rect x="12.5" y="8" width="13.5" height="19" rx="2.8" fill={color.surface2} stroke={color.ink3} strokeWidth={1.2} />
          <Path d="M19.25 14 L22 17.5 L19.25 21 L16.5 17.5 Z" fill={pieces.sage} />
        </Svg>
      )
    case 'lanterns':
      return (
        <Svg width={size} height={size} viewBox="0 0 32 32" fill="none">
          <Rect x="5" y="8" width="9.5" height="16" rx="4.75" fill={pieces.rosewood} />
          <Rect x="17.5" y="8" width="9.5" height="16" rx="4.75" fill={pieces.ochre} />
          <Circle cx="9.75" cy="16" r="2.1" fill={pieces.bone} />
          <Circle cx="22.25" cy="16" r="2.1" fill={color.accentInk} />
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
