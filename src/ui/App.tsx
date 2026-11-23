import { Suspense, useEffect } from 'react'
import { AnimatePresence, MotionConfig } from 'motion/react'
import { Flame, Moon, Waves } from 'lucide-react'
import { GAMES, type GameId } from '@/core/games/catalog'
import { sound } from '@/platform'
import { NightFilterOverlay } from './components/NightFilterOverlay'
import { NowPlayingBar } from './components/NowPlayingBar'
import { SessionCurtain } from './components/SessionCurtain'
import { WindDownSheet } from './components/WindDownSheet'
import { GAME_SCREENS } from './games/registry'
import { HomeScreen } from './screens/HomeScreen'
import { NightScreen } from './screens/NightScreen'
import { SoundsScreen } from './screens/SoundsScreen'
import { useNav, type Tab } from './state/nav'
import { useSettings } from './state/settings'

const TABS: readonly { id: Tab; label: string; Icon: typeof Flame }[] = [
  { id: 'play', label: 'Play', Icon: Flame },
  { id: 'sounds', label: 'Sounds', Icon: Waves },
  { id: 'night', label: 'Night', Icon: Moon },
]

export function App() {
  const tab = useNav((s) => s.tab)
  const game = useNav((s) => s.game)
  const windDownOpen = useNav((s) => s.windDownOpen)
  const setTab = useNav((s) => s.setTab)
  const openGame = useNav((s) => s.openGame)
  const closeGame = useNav((s) => s.closeGame)
  const setWindDownOpen = useNav((s) => s.setWindDownOpen)
  const sfx = useSettings((s) => s.sfx)

  // Sync SFX preference into the sound engine
  useEffect(() => {
    sound.setCuesEnabled(sfx)
  }, [sfx])

  // Direct-launch helper for testing: /?game=settle
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('game') as GameId | null
    if (id && GAMES.some((g) => g.id === id) && GAME_SCREENS[id]) {
      openGame(id)
    }
  }, [openGame])

  const ActiveGame = game ? GAME_SCREENS[game] : null

  return (
    <MotionConfig reducedMotion="user">
      <div className="app">
        <div className="room" aria-hidden />

        <div className="frame">
          <div className="scroll" aria-hidden={Boolean(ActiveGame)}>
            {tab === 'play' && <HomeScreen />}
            {tab === 'sounds' && <SoundsScreen />}
            {tab === 'night' && <NightScreen />}
          </div>

          <NowPlayingBar />

          <nav className="tabbar" aria-label="Main navigation">
            {TABS.map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                className="tab"
                aria-current={tab === id ? 'page' : undefined}
                onClick={() => setTab(id)}
              >
                <Icon size={21} strokeWidth={1.7} />
                <span>{label}</span>
                <span className="tab__dot" aria-hidden />
              </button>
            ))}
          </nav>

          <AnimatePresence>
            {ActiveGame && (
              <Suspense key={game} fallback={<div className="game" />}>
                <ActiveGame onExit={closeGame} />
              </Suspense>
            )}
          </AnimatePresence>
        </div>

        <WindDownSheet open={windDownOpen} onClose={() => setWindDownOpen(false)} />
        <SessionCurtain />
        <NightFilterOverlay />
      </div>
    </MotionConfig>
  )
}
