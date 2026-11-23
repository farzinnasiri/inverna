import { AnimatePresence, motion } from 'motion/react'
import { Square } from 'lucide-react'
import { BANDS, LAYERS, presetById } from '@/core/sound/catalog'
import { easeArray } from '@/design/tokens'
import { useNav } from '../state/nav'
import { useSound } from '../state/sound'
import { IconButton } from './controls'

export function NowPlayingBar() {
  const playing = useSound((s) => s.playing)
  const presetId = useSound((s) => s.presetId)
  const mix = useSound((s) => s.mix)
  const stop = useSound((s) => s.stop)
  const tab = useNav((s) => s.tab)
  const setTab = useNav((s) => s.setTab)

  const preset = presetById(presetId)
  let label = preset?.name ?? 'Custom mix'
  if (!preset && mix) {
    const active = LAYERS.filter((l) => (mix.layers[l.id] ?? 0) > 0.02).map((l) => l.name)
    const band = BANDS.find((b) => b.id === mix.band)
    const parts = [...active.slice(0, 2), ...(band ? [band.name] : [])]
    if (parts.length > 0) label = parts.join(' · ')
  }

  return (
    <AnimatePresence>
      {playing && tab !== 'sounds' && (
        <motion.div
          className="nowplaying"
          initial={{ opacity: 0, y: 14, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 14, scale: 0.96 }}
          transition={{ duration: 0.26, ease: easeArray.out }}
        >
          <div className="nowplaying__bars" aria-hidden>
            <span />
            <span />
            <span />
          </div>
          <button type="button" className="nowplaying__text" onClick={() => setTab('sounds')} style={{ textAlign: 'left' }}>
            <span className="row__label" style={{ fontSize: 14.5 }}>
              {label}
            </span>
          </button>
          <IconButton label="Stop sound" onClick={() => stop(1.2)}>
            <Square size={15} fill="currentColor" strokeWidth={0} />
          </IconButton>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
