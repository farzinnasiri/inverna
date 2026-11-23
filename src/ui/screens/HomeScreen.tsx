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

function formatNowShort(d: Date): string {
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
  let horizonPos = 0.5
  let horizonSet = 0

  if (session) {
    const rem = Math.max(1, Math.ceil((session.minutes * 60 - sessionElapsed(session, now)) / 60))
    heroValue = `${rem} min`
    heroLabel = 'Winding down'
    horizonPos = 0.5
    horizonSet = sessionProgress(session, now)
  } else if (phase === 'bedtime') {
    heroValue = formatNowShort(dateNow)
    heroLabel = 'Past bedtime'
    horizonPos = 0.5
    horizonSet = 0.35
  } else if (minsUntil !== null && minsUntil <= 180) {
    heroValue = `${minsUntil} min`
    heroLabel = `until ${bedtimeText}`
    horizonPos = 0.16 + 0.34 * (phase === 'winding' ? eveningProgress : Math.max(0, 1 - minsUntil / 180))
  }

  const ready = GAMES.filter((g) => g.status === 'ready')
  const featuredId: GameId =
    lastGame && ready.some((g) => g.id === lastGame) ? lastGame : (ready[0]?.id ?? 'settle')
  const ordered = [
    ...ready.filter((g) => g.id === featuredId),
    ...ready.filter((g) => g.id !== featuredId),
  ]

  return (
    <div className="home">
      <section className="home-hero" aria-label="Bedtime">
        <div className="t-hero">{heroValue}</div>
        <div className="t-label home-hero__label">{heroLabel}</div>
        <Horizon set={horizonSet} position={horizonPos} />
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
            <Moon size={16} strokeWidth={1.5} aria-hidden />
            Wind down
          </Button>
        )}
      </div>

      <section className="game-grid" aria-label="Games">
        {ordered.map((g, idx) => {
          const isWide = idx === 0
          const showMini = isWide && lastGame === g.id
          return (
            <button
              key={g.id}
              type="button"
              className={`game-tile ${isWide ? 'game-tile--wide' : ''}`}
              onClick={() => openGame(g.id)}
            >
              <span className="game-tile__visual">
                {showMini ? (
                  <ContinuePreview id={g.id} />
                ) : (
                  <GameGlyph id={g.id} />
                )}
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
