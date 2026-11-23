import { useRef, useState } from 'react'
import { BANDS, LAYERS, normalizeBand, type LayerId, type Mix, type SleepBandId } from '@/core/sound/catalog'
import { Segmented, Sheet } from './controls'

export interface MixSheetProps {
  open: boolean
  onClose: () => void
  mix: Mix
  onChangeMix: (next: Mix) => void
}

type ToneChoice = 'off' | SleepBandId

const TONE_OPTIONS: readonly { value: ToneChoice; label: string }[] = [
  { value: 'off', label: 'Off' },
  ...BANDS.map((b) => ({ value: b.id, label: b.name })),
]

function VerticalFader({
  label,
  shortLabel,
  value,
  onChange,
}: {
  label: string
  shortLabel: string
  value: number
  onChange: (next: number) => void
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)

  const updateFromY = (clientY: number) => {
    const el = trackRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const raw = 1 - (clientY - rect.top) / rect.height
    const clamped = Math.min(1, Math.max(0, raw))
    const snapped = clamped <= 0.02 ? 0 : Math.round(clamped * 100) / 100
    onChange(snapped)
  }

  const pct = Math.round(value * 100)

  return (
    <div className="fader" data-active={value > 0.01}>
      <div
        ref={trackRef}
        className="fader__track"
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-orientation="vertical"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-valuetext={pct > 0 ? `${pct}%` : 'Off'}
        data-dragging={dragging}
        data-active={value > 0.01}
        style={{ ['--v' as string]: value }}
        onPointerDown={(e) => {
          e.stopPropagation()
          e.currentTarget.setPointerCapture(e.pointerId)
          setDragging(true)
          updateFromY(e.clientY)
        }}
        onPointerMove={(e) => {
          if (!dragging) return
          e.stopPropagation()
          updateFromY(e.clientY)
        }}
        onPointerUp={(e) => {
          if (!dragging) return
          e.stopPropagation()
          setDragging(false)
        }}
        onPointerCancel={() => setDragging(false)}
        onKeyDown={(e) => {
          let next: number | null = null
          if (e.key === 'ArrowUp' || e.key === 'ArrowRight') next = Math.min(1, value + 0.05)
          else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') next = Math.max(0, value - 0.05)
          else if (e.key === 'PageUp') next = Math.min(1, value + 0.15)
          else if (e.key === 'PageDown') next = Math.max(0, value - 0.15)
          else if (e.key === 'Home') next = 0
          else if (e.key === 'End') next = 1
          if (next !== null) {
            e.preventDefault()
            const rounded = next <= 0.01 ? 0 : Math.round(next * 100) / 100
            onChange(rounded)
          }
        }}
      >
        <div className="fader__fill" aria-hidden />
      </div>
      <span className="t-label fader__label">{shortLabel}</span>
    </div>
  )
}

export function MixSheet({ open, onClose, mix, onChangeMix }: MixSheetProps) {
  const activeBand = normalizeBand(mix.band)

  const setLayer = (id: LayerId, gain: number) => {
    const layers = { ...mix.layers }
    if (gain <= 0.01) delete layers[id]
    else layers[id] = gain
    onChangeMix({ ...mix, layers })
  }

  const setTone = (choice: ToneChoice) => {
    const nextBand = choice === 'off' ? null : choice
    onChangeMix({
      ...mix,
      band: nextBand,
      bandGain: mix.bandGain > 0 ? mix.bandGain : 0.35,
      carrier: mix.carrier || 160,
    })
  }

  return (
    <Sheet open={open} onClose={onClose} label="Mix">
      <div className="mix-sheet">
        <h2 className="t-title">Mix</h2>

        <div className="mix-faders" role="group" aria-label="Sound layers">
          {LAYERS.map((layer) => (
            <VerticalFader
              key={layer.id}
              label={layer.name}
              shortLabel={layer.short}
              value={mix.layers[layer.id] ?? 0}
              onChange={(v) => setLayer(layer.id, v)}
            />
          ))}
        </div>

        <div className="mix-tone">
          <span className="t-label mix-tone__label">Tone</span>
          <Segmented
            label="Binaural tone"
            value={activeBand ?? 'off'}
            onChange={setTone}
            options={TONE_OPTIONS}
          />
          {activeBand !== null && (
            <p className="t-label mix-tone__note">Headphones · evidence is mixed</p>
          )}
        </div>
      </div>
    </Sheet>
  )
}
