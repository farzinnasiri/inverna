import type { ComponentType } from 'react'
import type { GameId } from '@/core/games/catalog'
import type { GameScreenProps } from '@/ui/rn/GameShell'
import { SettleScreen } from './settle/SettleScreen'
import { CascadeScreen } from './cascade/CascadeScreen'
import { HueScreen } from './hue/HueScreen'
import { ThreadScreen } from './thread/ThreadScreen'
import { KindleScreen } from './kindle/KindleScreen'
import { PondScreen } from './pond/PondScreen'
import { DriftScreen } from './drift/DriftScreen'
import { NineScreen } from './nine/NineScreen'
import { WeaveScreen } from './weave/WeaveScreen'
import { DimScreen } from './dim/DimScreen'
import { LanternsScreen } from './lanterns/LanternsScreen'
import { RallyScreen } from './rally/RallyScreen'
import { ChimeScreen } from './chime/ChimeScreen'

export const GAME_SCREENS: Record<GameId, ComponentType<GameScreenProps>> = {
  settle: SettleScreen,
  cascade: CascadeScreen,
  hue: HueScreen,
  thread: ThreadScreen,
  kindle: KindleScreen,
  pond: PondScreen,
  drift: DriftScreen,
  nine: NineScreen,
  weave: WeaveScreen,
  dim: DimScreen,
  lanterns: LanternsScreen,
  rally: RallyScreen,
  chime: ChimeScreen,
}
