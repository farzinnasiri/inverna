import {
  BedDouble,
  BookOpen,
  CloudMoon,
  CloudRain,
  Compass,
  Disc3,
  Feather,
  Flame,
  Heart,
  Leaf,
  Moon,
  Mountain,
  Music2,
  Orbit,
  Shell,
  Snowflake,
  Star,
  Trees,
  Waves,
  Wind,
} from 'lucide-react-native'
import { presetById, type SoundIconId } from '@/core/sound/catalog'

/**
 * Icons for every sound: the presets' and the extra ones for sounds people make.
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
    case 'leaf':
      return <Leaf size={size} strokeWidth={sw} color={color} />
    case 'mountain':
      return <Mountain size={size} strokeWidth={sw} color={color} />
    case 'snow':
      return <Snowflake size={size} strokeWidth={sw} color={color} />
    case 'cloud-moon':
      return <CloudMoon size={size} strokeWidth={sw} color={color} />
    case 'star':
      return <Star size={size} strokeWidth={sw} color={color} />
    case 'heart':
      return <Heart size={size} strokeWidth={sw} color={color} />
    case 'shell':
      return <Shell size={size} strokeWidth={sw} color={color} />
    case 'bed':
      return <BedDouble size={size} strokeWidth={sw} color={color} />
  }
}
