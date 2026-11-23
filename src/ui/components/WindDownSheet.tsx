import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { SESSION_LENGTHS } from '@/core/session'
import { PRESETS, presetById } from '@/core/sound/catalog'
import { useSession } from '../state/session'
import { useSettings } from '../state/settings'
import { useSound } from '../state/sound'
import { Button, PopoverMenu, Segmented, Sheet } from './controls'

const SOUND_OPTIONS: readonly { value: string | null; label: string }[] = [
  ...PRESETS.map((p) => ({ value: p.id, label: p.name })),
  { value: null, label: 'Silence' },
]

export function WindDownSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const minutes = useSettings((s) => s.sessionMinutes)
  const presetId = useSettings((s) => s.sessionPreset)
  const setSettings = useSettings((s) => s.set)
  const startSession = useSession((s) => s.start)
  const playPreset = useSound((s) => s.playPreset)
  const stopSound = useSound((s) => s.stop)
  const [menuOpen, setMenuOpen] = useState(false)

  const soundName = presetById(presetId)?.name ?? 'Silence'

  const begin = () => {
    startSession(minutes, presetId)
    if (presetId) playPreset(presetId, minutes)
    else stopSound(1.2)
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} label="Wind down">
      <h2 className="t-title" style={{ marginBottom: 20 }}>
        Wind down
      </h2>

      <Segmented
        label="Session length in minutes"
        value={minutes}
        onChange={(v) => setSettings({ sessionMinutes: v })}
        options={SESSION_LENGTHS.map((m) => ({ value: m, label: String(m) }))}
      />

      <div className="row" style={{ marginTop: 14 }}>
        <span className="t-headline">Sound</span>
        <div className="menu-wrap">
          <button
            type="button"
            className="row__right t-headline"
            style={{ color: 'var(--c-ink-2)' }}
            onClick={() => setMenuOpen((o) => !o)}
          >
            <span>{soundName}</span>
            <ChevronRight size={17} strokeWidth={1.5} color="var(--c-ink-3)" />
          </button>
          <PopoverMenu
            open={menuOpen}
            onClose={() => setMenuOpen(false)}
            options={SOUND_OPTIONS}
            value={presetId}
            onSelect={(v) => setSettings({ sessionPreset: v })}
            align="right"
            direction="up"
            label="Session sound"
          />
        </div>
      </div>

      <div className="sheet__actions">
        <Button variant="primary" block onClick={begin}>
          Start
        </Button>
      </div>
    </Sheet>
  )
}
