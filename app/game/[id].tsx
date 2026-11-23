import { useLocalSearchParams, useRouter } from 'expo-router'
import { GAMES, type GameId } from '@/core/games/catalog'
import { GAME_SCREENS } from '@/ui/rn/games/registry'

export default function GameRoute() {
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()
  const validId = (GAMES.find((g) => g.id === id)?.id ?? 'settle') as GameId
  const Screen = GAME_SCREENS[validId]

  const handleExit = () => {
    if (router.canGoBack()) {
      router.back()
    } else {
      router.replace('/')
    }
  }

  return <Screen onExit={handleExit} />
}
