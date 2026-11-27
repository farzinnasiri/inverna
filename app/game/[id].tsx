import { useEffect } from 'react'
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router'
import { canPlayGame } from '@/core/access'
import { GAMES, gameMeta, type GameId } from '@/core/games/catalog'
import { GAME_SCREENS } from '@/ui/rn/games/registry'
import { useNav } from '@/ui/state/nav'
import { useUnlock, useIsUnlocked } from '@/ui/state/unlock'

export default function GameRoute() {
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()
  const validId = (GAMES.find((g) => g.id === id)?.id ?? 'settle') as GameId
  const Screen = GAME_SCREENS[validId]
  const unlocked = useIsUnlocked()
  const checking = useUnlock((s) => s.status === 'checking')
  const allowed = canPlayGame(validId, unlocked)

  useEffect(() => {
    if (!checking && !allowed) useNav.getState().openPaywall('game', gameMeta(validId).name)
  }, [allowed, checking, validId])

  const handleExit = () => {
    if (router.canGoBack()) {
      router.back()
    } else {
      router.replace('/')
    }
  }

  // A deep link straight to a locked game returns to Play and opens the unlock sheet.
  if (!allowed && checking) return null
  if (!allowed) return <Redirect href="/" />
  return <Screen onExit={handleExit} />
}
