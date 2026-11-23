import { useEffect, useState } from 'react'
import { Moon } from 'lucide-react'
import { GAMES, type GameId } from '@/core/games/catalog'
import { formatBedtimeShort, minutesUntilBedtime, nightPhase } from '@/core/night'
import { sessionElapsed, sessionProgress } from '@/core/session'
import { ContinuePreview } from '../components/ContinuePreview'
import { Button } from '../components/controls'
import { GameGlyph } from '../components/GameGlyph'
import { Horizon } from '../components/Horizon'
import { useNav } from '../state/nav'
import { useSession } from '../state/session'
import { useSettings } from '../state/settings'
import { useSound } from '../state/sound'

function formatClock(d: Date): string {
  const h = d.getHours() % 12 || 12
  return `${h}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function HomeScreen() {
  const openGame = useNav((s) => s.openGame)
  const setWindDownOpen = useNav((s) => s.setWindDownOpen)
  const schedule = useSettings((s) => s.schedule)
  const lastGame = useSettings((s) => s.lastGame)
  const session = useSession((s) => s.session)
  const dismissSession = useSession((s) => s.dismiss)
  const stopSound = useSound((s) => s.stop)

  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), session ? 1000 : 30_000)
    return () => window.clearInterval(id)
  }, [session])

  const dateNow = new Date(now)
  const bedtimeText = formatBedtimeShort(schedule.bedtime)
  const { phase, progress: eveningProgress } = nightPhase(schedule, dateNow)
  const minsUntil = minutesUntilBedtime(schedule, dateNow)

  let heroValue = bedtimeText
  let heroLabel = 'Bedtime'
  let timelineProgress = 0.25
  let startAnchor = formatClock(dateNow)
  let endAnchor = bedtimeText

  if (session) {
    const rem = Math.max(1, Math.ceil((session.minutes * 60 - sessionElapsed(session, now)) / 60))
    heroValue = `${rem} min`
    heroLabel = 'Winding down'
    timelineProgress = sessionProgress(session, now)
    startAnchor = 'Start'
    endAnchor = `${session.minutes}m`
  } else if (phase === 'bedtime') {
    heroValue = formatClock(dateNow)
    heroLabel = 'Past bedtime'
    timelineProgress = 1
    startAnchor = bedtimeText
    endAnchor = 'Now'
  } else if (minsUntil !== null && minsUntil <= 180) {
    heroValue = `${minsUntil} min`
    heroLabel = `until ${bedtimeText}`
    const windowMins = phase === 'winding' ? schedule.leadMinutes : 180
    timelineProgress = phase === 'winding' ? eveningProgress : Math.max(0.05, 1 - minsUntil / windowMins)
    const windowStart = new Date(now - (windowMins - minsUntil) * 60_000)
    startAnchor = formatClock(windowStart)
    endAnchor = bedtimeText
  } else {
    // Daytime / early evening: show 24h day progress softly
    timelineProgress = Math.min(0.95, Math.max(0.08, (dateNow.getHours() * 60 + dateNow.getMinutes()) / 1440))
    startAnchor = formatClock(dateNow)
    endAnchor = bedtimeText
  }

  const ready = GAMES.filter((g) => g.status === 'ready')
  const featuredId: GameId =
    lastGame && ready.some((g) => g.id === lastGame) ? lastGame : (ready[0]?.id ?? 'settle')
  const ordered = [
    ...ready.filter((g) => g.id === featuredId),
    ...ready.filter((g) => g.id !== featuredId),
  ]

  // Playful asymmetrical 3-column bento rhythm for 10 tiles:
  // Row 1: [2-wide featured] [1]
  // Row 2: [1] [1] [1]
  // Row 3: [1] [2-wide accent]
  // Row 4: [1] [1] [1]
  // Row 5 (if 10th): sits cleanly if needed — wait: 2+1 + 1+1+1 + 1+2 + 1+1+1 = 10 tiles across 4 crisp rows!
  // Let's verify: idx 0 (span 2), idx 1 (1) => row 1 (2 items)
  // idx 2, 3, 4 (1,1,1) => row 2 (3 items)
  // idx 5 (1), idx 6 (span 2) => row 3 (2 items)
  // idx 7, 8, 9 (1,1,1) => row 4 (3 items)
  // Total = 10 games in 4 perfectly balanced rectangular rows! Zero orphan slots!
  return (
    <div className="home">
      <section className="home-hero" aria-label="Bedtime">
        <div className="t-hero">{heroValue}</div>
        <div className="t-label home-hero__label">{heroLabel}</div>
        <Horizon progress={timelineProgress} startLabel={startAnchor} endLabel={endAnchor} />
      </section>

      <div className="home-action">
        {session ? (
          <Button
            size="sm"
            variant="quiet"
            onClick={() => {
              dismissSession()
              stopSound(1.2)
            }}
          >
            End
          </Button>
        ) : (
          <Button size="sm" variant="quiet" onClick={() => setWindDownOpen(true)}>
            <Moon size={15} strokeWidth={1.5} aria-hidden />
            Wind down
          </Button>
        )}
      </div>

      <section className="game-grid" aria-label="Games">
        {ordered.map((g, idx) => {
          const isFeatured = idx === 0
          const isSecondWide = ordered.length >= 10 && idx === 6
          const isWide = isFeatured || isSecondWide
          const showMini = isFeatured && lastGame === g.id
          return (
            <button
              key={g.id}
              type="button"
              className={`game-tile ${isWide ? 'game-tile--wide' : ''}`}
              onClick={() => openGame(g.id)}
            >
              <span className="game-tile__visual">
                {showMini ? <ContinuePreview id={g.id} /> : <GameGlyph id={g.id} />}
              </span>
              {showMini && (
                <span className="game-tile__fallback">
                  <GameGlyph id={g.id} />
                </span>
              )}
              <span className="game-tile__name t-headline">{g.name}</span>
            </button>
          )
        })}
      </section>
    </div>
  )
}
