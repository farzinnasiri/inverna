import { useEffect, useState } from 'react'
import { ChevronRight, Moon } from 'lucide-react'
import { GAMES } from '@/core/games/catalog'
import { minutesUntilBedtime, nightPhase } from '@/core/night'
import { sessionElapsed, sessionProgress } from '@/core/session'
import { Button } from '../components/controls'
import { GameGlyph } from '../components/GameGlyph'
import { Horizon } from '../components/Horizon'
import { useNav } from '../state/nav'
import { useSession } from '../state/session'
import { useSettings } from '../state/settings'
import { useSound } from '../state/sound'

function greeting(now: Date): string {
  const h = now.getHours()
  if (h >= 22 || h < 4) return 'Quiet hours.'
  if (h >= 18) return 'Good evening.'
  if (h >= 12) return 'Take a breath.'
  return 'Soft morning.'
}

function bedtimeLine(now: Date, schedule: ReturnType<typeof useSettings.getState>['schedule']): string {
  const { phase } = nightPhase(schedule, now)
  if (phase === 'bedtime') return 'Past bedtime. Keep the light low.'
  if (phase === 'winding') {
    const mins = minutesUntilBedtime(schedule, now)
    return mins ? `${mins} min until bedtime.` : 'Bedtime is close.'
  }
  const mins = minutesUntilBedtime(schedule, now)
  if (mins !== null && mins < 180) return `Bedtime in ${Math.round(mins / 5) * 5} min.`
  return 'Pick something gentle instead of scrolling.'
}

export function HomeScreen() {
  const openGame = useNav((s) => s.openGame)
  const setWindDownOpen = useNav((s) => s.setWindDownOpen)
  const schedule = useSettings((s) => s.schedule)
  const session = useSession((s) => s.session)
  const dismissSession = useSession((s) => s.dismiss)
  const stopSound = useSound((s) => s.stop)

  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), session ? 1000 : 30_000)
    return () => window.clearInterval(id)
  }, [session])

  const progress = session ? sessionProgress(session, now) : 0
  const remainingMin = session ? Math.max(1, Math.ceil((session.minutes * 60 - sessionElapsed(session, now)) / 60)) : 0

  const ready = GAMES.filter((g) => g.status === 'ready')
  const soon = GAMES.filter((g) => g.status === 'soon')

  return (
    <div className="page">
      <Horizon set={session ? progress : 0} />

      <header className="home-head">
        <div className="home-head__greeting">
          <h1 className="t-display">{greeting(new Date(now))}</h1>
          <p className="t-body">{bedtimeLine(new Date(now), schedule)}</p>
        </div>
      </header>

      {session ? (
        <section className="session-card" aria-label="Active wind-down session">
          <div className="session-card__top">
            <div className="session-card__meta">
              <span className="row__label">Wind-down running</span>
              <span className="row__hint num">About {remainingMin} min left · fades to black</span>
            </div>
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
          </div>
          <div className="session-card__bar" aria-hidden>
            <div className="session-card__fill" style={{ transform: `scaleX(${Math.max(0.03, progress)})` }} />
          </div>
        </section>
      ) : (
        <div className="home-cta">
          <Button variant="primary" block onClick={() => setWindDownOpen(true)}>
            <Moon size={18} strokeWidth={1.9} />
            Begin wind-down
          </Button>
        </div>
      )}

      <section className="shelf" aria-label="Playable games">
        <div className="shelf__head">
          <h2 className="t-heading">Games</h2>
          <span className="t-caption num">{ready.length} ready</span>
        </div>

        <div className="shelf__list">
          {ready.map((g) => (
            <button key={g.id} type="button" className="game-row" onClick={() => openGame(g.id)}>
              <span className="game-row__glyph">
                <GameGlyph id={g.id} />
              </span>
              <span className="game-row__info">
                <span className="game-row__top">
                  <span className="game-row__name">{g.name}</span>
                  <span className="game-row__classic">{g.classic}</span>
                </span>
                <span className="game-row__line">{g.line}</span>
                <span className="game-row__effect">{g.effect}</span>
              </span>
              <span className="game-row__right">
                <ChevronRight size={19} strokeWidth={1.6} className="game-row__chevron" />
              </span>
            </button>
          ))}
        </div>

        {soon.length > 0 && (
          <>
            <div className="shelf__divider">
              <h2 className="t-heading" style={{ color: 'var(--c-ink-2)' }}>
                Also in the collection
              </h2>
              <span className="t-caption num">{soon.length} planned</span>
            </div>
            <div className="shelf__list">
              {soon.map((g) => (
                <button key={g.id} type="button" className="game-row game-row--soon" disabled>
                  <span className="game-row__glyph">
                    <GameGlyph id={g.id} />
                  </span>
                  <span className="game-row__info">
                    <span className="game-row__top">
                      <span className="game-row__name">{g.name}</span>
                      <span className="game-row__classic">{g.classic}</span>
                    </span>
                    <span className="game-row__line">{g.line}</span>
                  </span>
                  <span className="game-row__right">
                    <span className="game-row__tag">Next</span>
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  )
}
