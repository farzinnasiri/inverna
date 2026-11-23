import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { formatBedtimeShort, formatHHMM, parseHHMM } from '@/core/night'
import { PRESETS } from '@/core/sound/catalog'
import { easeArray } from '@/design/tokens'
import { ContinuePreview } from '../components/ContinuePreview'
import { Button, LightSlider } from '../components/controls'
import { useSettings } from '../state/settings'
import { useSound } from '../state/sound'

/** 15-minute evening & late-night bedtime slots (20:00 → 02:45). */
const BEDTIME_SLOTS: string[] = (() => {
  const out: string[] = []
  for (let i = 0; i < 28; i++) {
    const mins = 20 * 60 + i * 15
    const h = Math.floor(mins / 60) % 24
    const m = mins % 60
    out.push(formatHHMM(h, m))
  }
  return out
})()

function nearestSlotIndex(hhmm: string): number {
  const { h, m } = parseHHMM(hhmm)
  const target = ((h < 12 ? h + 24 : h) * 60 + m)
  let best = 12 // 23:00
  let bestDiff = Infinity
  BEDTIME_SLOTS.forEach((slot, idx) => {
    const p = parseHHMM(slot)
    const val = (p.h < 12 ? p.h + 24 : p.h) * 60 + p.m
    const diff = Math.abs(val - target)
    if (diff < bestDiff) {
      bestDiff = diff
      best = idx
    }
  })
  return best
}

function SoundThumb({ id }: { id: string | null }) {
  switch (id) {
    case 'rainfall':
      return (
        <svg width="44" height="32" viewBox="0 0 44 32" aria-hidden>
          <g stroke="var(--c-ink-3)" strokeWidth="1.2" strokeLinecap="round">
            <line x1="8" y1="6" x2="8" y2="14" />
            <line x1="16" y1="12" x2="16" y2="22" />
            <line x1="24" y1="5" x2="24" y2="16" />
            <line x1="31" y1="14" x2="31" y2="25" />
            <line x1="37" y1="8" x2="37" y2="17" />
          </g>
        </svg>
      )
    case 'low-tide':
      return (
        <svg width="44" height="32" viewBox="0 0 44 32" fill="none" aria-hidden>
          <path d="M4 15 Q13 10 22 15 T40 15" stroke="var(--c-ink-3)" strokeWidth="1.3" strokeLinecap="round" />
          <path d="M4 22 Q13 17 22 22 T40 22" stroke="var(--c-ink-4)" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      )
    case 'hearth':
      return (
        <svg width="44" height="32" viewBox="0 0 44 32" aria-hidden>
          <circle cx="16" cy="20" r="2" fill="var(--c-accent-dim)" />
          <circle cx="24" cy="14" r="1.6" fill="var(--c-accent)" />
          <circle cx="29" cy="22" r="1.4" fill="var(--c-ink-3)" />
          <circle cx="20" cy="9" r="1.2" fill="var(--c-ink-4)" />
        </svg>
      )
    case 'deep-drift':
      return (
        <svg width="44" height="32" viewBox="0 0 44 32" fill="none" aria-hidden>
          <circle cx="22" cy="16" r="10" stroke="var(--c-ink-3)" strokeWidth="1.2" />
          <circle cx="22" cy="16" r="5" stroke="var(--c-ink-4)" strokeWidth="1.1" />
        </svg>
      )
    case 'theta-rain':
      return (
        <svg width="44" height="32" viewBox="0 0 44 32" fill="none" aria-hidden>
          <circle cx="22" cy="16" r="9.5" stroke="var(--c-ink-4)" strokeWidth="1.1" />
          <line x1="15" y1="8" x2="15" y2="16" stroke="var(--c-ink-3)" strokeWidth="1.2" strokeLinecap="round" />
          <line x1="28" y1="13" x2="28" y2="23" stroke="var(--c-ink-3)" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      )
    default:
      return (
        <svg width="44" height="32" viewBox="0 0 44 32" fill="none" aria-hidden>
          <line x1="14" y1="16" x2="30" y2="16" stroke="var(--c-ink-4)" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      )
  }
}

const SOUND_CARDS: readonly { id: string | null; name: string }[] = [
  ...PRESETS.map((p) => ({ id: p.id, name: p.name })),
  { id: null, name: 'Silence' },
]

/**
 * 3-step personalisation flow: Bedtime -> Light (live preview) -> Sound (live audio).
 * No lecturing, skippable from every step, takes ~15 seconds.
 */
export function Onboarding({ onComplete }: { onComplete: () => void }) {
  const schedule = useSettings((s) => s.schedule)
  const light = useSettings((s) => s.light)
  const sessionPreset = useSettings((s) => s.sessionPreset)
  const set = useSettings((s) => s.set)
  const setSchedule = useSettings((s) => s.setSchedule)
  const playPreset = useSound((s) => s.playPreset)
  const stopSound = useSound((s) => s.stop)

  const [step, setStep] = useState(0)
  const [slotIdx, setSlotIdx] = useState(() => nearestSlotIndex(schedule.bedtime))
  const [chosenSound, setChosenSound] = useState<string | null>(sessionPreset)
  const [previewed, setPreviewed] = useState(false)

  const selectedBedtime = BEDTIME_SLOTS[slotIdx] ?? '23:00'

  const wheelSlots = useMemo(() => {
    const out: { idx: number; hhmm: string; offset: number }[] = []
    for (let offset = -2; offset <= 2; offset++) {
      const idx = (slotIdx + offset + BEDTIME_SLOTS.length) % BEDTIME_SLOTS.length
      out.push({ idx, hhmm: BEDTIME_SLOTS[idx]!, offset })
    }
    return out
  }, [slotIdx])

  const finish = (fadePreview: boolean) => {
    setSchedule({ bedtime: selectedBedtime, enabled: true })
    set({ onboarded: true, followBedtime: true, sessionPreset: chosenSound })
    if (fadePreview && previewed) stopSound(2.5)
    onComplete()
  }

  const pickSound = (id: string | null) => {
    setChosenSound(id)
    set({ sessionPreset: id })
    setPreviewed(true)
    if (id) playPreset(id, 30)
    else stopSound(0.8)
  }

  return (
    <div className="onboarding" role="dialog" aria-modal="true" aria-label="Tune Lull">
      <div className="onboarding__frame">
        <header className="onboarding__top">
          <span style={{ width: 48 }} aria-hidden />
          <div className="onboarding__dots" aria-label={`Step ${step + 1} of 3`}>
            {[0, 1, 2].map((i) => (
              <span key={i} className="onboarding__dot" data-active={i === step} />
            ))}
          </div>
          <button type="button" className="t-label onboarding__skip" onClick={() => finish(true)}>
            Skip
          </button>
        </header>

        <div className="onboarding__body">
          <AnimatePresence mode="wait">
            {step === 0 && (
              <motion.div
                key="step-0"
                className="onboarding__step"
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.24, ease: easeArray.out }}
              >
                <h1 className="t-title onboarding__q">When do you want to be asleep?</h1>

                <div
                  className="time-wheel"
                  role="listbox"
                  aria-label="Bedtime"
                  onWheel={(e) => {
                    if (Math.abs(e.deltaY) < 8) return
                    const delta = e.deltaY > 0 ? 1 : -1
                    setSlotIdx((i) => (i + delta + BEDTIME_SLOTS.length) % BEDTIME_SLOTS.length)
                  }}
                >
                  {wheelSlots.map((item) => (
                    <button
                      key={`${item.idx}-${item.offset}`}
                      type="button"
                      role="option"
                      aria-selected={item.offset === 0}
                      className="time-wheel__row num"
                      data-dist={Math.abs(item.offset)}
                      onClick={() => setSlotIdx(item.idx)}
                    >
                      {formatBedtimeShort(item.hhmm)}
                    </button>
                  ))}
                </div>

                <Button
                  variant="quiet"
                  block
                  onClick={() => {
                    setSchedule({ bedtime: selectedBedtime, enabled: true })
                    set({ followBedtime: true })
                    setStep(1)
                  }}
                >
                  Continue
                </Button>
              </motion.div>
            )}

            {step === 1 && (
              <motion.div
                key="step-1"
                className="onboarding__step"
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.24, ease: easeArray.out }}
              >
                <h1 className="t-title onboarding__q">How low should the light go?</h1>

                <div className="light-preview">
                  <div className="light-preview__board">
                    <ContinuePreview id="kindle" demo />
                  </div>
                  <div className="light-preview__clock">
                    <span className="t-hero" style={{ fontSize: 44 }}>
                      {formatBedtimeShort(selectedBedtime)}
                    </span>
                    <span className="t-label">Bedtime</span>
                  </div>
                </div>

                <div style={{ width: '100%' }}>
                  <LightSlider value={light} onChange={(v) => set({ light: v })} label="Light" />
                </div>

                <Button variant="quiet" block onClick={() => setStep(2)}>
                  Continue
                </Button>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div
                key="step-2"
                className="onboarding__step"
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.24, ease: easeArray.out }}
              >
                <h1 className="t-title onboarding__q">What helps you drift off?</h1>

                <div className="sound-pick-grid" role="radiogroup" aria-label="Sleep sound">
                  {SOUND_CARDS.map((card) => {
                    const selected = chosenSound === card.id
                    return (
                      <button
                        key={card.id ?? 'silence'}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        className="sound-pick"
                        onClick={() => pickSound(card.id)}
                      >
                        <SoundThumb id={card.id} />
                        <span className="t-headline">{card.name}</span>
                      </button>
                    )
                  })}
                </div>

                <Button variant="primary" block onClick={() => finish(false)}>
                  Done
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
