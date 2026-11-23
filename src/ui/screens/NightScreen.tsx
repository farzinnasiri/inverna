import { CalendarPlus } from 'lucide-react'
import { clearAll } from '@/core/storage'
import { pieces } from '@/design/tokens'
import { downloadBedtimeIcs } from '@/platform/web/calendar'
import { sound } from '@/platform'
import { Button, HoldButton, Segmented, Slider, Toggle } from '../components/controls'
import { useSettings } from '../state/settings'

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const LEADS = [
  { value: 15, label: '15m' },
  { value: 30, label: '30m' },
  { value: 45, label: '45m' },
  { value: 60, label: '60m' },
] as const

export function NightScreen() {
  const warmth = useSettings((s) => s.warmth)
  const dim = useSettings((s) => s.dim)
  const followBedtime = useSettings((s) => s.followBedtime)
  const schedule = useSettings((s) => s.schedule)
  const sfx = useSettings((s) => s.sfx)
  const haptics = useSettings((s) => s.haptics)
  const set = useSettings((s) => s.set)
  const setSchedule = useSettings((s) => s.setSchedule)

  const toggleDay = (d: number) => {
    const exists = schedule.days.includes(d)
    const days = exists ? schedule.days.filter((x) => x !== d) : [...schedule.days, d].sort()
    setSchedule({ days })
  }

  const resetAll = () => {
    sound.stop(0.2)
    clearAll()
    window.location.reload()
  }

  return (
    <div className="page">
      <header className="screen-head">
        <h1 className="t-title">Night</h1>
        <p className="t-body">Take the blue out of the glass and set when your evening slows down.</p>
      </header>

      <section className="group" style={{ marginTop: 22 }} aria-label="Screen warmth and brightness">
        <h2 className="t-heading group__title">Night light</h2>
        <p className="t-small group__note">Applies across every game and screen.</p>

        <div className="row row--stack">
          <div className="row__head">
            <span className="row__label">Warmth</span>
            <span className="row__value num">{Math.round(warmth * 100)}%</span>
          </div>
          <Slider label="Screen warmth" value={warmth} onChange={(v) => set({ warmth: v })} format={(v) => `${Math.round(v * 100)}%`} />
        </div>

        <div className="row row--stack">
          <div className="row__head">
            <span className="row__label">Extra dim</span>
            <span className="row__value num">{Math.round(dim * 100)}%</span>
          </div>
          <Slider label="Extra dim" value={dim} dimmedWhenZero onChange={(v) => set({ dim: v })} format={(v) => `${Math.round(v * 100)}%`} />
        </div>

        <div className="swatches" aria-hidden>
          <span className="swatch" style={{ background: pieces.ember }} />
          <span className="swatch" style={{ background: pieces.saffron }} />
          <span className="swatch" style={{ background: pieces.honey }} />
          <span className="swatch" style={{ background: pieces.moss }} />
          <span className="swatch" style={{ background: pieces.rose }} />
        </div>
      </section>

      <section className="group" aria-label="Bedtime schedule">
        <h2 className="t-heading group__title">Bedtime schedule</h2>

        <div className="row">
          <div className="row__main">
            <div className="row__label">Warm automatically</div>
            <div className="row__hint">Deepens the screen as bedtime approaches</div>
          </div>
          <Toggle checked={followBedtime && schedule.enabled} onChange={(v) => { set({ followBedtime: v }); setSchedule({ enabled: v }) }} label="Warm screen automatically before bedtime" />
        </div>

        <div className="row">
          <div className="row__main">
            <div className="row__label">Bedtime</div>
            <div className="row__hint">When you want the phone put away</div>
          </div>
          <input
            type="time"
            className="time-input"
            aria-label="Bedtime"
            value={schedule.bedtime}
            onChange={(e) => e.target.value && setSchedule({ bedtime: e.target.value })}
          />
        </div>

        <div className="row row--stack">
          <div className="row__head" style={{ marginBottom: 4 }}>
            <span className="row__label">Start warming before</span>
            <span className="row__value num">{schedule.leadMinutes} min</span>
          </div>
          <Segmented
            label="Warm-up lead time"
            value={schedule.leadMinutes}
            onChange={(v) => setSchedule({ leadMinutes: v })}
            options={LEADS}
          />
        </div>

        <div className="row row--stack">
          <span className="row__label">Evenings</span>
          <div className="days" role="group" aria-label="Bedtime evenings">
            {DAY_LABELS.map((lbl, idx) => (
              <button
                key={idx}
                type="button"
                className="day"
                aria-label={DAY_NAMES[idx]}
                aria-pressed={schedule.days.includes(idx)}
                onClick={() => toggleDay(idx)}
              >
                {lbl}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <Button block variant="quiet" onClick={() => downloadBedtimeIcs(schedule)}>
            <CalendarPlus size={17} strokeWidth={1.75} />
            Add bedtime reminder to calendar (.ics)
          </Button>
        </div>
      </section>

      <section className="group" aria-label="Feel">
        <h2 className="t-heading group__title">Feel</h2>

        <div className="row">
          <div className="row__main">
            <div className="row__label">Soft game sounds</div>
            <div className="row__hint">Quiet taps and chimes inside games</div>
          </div>
          <Toggle
            checked={sfx}
            onChange={(v) => {
              set({ sfx: v })
              sound.setCuesEnabled(v)
            }}
            label="Soft game sounds"
          />
        </div>

        <div className="row">
          <div className="row__main">
            <div className="row__label">Gentle haptics</div>
            <div className="row__hint">Subtle vibration where supported</div>
          </div>
          <Toggle checked={haptics} onChange={(v) => set({ haptics: v })} label="Gentle haptics" />
        </div>
      </section>

      <section className="group" aria-label="On-device data">
        <h2 className="t-heading group__title">On your device</h2>
        <p className="t-small group__note">
          Lull has no account, server, or tracking. Your game progress and settings live in this browser. Clearing site data clears them.
        </p>
        <HoldButton onConfirm={resetAll}>Hold to forget everything</HoldButton>
      </section>
    </div>
  )
}
