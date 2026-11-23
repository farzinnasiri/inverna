import { Play, Square } from 'lucide-react'
import { BANDS, isSilent, LAYERS, PRESETS, type BandId, type LayerId, type Mix } from '@/core/sound/catalog'
import { Segmented, Slider } from '../components/controls'
import { useSettings } from '../state/settings'
import { useSound } from '../state/sound'

const TIMERS = [
  { value: 0, label: 'Off' },
  { value: 15, label: '15m' },
  { value: 30, label: '30m' },
  { value: 45, label: '45m' },
  { value: 60, label: '60m' },
] as const

export function SoundsScreen() {
  const playing = useSound((s) => s.playing)
  const presetId = useSound((s) => s.presetId)
  const activeMix = useSound((s) => s.mix)
  const playPreset = useSound((s) => s.playPreset)
  const playMix = useSound((s) => s.playMix)
  const updateMix = useSound((s) => s.updateMix)
  const setTimer = useSound((s) => s.setTimer)
  const stop = useSound((s) => s.stop)

  const savedMix = useSettings((s) => s.mix)
  const sleepTimer = useSettings((s) => s.sleepTimer)
  const setSettings = useSettings((s) => s.set)

  const mix: Mix = activeMix ?? savedMix

  const applyMix = (next: Mix) => {
    setSettings({ mix: next })
    if (isSilent(next)) {
      if (playing) stop(1)
      else updateMix(next)
      return
    }
    if (playing) updateMix(next)
    else playMix(next, sleepTimer)
  }

  const setLayer = (id: LayerId, gain: number) => {
    const layers = { ...mix.layers }
    if (gain <= 0.01) delete layers[id]
    else layers[id] = gain
    applyMix({ ...mix, layers })
  }

  const toggleBand = (id: BandId) => {
    const nextBand = mix.band === id ? null : id
    applyMix({ ...mix, band: nextBand })
  }

  const togglePreset = (id: string) => {
    if (playing && presetId === id) {
      stop(1.4)
      return
    }
    playPreset(id, sleepTimer)
    const p = PRESETS.find((x) => x.id === id)
    if (p) setSettings({ mix: p.mix })
  }

  return (
    <div className="page">
      <header className="screen-head">
        <h1 className="t-title">Sounds</h1>
        <p className="t-body">Synthesised live on your device. No downloads, no loops.</p>
      </header>

      <section className="group" style={{ marginTop: 22 }} aria-label="Presets">
        <h2 className="t-heading group__title">Presets</h2>
        <div className="preset-list">
          {PRESETS.map((p) => {
            const active = playing && presetId === p.id
            return (
              <button
                key={p.id}
                type="button"
                className="preset"
                data-active={active}
                aria-pressed={active}
                onClick={() => togglePreset(p.id)}
              >
                <span className="preset__info">
                  <span className="preset__name">{p.name}</span>
                  <span className="row__hint">{p.hint}</span>
                </span>
                <span className="preset__dot" aria-hidden>
                  {active ? <Square size={12} fill="currentColor" strokeWidth={0} /> : <Play size={14} fill="currentColor" strokeWidth={0} />}
                </span>
              </button>
            )
          })}
        </div>
      </section>

      <section className="group" aria-label="Sleep timer">
        <div className="row__head" style={{ marginBottom: 10 }}>
          <h2 className="t-heading">Sleep timer</h2>
          <span className="row__value num">{sleepTimer === 0 ? 'Until stopped' : `${sleepTimer} min`}</span>
        </div>
        <Segmented
          label="Sleep timer"
          value={sleepTimer}
          onChange={(v) => {
            setSettings({ sleepTimer: v })
            setTimer(v)
          }}
          options={TIMERS}
        />
      </section>

      <section className="group" aria-label="Brainwave rhythms">
        <h2 className="t-heading group__title">Binaural rhythms</h2>
        <p className="t-small group__note">Two soft tones, a few Hz apart. Best with headphones.</p>

        <div className="band-grid">
          {BANDS.map((b) => {
            const active = playing && mix.band === b.id
            return (
              <button
                key={b.id}
                type="button"
                className="band"
                data-active={active}
                data-restful={b.restful}
                aria-pressed={active}
                onClick={() => toggleBand(b.id)}
              >
                <span className="band__top">
                  <span className="band__name">{b.name}</span>
                  <span className="band__hz num">{b.hz} Hz</span>
                </span>
                <span className="band__hint">{b.hint}</span>
              </button>
            )
          })}
        </div>

        {mix.band && (
          <div style={{ marginTop: 14 }}>
            <div className="row row--stack">
              <div className="row__head">
                <span className="row__label">Tone level</span>
                <span className="row__value num">{Math.round(mix.bandGain * 100)}%</span>
              </div>
              <Slider
                label="Binaural tone level"
                value={mix.bandGain}
                onChange={(v) => applyMix({ ...mix, bandGain: v })}
                format={(v) => `${Math.round(v * 100)}%`}
              />
            </div>
            <div className="row row--stack">
              <div className="row__head">
                <span className="row__label">Base pitch</span>
                <span className="row__value num">{Math.round(mix.carrier)} Hz</span>
              </div>
              <Slider
                label="Binaural base pitch"
                min={110}
                max={260}
                step={2}
                value={mix.carrier}
                onChange={(v) => applyMix({ ...mix, carrier: v })}
                format={(v) => `${Math.round(v)} Hz`}
              />
            </div>
          </div>
        )}

        <p className="note-box">
          Evidence on binaural beats for sleep is mixed. Think of these as a steady hum to rest your attention on, not a medical treatment.
        </p>
      </section>

      <section className="group" aria-label="Ambient mixer">
        <h2 className="t-heading group__title">Mixer</h2>
        <p className="t-small group__note">Blend your own room.</p>
        <div>
          {LAYERS.map((layer) => {
            const val = mix.layers[layer.id] ?? 0
            return (
              <div className="row row--stack" key={layer.id}>
                <div className="row__head">
                  <div>
                    <span className="row__label">{layer.name}</span>
                    <span className="row__hint" style={{ marginLeft: 8 }}>
                      {layer.hint}
                    </span>
                  </div>
                  <span className="row__value num">{val > 0.01 ? `${Math.round(val * 100)}%` : 'Off'}</span>
                </div>
                <Slider
                  label={layer.name}
                  value={val}
                  dimmedWhenZero
                  onChange={(v) => setLayer(layer.id, v)}
                  format={(v) => `${Math.round(v * 100)}%`}
                />
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
