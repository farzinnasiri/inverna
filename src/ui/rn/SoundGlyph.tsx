import {
  BookOpen,
  CloudRain,
  Compass,
  Disc3,
  Feather,
  Flame,
  Moon,
  Music2,
  Orbit,
  Trees,
  Waves,
  Wind,
} from 'lucide-react-native'
import { presetById, type SoundIconId } from '@/core/sound/catalog'

/**
 * Shared bespoke icon set for all 12 Lull soundscape signatures.
 * Strictly zero generic AI sparkle icons anywhere.
 */
export function SoundGlyph({
  id,
  icon,
  size = 16,
  color,
}: {
  id?: string
  icon?: SoundIconId
  size?: number
  color: string
}) {
  const resolved: SoundIconId = icon ?? presetById(id)?.icon ?? 'wind'
  const sw = 1.65

  switch (resolved) {
    case 'rain':
      return <CloudRain size={size} strokeWidth={sw} color={color} />
    case 'piano':
      return <Music2 size={size} strokeWidth={sw} color={color} />
    case 'fire':
      return <Flame size={size} strokeWidth={sw} color={color} />
    case 'waves':
      return <Waves size={size} strokeWidth={sw} color={color} />
    case 'moon':
      return <Moon size={size} strokeWidth={sw} color={color} />
    case 'wind':
      return <Wind size={size} strokeWidth={sw} color={color} />
    case 'feather':
      return <Feather size={size} strokeWidth={sw} color={color} />
    case 'disc':
      return <Disc3 size={size} strokeWidth={sw} color={color} />
    case 'orbit':
      return <Orbit size={size} strokeWidth={sw} color={color} />
    case 'book':
      return <BookOpen size={size} strokeWidth={sw} color={color} />
    case 'trees':
      return <Trees size={size} strokeWidth={sw} color={color} />
    case 'compass':
      return <Compass size={size} strokeWidth={sw} color={color} />
  }
}
