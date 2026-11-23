import { lazy, type ComponentType, type LazyExoticComponent } from 'react'
import type { GameId } from '@/core/games/catalog'
import type { GameScreenProps } from '@/ui/components/GameShell'

/** Game screens, code-split so each game loads only when opened. */
export const GAME_SCREENS: Partial<Record<GameId, LazyExoticComponent<ComponentType<GameScreenProps>>>> = {
  settle: lazy(() => import('./settle/SettleScreen')),
  hue: lazy(() => import('./hue/HueScreen')),
  thread: lazy(() => import('./thread/ThreadScreen')),
  kindle: lazy(() => import('./kindle/KindleScreen')),
  pond: lazy(() => import('./pond/PondScreen')),
}
