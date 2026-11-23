import { Suspense, useEffect } from 'react'
import { AnimatePresence, MotionConfig } from 'motion/react'
import { GAMES, type GameId } from '@/core/games/catalog'
import { sound } from '@/platform'
import { AmbientBackdrop } from './components/AmbientBackdrop'
import { NightFilterOverlay } from './components/NightFilterOverlay'
import { NightSheet } from './components/NightSheet'
import { SessionCurtain } from './components/SessionCurtain'
import { TabIsland } from './components/TabIsland'
import { WindDownSheet } from './components/WindDownSheet'
import { GAME_SCREENS } from './games/registry'
import { Onboarding } from './onboarding/Onboarding'
import { HomeScreen } from './screens/HomeScreen'
import { SoundsScreen } from './screens/SoundsScreen'
import { useNav } from './state/nav'
import { useSettings } from './state/settings'

export function App() {
  const tab = useNav((s) => s.tab)
  const game = useNav((s) => s.game)
  const windDownOpen = useNav((s) => s.windDownOpen)
  const nightOpen = useNav((s) => s.nightOpen)
  const onboardingReplay = useNav((s) => s.onboardingReplay)
  const openGame = useNav((s) => s.openGame)
  const closeGame = useNav((s) => s.closeGame)
  const setWindDownOpen = useNav((s) => s.setWindDownOpen)
  const setNightOpen = useNav((s) => s.setNightOpen)
  const setOnboardingReplay = useNav((s) => s.setOnboardingReplay)

  const sfx = useSettings((s) => s.sfx)
  const onboarded = useSettings((s) => s.onboarded)

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
  const showOnboarding = !onboarded || onboardingReplay

  return (
    <MotionConfig reducedMotion="user">
      <div className="app">
        <AmbientBackdrop />

        <div className="frame">
          <div className="viewport" aria-hidden={Boolean(ActiveGame)}>
            {tab === 'play' && <HomeScreen />}
            {tab === 'sounds' && <SoundsScreen />}
          </div>

          <TabIsland />

          <AnimatePresence>
            {ActiveGame && (
              <Suspense key={game} fallback={<div className="game" />}>
                <ActiveGame onExit={closeGame} />
              </Suspense>
            )}
          </AnimatePresence>
        </div>

        <WindDownSheet open={windDownOpen} onClose={() => setWindDownOpen(false)} />
        <NightSheet open={nightOpen} onClose={() => setNightOpen(false)} />
        {showOnboarding && <Onboarding onComplete={() => setOnboardingReplay(false)} />}
        <SessionCurtain />
        <NightFilterOverlay />
      </div>
    </MotionConfig>
  )
}
