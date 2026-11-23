import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Clock, SlidersVertical } from 'lucide-react'
import { isSilent, PRESETS, presetById, type Mix } from '@/core/sound/catalog'
import { Button, PopoverMenu } from '../components/controls'
import { MixSheet } from '../components/MixSheet'
import { SoundField } from '../components/SoundField'
import { useNav } from '../state/nav'
import { useSettings } from '../state/settings'
import { useSound } from '../state/sound'
import '../styles/sounds.css'

const CUSTOM_ID = '__custom__'

const TIMER_OPTIONS: readonly { value: number; label: string }[] = [
  { value: 0, label: 'Off' },
  { value: 15, label: '15 min' },
  { value: 30, label: '30 min' },
  { value: 45, label: '45 min' },
  { value: 60, label: '60 min' },
]

interface ModeItem {
  id: string
  name: string
}

export function SoundsScreen() {
  const playing = useSound((s) => s.playing)
  const activePresetId = useSound((s) => s.presetId)
  const playPreset = useSound((s) => s.playPreset)
  const playMix = useSound((s) => s.playMix)
  const updateMix = useSound((s) => s.updateMix)
  const setTimer = useSound((s) => s.setTimer)
  const stop = useSound((s) => s.stop)

  const savedMix = useSettings((s) => s.mix)
  const hasCustomMix = useSettings((s) => s.hasCustomMix)
  const sessionPreset = useSettings((s) => s.sessionPreset)
  const sleepTimer = useSettings((s) => s.sleepTimer)
  const setSettings = useSettings((s) => s.set)

  const mixOpen = useNav((s) => s.mixOpen)
  const setMixOpen = useNav((s) => s.setMixOpen)

  const [timerOpen, setTimerOpen] = useState(false)

  const showCustom = hasCustomMix || (playing && activePresetId === null)

  const modes: readonly ModeItem[] = useMemo(() => {
    const base = PRESETS.map((p) => ({ id: p.id, name: p.name }))
    return showCustom ? [...base, { id: CUSTOM_ID, name: 'Custom' }] : base
  }, [showCustom])

  const [selectedId, setSelectedId] = useState<string>(() => {
    if (playing) return activePresetId ?? CUSTOM_ID
    if (activePresetId && presetById(activePresetId)) return activePresetId
    if (sessionPreset && presetById(sessionPreset)) return sessionPreset
    return PRESETS[0]!.id
  })

  // Keep selected mode in sync if playback is started externally (e.g., Wind-down)
  useEffect(() => {
    if (!playing) return
    const target = activePresetId ?? CUSTOM_ID
    setSelectedId((prev) => (prev === target ? prev : target))
  }, [playing, activePresetId])

  // Guard in case Custom disappears
  const effectiveSelectedId = modes.some((m) => m.id === selectedId) ? selectedId : PRESETS[0]!.id

  const selectedMode = modes.find((m) => m.id === effectiveSelectedId) ?? modes[0]!
  const displayedMix: Mix = useMemo(() => {
    if (effectiveSelectedId === CUSTOM_ID) return savedMix
    return presetById(effectiveSelectedId)?.mix ?? PRESETS[0]!.mix
  }, [effectiveSelectedId, savedMix])

  const selectMode = useCallback(
    (id: string) => {
      setSelectedId(id)
      const isCurrentlyPlaying = useSound.getState().playing
      if (!isCurrentlyPlaying) return

      if (id === CUSTOM_ID) {
        const customMix = useSettings.getState().mix
        if (isSilent(customMix)) stop(1)
        else playMix(customMix, useSettings.getState().sleepTimer)
      } else {
        playPreset(id, useSettings.getState().sleepTimer)
      }
    },
    [playMix, playPreset, stop],
  )

  const togglePlay = useCallback(() => {
    if (useSound.getState().playing) {
      stop(1.4)
      return
    }
    if (effectiveSelectedId === CUSTOM_ID) {
      if (isSilent(savedMix)) {
        setMixOpen(true)
        return
      }
      playMix(savedMix, sleepTimer)
    } else {
      playPreset(effectiveSelectedId, sleepTimer)
    }
  }, [effectiveSelectedId, playMix, playPreset, savedMix, setMixOpen, sleepTimer, stop])

  const swipeMode = useCallback(
    (dir: -1 | 1) => {
      const idx = modes.findIndex((m) => m.id === effectiveSelectedId)
      if (idx === -1) return
      const nextIdx = Math.max(0, Math.min(modes.length - 1, idx + dir))
      if (nextIdx === idx) return
      selectMode(modes[nextIdx]!.id)
    },
    [effectiveSelectedId, modes, selectMode],
  )

  const handleCustomMixChange = useCallback(
    (next: Mix) => {
      setSettings({ mix: next, hasCustomMix: true })
      setSelectedId(CUSTOM_ID)
      const isCurrentlyPlaying = useSound.getState().playing
      if (isSilent(next)) {
        if (isCurrentlyPlaying) stop(1)
        else updateMix(next)
        return
      }
      if (isCurrentlyPlaying) updateMix(next)
      else playMix(next, useSettings.getState().sleepTimer)
    },
    [playMix, setSettings, stop, updateMix],
  )

  // Camera-style strip centering + scroll-snap sync
  const stripRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<Map<string, HTMLButtonElement>>(new Map())
  const mountedRef = useRef(false)
  const ignoreScrollUntilRef = useRef(0)
  const scrollDebounceRef = useRef<number | undefined>(undefined)

  const centerStripItem = useCallback((id: string, instant: boolean) => {
    const strip = stripRef.current
    const el = itemRefs.current.get(id)
    if (!strip || !el) return
    const targetLeft = el.offsetLeft + el.offsetWidth / 2 - strip.clientWidth / 2
    const reduced =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ignoreScrollUntilRef.current = performance.now() + (instant || reduced ? 80 : 380)
    strip.scrollTo({ left: Math.max(0, targetLeft), behavior: instant || reduced ? 'auto' : 'smooth' })
  }, [])

  useEffect(() => {
    centerStripItem(effectiveSelectedId, !mountedRef.current)
    mountedRef.current = true
  }, [effectiveSelectedId, modes.length, centerStripItem])

  useEffect(() => {
    const onResize = () => centerStripItem(effectiveSelectedId, true)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [effectiveSelectedId, centerStripItem])

  useEffect(() => () => window.clearTimeout(scrollDebounceRef.current), [])

  const onStripScroll = () => {
    if (performance.now() < ignoreScrollUntilRef.current) return
    window.clearTimeout(scrollDebounceRef.current)
    scrollDebounceRef.current = window.setTimeout(() => {
      const strip = stripRef.current
      if (!strip) return
      const centerX = strip.scrollLeft + strip.clientWidth / 2
      let closestId = effectiveSelectedId
      let closestDist = Infinity
      for (const m of modes) {
        const el = itemRefs.current.get(m.id)
        if (!el) continue
        const elCenter = el.offsetLeft + el.offsetWidth / 2
        const dist = Math.abs(elCenter - centerX)
        if (dist < closestDist) {
          closestDist = dist
          closestId = m.id
        }
      }
      if (closestId !== effectiveSelectedId) {
        selectMode(closestId)
      }
    }, 110)
  }

  return (
    <div className="sounds">
      <SoundField
        mix={displayedMix}
        playing={playing}
        label={selectedMode.name}
        onTogglePlay={togglePlay}
        onSwipe={swipeMode}
      />

      <div
        ref={stripRef}
        className="mode-strip"
        role="listbox"
        aria-label="Soundscape"
        aria-orientation="horizontal"
        onScroll={onStripScroll}
      >
        {modes.map((mode) => {
          const selected = mode.id === effectiveSelectedId
          return (
            <button
              key={mode.id}
              ref={(node) => {
                if (node) itemRefs.current.set(mode.id, node)
                else itemRefs.current.delete(mode.id)
              }}
              type="button"
              role="option"
              aria-selected={selected}
              className="t-headline mode-strip__item"
              onClick={() => selectMode(mode.id)}
            >
              {mode.name}
            </button>
          )
        })}
      </div>

      <div className="sounds-actions">
        <div className="menu-wrap">
          <Button
            variant="quiet"
            size="sm"
            className="sounds-pill"
            aria-haspopup="listbox"
            aria-expanded={timerOpen}
            onClick={() => setTimerOpen((o) => !o)}
          >
            <Clock size={15} strokeWidth={1.5} className="sounds-pill__icon" aria-hidden />
            <span className="num">{sleepTimer === 0 ? 'Off' : `${sleepTimer} min`}</span>
          </Button>
          <PopoverMenu
            open={timerOpen}
            onClose={() => setTimerOpen(false)}
            options={TIMER_OPTIONS}
            value={sleepTimer}
            onSelect={(v) => {
              setSettings({ sleepTimer: v })
              setTimer(v)
            }}
            align="center"
            direction="up"
            label="Sleep timer"
          />
        </div>

        <Button
          variant="quiet"
          size="sm"
          className="sounds-pill"
          aria-expanded={mixOpen}
          onClick={() => setMixOpen(true)}
        >
          <SlidersVertical size={15} strokeWidth={1.5} className="sounds-pill__icon" aria-hidden />
          <span>Mix</span>
        </Button>
      </div>

      <MixSheet open={mixOpen} onClose={() => setMixOpen(false)} mix={displayedMix} onChangeMix={handleCustomMixChange} />
    </div>
  )
}
