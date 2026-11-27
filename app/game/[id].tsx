import { Redirect, useLocalSearchParams, useRouter } from 'expo-router'
import { useUnlock } from '@/ui/state/unlock'
import { GAMES, type GameId } from '@/core/games/catalog'
import { GAME_SCREENS } from '@/ui/rn/games/registry'

export default function GameRoute() {
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()
  const validId = (GAMES.find((g) => g.id === id)?.id ?? 'settle') as GameId
  const Screen = GAME_SCREENS[validId]
  // A link straight to a game doesn't get round the purchase.
  const unlocked = useUnlock((s) => s.status === 'unlocked')

  const handleExit = () => {
    if (router.canGoBack()) {
      router.back()
    } else {
      router.replace('/')
    }
  }

  if (!unlocked) return <Redirect href="/" />
  return <Screen onExit={handleExit} />
}
