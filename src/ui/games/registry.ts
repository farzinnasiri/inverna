import { lazy, type ComponentType, type LazyExoticComponent } from 'react'
import type { GameId } from '@/core/games/catalog'
import type { GameScreenProps } from '@/ui/components/GameShell'

/** All 10 game screens, code-split so each loads only when opened. */
export const GAME_SCREENS: Partial<Record<GameId, LazyExoticComponent<ComponentType<GameScreenProps>>>> = {
  settle: lazy(() => import('./settle/SettleScreen')),
  hue: lazy(() => import('./hue/HueScreen')),
  thread: lazy(() => import('./thread/ThreadScreen')),
  kindle: lazy(() => import('./kindle/KindleScreen')),
  pond: lazy(() => import('./pond/PondScreen')),
  drift: lazy(() => import('./drift/DriftScreen')),
  nine: lazy(() => import('./nine/NineScreen')),
  weave: lazy(() => import('./weave/WeaveScreen')),
  patience: lazy(() => import('./patience/PatienceScreen')),
  lanterns: lazy(() => import('./lanterns/LanternsScreen')),
}
