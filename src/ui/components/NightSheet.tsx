import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { formatBedtimeShort } from '@/core/night'
import { clearAll } from '@/core/storage'
import { sound } from '@/platform'
import { downloadBedtimeIcs } from '@/platform/web/calendar'
import { useNav } from '../state/nav'
import { useSettings } from '../state/settings'
import { HoldButton, IconButton, LightSlider, Sheet, Toggle } from './controls'

/**
 * Night sheet (opened from the ☾ button).
 * Page 1: Light slider, big tappable Bedtime, Dim before bed toggle, More ›.
 * Page 2 (More): Game sounds, Haptics, Add to calendar, Re-tune Lull, Reset.
 */
export function NightSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const light = useSettings((s) => s.light)
  const followBedtime = useSettings((s) => s.followBedtime)
  const schedule = useSettings((s) => s.schedule)
  const sfx = useSettings((s) => s.sfx)
  const haptics = useSettings((s) => s.haptics)
  const set = useSettings((s) => s.set)
  const setSchedule = useSettings((s) => s.setSchedule)
  const setOnboardingReplay = useNav((s) => s.setOnboardingReplay)

  const [more, setMore] = useState(false)

  useEffect(() => {
    if (!open) setMore(false)
  }, [open])

  const resetAll = () => {
    sound.stop(0.2)
    clearAll()
    window.location.reload()
  }

  return (
    <Sheet open={open} onClose={onClose} label="Night">
      {!more ? (
        <div className="night-sheet">
          <LightSlider value={light} onChange={(v) => set({ light: v })} label="Light" />

          <label className="bedtime-pick">
            <span className="t-hero">{formatBedtimeShort(schedule.bedtime)}</span>
            <span className="t-label">Bedtime</span>
            <input
              type="time"
              className="bedtime-pick__input"
              aria-label="Bedtime"
              value={schedule.bedtime}
              onChange={(e) => e.target.value && setSchedule({ bedtime: e.target.value })}
            />
          </label>

          <div className="night-rows">
            <div className="row">
              <span className="t-headline">Dim before bed</span>
              <Toggle
                checked={followBedtime && schedule.enabled}
                onChange={(v) => {
                  set({ followBedtime: v })
                  setSchedule({ enabled: v })
                }}
                label="Dim before bed"
              />
            </div>

            <button type="button" className="row row--button" onClick={() => setMore(true)}>
              <span className="t-headline">More</span>
              <ChevronRight size={18} strokeWidth={1.5} color="var(--c-ink-3)" />
            </button>
          </div>
        </div>
      ) : (
        <div className="night-sheet">
          <div className="sheet__head" style={{ marginBottom: 10 }}>
            <IconButton label="Back" onClick={() => setMore(false)} style={{ marginLeft: -10 }}>
              <ChevronLeft size={22} strokeWidth={1.5} />
            </IconButton>
            <h2 className="t-title">More</h2>
            <span style={{ width: 44 }} aria-hidden />
          </div>

          <div className="night-rows">
            <div className="row">
              <span className="t-headline">Game sounds</span>
              <Toggle
                checked={sfx}
                onChange={(v) => {
                  set({ sfx: v })
                  sound.setCuesEnabled(v)
                }}
                label="Game sounds"
              />
            </div>

            <div className="row">
              <span className="t-headline">Haptics</span>
              <Toggle checked={haptics} onChange={(v) => set({ haptics: v })} label="Haptics" />
            </div>

            <button type="button" className="row row--button" onClick={() => downloadBedtimeIcs(schedule)}>
              <span className="t-headline">Add to calendar</span>
              <ChevronRight size={18} strokeWidth={1.5} color="var(--c-ink-3)" />
            </button>

            <button
              type="button"
              className="row row--button"
              onClick={() => {
                onClose()
                setOnboardingReplay(true)
              }}
            >
              <span className="t-headline">Re-tune Lull</span>
              <ChevronRight size={18} strokeWidth={1.5} color="var(--c-ink-3)" />
            </button>
          </div>

          <div style={{ marginTop: 18 }}>
            <HoldButton onConfirm={resetAll}>Hold to erase progress and settings</HoldButton>
          </div>
        </div>
      )}
    </Sheet>
  )
}
