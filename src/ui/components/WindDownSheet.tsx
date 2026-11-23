import { SESSION_LENGTHS } from '@/core/session'
import { PRESETS } from '@/core/sound/catalog'
import { useSession } from '../state/session'
import { useSettings } from '../state/settings'
import { useSound } from '../state/sound'
import { Button, Segmented, Sheet } from './controls'

export function WindDownSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const minutes = useSettings((s) => s.sessionMinutes)
  const presetId = useSettings((s) => s.sessionPreset)
  const setSettings = useSettings((s) => s.set)
  const startSession = useSession((s) => s.start)
  const playPreset = useSound((s) => s.playPreset)
  const stopSound = useSound((s) => s.stop)

  const begin = () => {
    startSession(minutes, presetId)
    if (presetId) playPreset(presetId, minutes)
    else stopSound(1.2)
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} label="Begin wind-down">
      <h2 className="t-title sheet__title">Wind down</h2>
      <p className="t-small">
        Over the session the screen warms and dims, sound softens, and games ease off. At the end, it fades to black.
      </p>

      <div className="group" style={{ marginTop: 22 }}>
        <div className="row__head" style={{ marginBottom: 10 }}>
          <span className="row__label">Length</span>
          <span className="row__value num">{minutes} min</span>
        </div>
        <Segmented
          label="Session length"
          value={minutes}
          onChange={(v) => setSettings({ sessionMinutes: v })}
          options={SESSION_LENGTHS.map((m) => ({ value: m, label: `${m}m` }))}
        />
      </div>

      <div className="group" style={{ marginTop: 22 }}>
        <span className="row__label">Sound</span>
        <div className="preset-pills" role="group" aria-label="Session sound">
          <button
            type="button"
            className="pill"
            aria-pressed={presetId === null}
            onClick={() => setSettings({ sessionPreset: null })}
          >
            Silence
          </button>
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className="pill"
              aria-pressed={presetId === p.id}
              onClick={() => setSettings({ sessionPreset: p.id })}
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>

      <div className="sheet__actions">
        <Button variant="primary" block onClick={begin}>
          Begin {minutes}-minute wind-down
        </Button>
      </div>
    </Sheet>
  )
}
