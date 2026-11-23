import { PRESETS } from '@/core/sound/catalog'
import { sound } from '@/platform'
import { useSettings } from '../state/settings'
import { useSound } from '../state/sound'
import { Sheet, Slider, Toggle } from './controls'

/**
 * In-game Audio control sheet.
 * Accessible from every game's top bar without leaving your board.
 */
export function GameAudioSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const playing = useSound((s) => s.playing)
  const presetId = useSound((s) => s.presetId)
  const volume = useSound((s) => s.volume)
  const playPreset = useSound((s) => s.playPreset)
  const setVolume = useSound((s) => s.setVolume)
  const stop = useSound((s) => s.stop)

  const sessionPreset = useSettings((s) => s.sessionPreset)
  const sleepTimer = useSettings((s) => s.sleepTimer)
  const sfx = useSettings((s) => s.sfx)
  const haptics = useSettings((s) => s.haptics)
  const set = useSettings((s) => s.set)

  const toggleAmbient = (on: boolean) => {
    if (on) {
      const target = presetId ?? sessionPreset ?? 'rainfall'
      playPreset(target, sleepTimer)
    } else {
      stop(0.8)
    }
  }

  return (
    <Sheet open={open} onClose={onClose} label="Sound">
      <h2 className="t-title" style={{ marginBottom: 14 }}>
        Sound
      </h2>

      <div className="audio-sheet">
        <div className="row">
          <span className="t-headline">Ambient</span>
          <Toggle checked={playing} onChange={toggleAmbient} label="Ambient sound" />
        </div>

        <div className="audio-sheet__vol">
          <div className="audio-sheet__vol-head">
            <span className="t-label">Volume</span>
            <span className="t-label num">{Math.round(volume * 100)}%</span>
          </div>
          <Slider
            label="Ambient volume"
            value={volume}
            onChange={setVolume}
            dimmedWhenZero={!playing}
            format={(v) => `${Math.round(v * 100)}%`}
          />
        </div>

        <div className="audio-presets" role="group" aria-label="Sound presets">
          {PRESETS.map((p) => {
            const active = playing && presetId === p.id
            return (
              <button
                key={p.id}
                type="button"
                className="audio-chip"
                aria-pressed={active}
                onClick={() => {
                  if (active) stop(0.8)
                  else playPreset(p.id, sleepTimer)
                }}
              >
                {p.name}
              </button>
            )
          })}
        </div>

        <div className="audio-sheet__toggles">
          <div className="row">
            <span className="t-headline">Game cues</span>
            <Toggle
              checked={sfx}
              onChange={(v) => {
                set({ sfx: v })
                sound.setCuesEnabled(v)
              }}
              label="Game cues"
            />
          </div>
          <div className="row">
            <span className="t-headline">Haptics</span>
            <Toggle checked={haptics} onChange={(v) => set({ haptics: v })} label="Haptics" />
          </div>
        </div>
      </div>
    </Sheet>
  )
}
