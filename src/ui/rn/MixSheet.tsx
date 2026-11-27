import { useEffect, useRef, useState, type ComponentRef } from 'react'
import { PanResponder, Pressable, StyleSheet, Text, TextInput, View, type LayoutChangeEvent } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { ArrowDown, ArrowUp, ChevronLeft, Info, Pause, Play, RotateCcw } from 'lucide-react-native'
import { pulseRate, type ModulationDepth } from '@/core/sound/arc'
import {
  CUSTOM_ICONS,
  LAYERS,
  normalizeBand,
  type CustomSound,
  type LayerId,
  type Mix,
  type SleepBandId,
  type SoundIconId,
} from '@/core/sound/catalog'
import { DEFAULT_HARMONIC_KEY, HARMONIC_KEYS, type HarmonicKeyId } from '@/core/sound/harmonics'
import { sound } from '@/platform'
import { studioCopy as copy, studioGuides, type GuideRow } from '@/ui/copy'
import { feel } from '@/ui/feel'
import { useTokenColors } from '@/ui/hooks/useTokenColors'
import { useSettings } from '@/ui/state/settings'
import { useSound } from '@/ui/state/sound'
import { Button, HoldButton, PillSlider, Sheet, useSheetScrollLock } from './controls'
import { GLASS_TINT, GlassSurface } from './Glass'
import { useAppActive, useReducedMotion } from './hooks'
import { ROW_CHORDS, ROW_COUNT, ROW_H, ROW_PULSE, StudioScope } from './sound/StudioScope'
import { SoundGlyph } from './SoundGlyph'

/**
 * What the studio is working on:
 * - `current`: the sound on screen (a preset becomes "Your mix" once changed);
 * - `new`: a new sound, starting from the one on screen;
 * - `saved`: one of their own sounds, to change, rename or delete.
 */
export type StudioTarget = { kind: 'current' } | { kind: 'new'; from: string } | { kind: 'saved'; sound: CustomSound }

export interface SoundMeta {
  name: string
  hint: string
  icon: SoundIconId
}

type GuideTopic = keyof typeof studioGuides

/** Each layer's colour: its fader, its line in the picture, its guide. */
const LAYER_COLORS: Record<LayerId, string> = {
  rain: '#8DB0D8',
  waves: '#69B3AC',
  fire: '#E0925C',
  wind: '#AFC0D2',
  brown: '#B5835A',
  pink: '#D99BAA',
  white: '#E9E4D8',
}
const LAYER_ORDER = LAYERS.map((l) => l.id)
const NATURE: LayerId[] = ['rain', 'waves', 'fire', 'wind']
const NOISE: LayerId[] = ['brown', 'pink', 'white']
const LAYER_WORDS: Record<LayerId, string> = {
  rain: 'rain',
  waves: 'waves',
  fire: 'a low fire',
  wind: 'wind',
  brown: 'a deep rumble',
  pink: 'a soft hush',
  white: 'an even hiss',
}

/** Chord colours by feel, not by key name; each with the scene it suits. */
const CHORD_COLOURS: { id: HarmonicKeyId; label: string; icon: SoundIconId }[] = [
  { id: 'd-dorian', label: 'Wistful', icon: 'rain' },
  { id: 'e-min-classical', label: 'Nocturne', icon: 'piano' },
  { id: 'f-lydian', label: 'Glow', icon: 'fire' },
  { id: 'c-maj9', label: 'Open', icon: 'waves' },
  { id: 'g-min9', label: 'Velvet', icon: 'moon' },
  { id: 'a-min9', label: 'Air', icon: 'wind' },
]

/** Awake to asleep. */
const PULSE_CHOICES: (SleepBandId | 'off')[] = ['off', 'alpha', 'theta', 'delta']
const GREEK: Record<SleepBandId, string> = { alpha: 'α', theta: 'θ', delta: 'δ' }
const STRENGTHS: ('subtle' | 'deep')[] = ['subtle', 'deep']
const ICONS_PER_ROW = 8
const ICON_GAP = 8

/** The mix in a few plain words ("A low fire, rain and glow chords"): a saved sound's subtitle when it has none. */
export function describeMix(mix: Mix): string {
  const parts = LAYER_ORDER.map((id) => [id, mix.layers[id] ?? 0] as const)
    .filter(([, g]) => g > 0.06)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([id]) => LAYER_WORDS[id])
  if ((mix.padGain ?? 0) > 0.04) {
    const colour = CHORD_COLOURS.find((c) => c.id === (mix.harmonicKey ?? DEFAULT_HARMONIC_KEY))?.label ?? 'soft'
    parts.push(`${colour.toLowerCase()} chords`)
  }
  if (parts.length === 0) return copy.silence
  const text = parts.length === 1 ? parts[0]! : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/* --- Small still waves: the same shapes the picture draws ---------------- */

type WaveKind = LayerId | SleepBandId | 'off' | 'gentle' | 'strong'
const WAVE: Record<WaveKind, { cycles: number; amp: number; swell?: boolean }> = {
  rain: { cycles: 7, amp: 0.55 },
  waves: { cycles: 2.5, amp: 0.9, swell: true },
  fire: { cycles: 4, amp: 0.7 },
  wind: { cycles: 1.2, amp: 0.8 },
  brown: { cycles: 1.5, amp: 0.85 },
  pink: { cycles: 4, amp: 0.7 },
  white: { cycles: 11, amp: 0.55 },
  off: { cycles: 1, amp: 0 },
  alpha: { cycles: 6, amp: 0.7 },
  theta: { cycles: 3.5, amp: 0.7 },
  delta: { cycles: 1.5, amp: 0.7 },
  gentle: { cycles: 3, amp: 0.28 },
  strong: { cycles: 3, amp: 0.9 },
}

function WaveGlyph({ kind, color, width = 28, height = 12 }: { kind: WaveKind; color: string; width?: number; height?: number }) {
  const w = WAVE[kind]
  const mid = height / 2
  let d = ''
  for (let x = 0; x <= width; x += 1) {
    const u = x / width
    const env = w.swell ? 0.35 + 0.65 * Math.sin(Math.PI * u) : 1
    const y = mid + Math.sin(u * Math.PI * 2 * w.cycles) * (height / 2 - 1.2) * w.amp * env
    d += `${x === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`
  }
  return (
    <Svg width={width} height={height}>
      <Path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}

/* --- Guides: a second sheet with when-to-use-what ---------------------- */

function GuideSheet({ topic, onClose }: { topic: GuideTopic | null; onClose: () => void }) {
  const { color } = useTokenColors()
  // Keep showing the last topic while the sheet slides away.
  const [shown, setShown] = useState<GuideTopic>(topic ?? 'sounds')
  useEffect(() => {
    if (topic) setShown(topic)
  }, [topic])
  const guide = studioGuides[shown]

  const lead = (row: GuideRow) => {
    if (shown === 'sounds') return <WaveGlyph kind={row.id as LayerId} color={LAYER_COLORS[row.id as LayerId]} width={34} height={16} />
    if (shown === 'pulse') {
      const kind: WaveKind = row.id === 'subtle' ? 'gentle' : row.id === 'deep' ? 'strong' : (row.id as WaveKind)
      return <WaveGlyph kind={kind} color={color.accent} width={34} height={16} />
    }
    if (row.id === 'up') return <ArrowUp size={18} strokeWidth={1.8} color={color.accent} />
    if (row.id === 'down') return <ArrowDown size={18} strokeWidth={1.8} color={color.ink3} />
    const chip = CHORD_COLOURS.find((c) => c.id === row.id)
    return chip ? <SoundGlyph icon={chip.icon} size={18} color={color.accent} /> : null
  }

  return (
    <Sheet
      open={topic !== null}
      onClose={onClose}
      label={guide.title}
      footer={
        <Button variant="quiet" block onPress={onClose}>
          Got it
        </Button>
      }
    >
      <View style={styles.guide}>
        <Text style={[styles.title, { color: color.ink }]}>{guide.title}</Text>
        <Text style={[styles.guideIntro, { color: color.ink2 }]}>{guide.intro}</Text>
        {guide.sections.map((section, si) => (
          <View key={si} style={styles.guideSection}>
            {section.title ? <Text style={[styles.guideSectionTitle, { color: color.ink3 }]}>{section.title.toUpperCase()}</Text> : null}
            {section.note ? <Text style={[styles.guideNote, { color: color.ink3 }]}>{section.note}</Text> : null}
            <View style={styles.guideRows}>
              {section.rows.map((row) => (
                <View key={row.id} style={styles.guideRow}>
                  <View style={styles.guideLead}>{lead(row)}</View>
                  <View style={styles.guideText}>
                    <Text style={[styles.guideName, { color: color.ink }]}>
                      {row.name}
                      {row.tag ? <Text style={[styles.guideTag, { color: color.ink3 }]}>{`  ${row.tag}`}</Text> : null}
                    </Text>
                    <Text style={[styles.guideUse, { color: color.ink2 }]}>{row.use}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        ))}
        {guide.tip ? (
          <View style={[styles.guideTip, { backgroundColor: GLASS_TINT.suggested }]}>
            <Text style={[styles.guideTipText, { color: color.ink }]}>{guide.tip}</Text>
          </View>
        ) : null}
      </View>
    </Sheet>
  )
}

/** A section's name, with its guide one tap away. */
function SectionHead({ title, onInfo }: { title: string; onInfo: () => void }) {
  const { color } = useTokenColors()
  return (
    <Pressable
      onPress={() => {
        feel('tick')
        onInfo()
      }}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${copy.guide}`}
      style={({ pressed }) => [styles.sectionHead, { opacity: pressed ? 0.7 : 1 }]}
    >
      <Text style={[styles.sectionLabel, { color: color.ink2 }]}>{title}</Text>
      <Info size={15} strokeWidth={1.8} color={color.accent} />
    </Pressable>
  )
}

/**
 * A vertical fader in its layer's colour. Follows the finger at once, tells
 * the sound ~12 times a second, and holds the sheet still while it's touched.
 */
function Fader({ id, label, sub, value, onChange }: { id: LayerId; label: string; sub?: string; value: number; onChange: (v: number) => void }) {
  const { color } = useTokenColors()
  const lockScroll = useSheetScrollLock()
  const [local, setLocal] = useState(value)
  const dragging = useRef(false)
  const heightRef = useRef(100)
  const lastEmit = useRef(0)
  const lastTick = useRef(Math.round(value * 10))
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const lockRef = useRef(lockScroll)
  lockRef.current = lockScroll

  useEffect(() => {
    if (!dragging.current) setLocal(value)
  }, [value])

  const fromY = (y: number, force: boolean) => {
    const v = Math.round(Math.min(1, Math.max(0, 1 - y / Math.max(1, heightRef.current))) * 50) / 50
    setLocal(v)
    const tick = Math.round(v * 10)
    if (tick !== lastTick.current) {
      lastTick.current = tick
      feel('tick')
    }
    const now = Date.now()
    if (!force && now - lastEmit.current < 80) return
    lastEmit.current = now
    onChangeRef.current(v)
  }

  const end = () => {
    dragging.current = false
    lockRef.current(false)
  }

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: (e) => {
        dragging.current = true
        lockRef.current(true)
        fromY(e.nativeEvent.locationY, true)
      },
      onPanResponderMove: (e) => fromY(e.nativeEvent.locationY, false),
      onPanResponderRelease: (e) => {
        fromY(e.nativeEvent.locationY, true)
        end()
      },
      onPanResponderTerminate: end,
    }),
  ).current

  const v = Math.min(1, Math.max(0, local))
  const on = v > 0.01
  const tint = LAYER_COLORS[id]
  return (
    <View style={styles.faderCol}>
      <View
        {...pan.panHandlers}
        onLayout={(e) => {
          heightRef.current = e.nativeEvent.layout.height
        }}
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ min: 0, max: 100, now: Math.round(v * 100) }}
        style={styles.faderTrack}
      >
        <View pointerEvents="none" style={[styles.faderFill, { height: `${Math.round(v * 100)}%`, backgroundColor: tint, opacity: on ? 0.5 : 0 }]} />
        <View pointerEvents="none" style={[styles.faderCap, { bottom: `${Math.round(v * 100)}%`, backgroundColor: on ? tint : 'rgba(255,255,255,0.18)' }]} />
      </View>
      <Text style={[styles.faderLabel, { color: on ? color.ink : color.ink3 }]} numberOfLines={1}>
        {label}
      </Text>
      {sub ? <Text style={[styles.faderSub, { color: color.ink3 }]}>{sub}</Text> : null}
    </View>
  )
}

/**
 * The Mix studio. Play and Save at the top; under them a picture of the sound
 * (one line per sound), then the controls in plain words, each with a guide
 * one tap away. Saving makes a new sound of their own, with a name, a few
 * optional words and an icon; it gets its own tile on Sounds.
 */
export function MixSheet({
  open,
  target,
  onClose,
  mix,
  onChange,
  onReset,
  playing,
  onTogglePlay,
  onSave,
  onDelete,
}: {
  open: boolean
  target: StudioTarget
  onClose: () => void
  mix: Mix
  onChange: (next: Mix) => void
  onReset: () => void
  playing: boolean
  onTogglePlay: () => void
  /** `asNew`: keep the saved sound being edited and make another. */
  onSave: (meta: SoundMeta, asNew: boolean) => void
  onDelete: (id: string) => void
}) {
  const { color } = useTokenColors()
  const reduced = useReducedMotion()
  const appActive = useAppActive()
  const descent = useSound((s) => s.descent)
  const modulationDepth = useSettings((s) => s.modulationDepth)
  const setSettings = useSettings((s) => s.set)

  const [step, setStep] = useState<'mix' | 'name'>('mix')
  const [guide, setGuide] = useState<GuideTopic | null>(null)
  const [scopeW, setScopeW] = useState(0)
  const saved = target.kind === 'saved' ? target.sound : null
  const [name, setName] = useState('')
  const [hint, setHint] = useState('')
  const [icon, setIcon] = useState<SoundIconId>('moon')
  const [gridW, setGridW] = useState(0)
  const hintRef = useRef<ComponentRef<typeof TextInput>>(null)

  // Each time it opens: back to the mixer, the form filled for a saved sound.
  useEffect(() => {
    if (!open) return
    setStep('mix')
    setGuide(null)
    setName(saved?.name ?? '')
    setHint(saved?.hint ?? '')
    setIcon(saved?.icon ?? 'moon')
  }, [open, saved])

  const activeBand = normalizeBand(mix.band)
  const pulseOn = Boolean(activeBand) && mix.bandGain > 0.02 && modulationDepth !== 'off'
  const pulseChoice: SleepBandId | 'off' = pulseOn && activeBand ? activeBand : 'off'
  const padGain = mix.padGain ?? 0
  const activeKey: HarmonicKeyId = mix.harmonicKey ?? DEFAULT_HARMONIC_KEY
  // The rate really playing (the slow-down's near bedtime), the same as the Sounds chip.
  const pulseHz = pulseOn ? (pulseRate(activeBand, descent) ?? 0) : 0
  const strength: 'subtle' | 'deep' = modulationDepth === 'deep' ? 'deep' : 'subtle'

  const layerValue = (id: LayerId) => mix.layers[id] ?? 0
  const setLayer = (id: LayerId, v: number) => onChange({ ...mix, layers: { ...mix.layers, [id]: v } })
  const setPad = (v: number) => onChange({ ...mix, padGain: v })

  const setColour = (keyId: HarmonicKeyId) => {
    feel('tick')
    void sound.unlock()
    sound.setHarmonicKey?.(keyId)
    sound.cue('chime', 0.85)
    onChange({
      ...mix,
      harmonicKey: keyId,
      carrier: HARMONIC_KEYS[keyId].rootHz,
      padGain: padGain > 0.02 ? padGain : 0.5,
    })
  }

  const setPulse = (next: SleepBandId | 'off') => {
    feel('tick')
    if (next === 'off') {
      onChange({ ...mix, band: null })
      return
    }
    // Strength is shared by every sound; "off" there would hide the pulse just chosen.
    if (modulationDepth === 'off') setSettings({ modulationDepth: 'subtle' })
    onChange({ ...mix, band: next, bandGain: mix.bandGain > 0.02 ? mix.bandGain : 0.44 })
  }

  const setStrength = (next: ModulationDepth) => {
    if (next === modulationDepth) return
    feel('tick')
    setSettings({ modulationDepth: next })
    setTimeout(() => useSound.getState().syncDescent(new Date(), 0.6), 0)
  }

  // The picture's rows: the sounds that are up, then chords, then the pulse.
  const levels = new Array<number>(ROW_COUNT).fill(0)
  LAYER_ORDER.forEach((id, k) => {
    levels[k] = layerValue(id)
  })
  levels[ROW_CHORDS] = padGain
  levels[ROW_PULSE] = pulseOn ? (strength === 'deep' ? 1 : 0.5) : 0
  const rowOf = new Array<number>(ROW_COUNT).fill(-1)
  const rowLabels: { text: string; color: string }[] = []
  levels.forEach((lv, k) => {
    if (lv <= 0.02) return
    rowOf[k] = rowLabels.length
    if (k < ROW_CHORDS) rowLabels.push({ text: LAYERS[k]!.short, color: LAYER_COLORS[LAYER_ORDER[k]!] })
    else if (k === ROW_CHORDS) rowLabels.push({ text: copy.rowChords, color: color.accent })
    else if (activeBand) rowLabels.push({ text: `${GREEK[activeBand]} ${copy.bands[activeBand].name}`, color: color.accent })
  })
  const rowColors = [...LAYER_ORDER.map((id) => LAYER_COLORS[id]), color.accent, color.accent]

  const title = target.kind === 'saved' ? target.sound.name : target.kind === 'new' ? copy.titleNew : copy.titleEdit
  const canSave = name.trim().length > 0
  const save = (asNew: boolean) => {
    if (!canSave) return
    feel('commit')
    onSave({ name: name.trim(), hint: hint.trim(), icon }, asNew)
  }

  const mixStep = (
    <View style={styles.body}>
      {/* Title, then hear it and keep it, up top where they're expected. */}
      <View style={styles.head}>
        <Text style={[styles.title, styles.titleFlex, { color: color.ink }]} numberOfLines={1}>
          {title}
        </Text>
        {target.kind === 'current' ? (
          <Pressable
            onPress={() => {
              feel('tick')
              onReset()
            }}
            accessibilityRole="button"
            accessibilityLabel={copy.reset}
            style={({ pressed }) => [{ transform: [{ scale: pressed ? 0.94 : 1 }] }]}
          >
            <GlassSurface variant="pill" radius={20} interactive style={styles.playBtn}>
              <RotateCcw size={16} strokeWidth={1.9} color={color.ink2} />
            </GlassSurface>
          </Pressable>
        ) : null}
        <Pressable
          onPress={() => {
            feel('settle')
            onTogglePlay()
          }}
          accessibilityRole="button"
          accessibilityLabel={playing ? copy.pause : copy.play}
          style={({ pressed }) => [{ transform: [{ scale: pressed ? 0.94 : 1 }] }]}
        >
          <GlassSurface variant="pill" radius={20} interactive style={styles.playBtn}>
            {playing ? (
              <Pause size={16} strokeWidth={1.8} color={color.ink} fill={color.ink} />
            ) : (
              <Play size={16} strokeWidth={1.8} color={color.ink} fill={color.ink} style={styles.playGlyph} />
            )}
          </GlassSurface>
        </Pressable>
        <Button
          size="sm"
          variant="primary"
          onPress={() => {
            feel('tick')
            setStep('name')
          }}
        >
          {saved ? copy.save : copy.saveNew}
        </Button>
      </View>
      {target.kind === 'new' ? <Text style={[styles.lede, { color: color.ink3 }]}>{copy.startsFrom(target.from)}</Text> : null}

      {/* The picture: one line per sound, in its fader's colour. */}
      <View style={styles.scopeCard}>
        {rowLabels.length > 0 ? (
          <View style={styles.scopeRows}>
            <View style={styles.scopeLabels}>
              {rowLabels.map((r, i) => (
                <View key={i} style={{ height: ROW_H, justifyContent: 'center' }}>
                  <Text style={[styles.scopeLabel, { color: r.color }]} numberOfLines={1}>
                    {r.text}
                  </Text>
                </View>
              ))}
            </View>
            <View
              style={styles.scopeLines}
              onLayout={(e: LayoutChangeEvent) => {
                const w = Math.floor(e.nativeEvent.layout.width)
                if (w > 0 && w !== scopeW) setScopeW(w)
              }}
            >
              {scopeW > 0 ? (
                <StudioScope
                  width={scopeW}
                  rowOf={rowOf}
                  levels={levels}
                  colors={rowColors}
                  pulseHz={pulseHz}
                  playing={playing}
                  animate={open && appActive && !reduced && guide === null}
                />
              ) : null}
            </View>
          </View>
        ) : (
          <Text style={[styles.silence, { color: color.ink3 }]}>{copy.silence}</Text>
        )}
        <View style={[styles.scopeFoot, { borderTopColor: color.line }]}>
          <Text style={[styles.legend, { color: color.ink3 }]}>{copy.legend}</Text>
          {pulseOn && activeBand ? (
            <Text style={[styles.pulseLine, { color: color.accent }]} numberOfLines={1}>
              {copy.pulseAims(copy.bands[activeBand].target, pulseHz.toFixed(1))}
            </Text>
          ) : null}
        </View>
      </View>

      {/* Sounds: nature and the three noises. */}
      <View style={styles.section}>
        <SectionHead title={copy.sounds} onInfo={() => setGuide('sounds')} />
        <View style={styles.faderGroups}>
          <View style={[styles.faderGroup, { flex: 4 }]}>
            {NATURE.map((id) => (
              <Fader key={id} id={id} label={LAYERS.find((l) => l.id === id)!.short} value={layerValue(id)} onChange={(v) => setLayer(id, v)} />
            ))}
          </View>
          <View style={[styles.groupRule, { backgroundColor: color.line }]} />
          <View style={[styles.faderGroup, { flex: 3 }]}>
            {NOISE.map((id) => (
              <Fader
                key={id}
                id={id}
                label={LAYERS.find((l) => l.id === id)!.short}
                sub={copy.noiseWords[id]}
                value={layerValue(id)}
                onChange={(v) => setLayer(id, v)}
              />
            ))}
          </View>
        </View>
      </View>

      {/* Chords: how loud, and their colour (tap to hear). */}
      <View style={styles.section}>
        <SectionHead title={copy.chords} onInfo={() => setGuide('chords')} />
        <PillSlider
          value={padGain}
          onChange={setPad}
          title="Loudness"
          label={copy.chords}
          valueLabel={(p) => (p < 0.02 ? 'Off' : `${Math.round(p * 100)}%`)}
          fillColors={['rgba(194, 161, 95, 0.16)', 'rgba(194, 161, 95, 0.42)']}
        />
        <View style={styles.chipGrid}>
          {CHORD_COLOURS.map((c) => {
            const active = activeKey === c.id && padGain > 0.02
            return (
              <Pressable
                key={c.id}
                onPress={() => setColour(c.id)}
                accessibilityRole="radio"
                accessibilityState={{ checked: active }}
                style={({ pressed }) => [
                  styles.chip,
                  { backgroundColor: active ? GLASS_TINT.selected : 'rgba(255,255,255,0.05)', transform: [{ scale: pressed ? 0.97 : 1 }] },
                ]}
              >
                <SoundGlyph icon={c.icon} size={15} color={active ? color.accent : color.ink3} />
                <Text style={[styles.chipText, { color: active ? color.ink : color.ink2 }]}>{c.label}</Text>
              </Pressable>
            )
          })}
        </View>
      </View>

      {/* Pulse: what it's for, from awake to asleep; then how strong. */}
      <View style={styles.section}>
        <SectionHead title={copy.pulse} onInfo={() => setGuide('pulse')} />
        <View style={styles.pulseRow}>
          {PULSE_CHOICES.map((id) => {
            const active = pulseChoice === id
            return (
              <Pressable
                key={id}
                onPress={() => setPulse(id)}
                accessibilityRole="radio"
                accessibilityState={{ checked: active }}
                accessibilityLabel={`${copy.bands[id].name}, ${copy.bands[id].target}`}
                style={({ pressed }) => [
                  styles.pulseCard,
                  { backgroundColor: active ? GLASS_TINT.selected : 'rgba(255,255,255,0.05)', transform: [{ scale: pressed ? 0.97 : 1 }] },
                ]}
              >
                <WaveGlyph kind={id} color={active ? color.accent : color.ink3} />
                <Text style={[styles.pulseName, { color: active ? color.ink : color.ink2 }]} numberOfLines={1}>
                  {copy.bands[id].name}
                </Text>
                <Text style={[styles.pulseGreek, { color: color.ink3 }]}>{id === 'off' ? ' ' : GREEK[id]}</Text>
              </Pressable>
            )
          })}
        </View>
        {pulseOn ? (
          <View style={styles.strengthRow}>
            {STRENGTHS.map((id) => {
              const active = strength === id
              return (
                <Pressable
                  key={id}
                  onPress={() => setStrength(id)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: active }}
                  accessibilityLabel={`${copy.pulseStrength}: ${copy.strengths[id].name}`}
                  style={({ pressed }) => [
                    styles.strengthCard,
                    { backgroundColor: active ? GLASS_TINT.selected : 'rgba(255,255,255,0.05)', transform: [{ scale: pressed ? 0.97 : 1 }] },
                  ]}
                >
                  <WaveGlyph kind={id === 'deep' ? 'strong' : 'gentle'} color={active ? color.accent : color.ink3} width={34} height={18} />
                  <View>
                    <Text style={[styles.strengthName, { color: active ? color.ink : color.ink2 }]}>{copy.strengths[id].name}</Text>
                    <Text style={[styles.strengthSub, { color: color.ink3 }]}>{copy.strengths[id].sub}</Text>
                  </View>
                </Pressable>
              )
            })}
          </View>
        ) : null}
      </View>

    </View>
  )

  const nameStep = (
    <View style={styles.body}>
      {/* Save sits up here, so the keyboard never covers it. */}
      <View style={styles.head}>
        <Pressable onPress={() => setStep('mix')} hitSlop={10} accessibilityRole="button" accessibilityLabel={copy.back} style={styles.backBtn}>
          <ChevronLeft size={22} strokeWidth={1.8} color={color.ink2} />
        </Pressable>
        <Text style={[styles.title, styles.titleFlex, { color: color.ink }]} numberOfLines={1}>
          {saved ? copy.detailsTitle : copy.nameTitle}
        </Text>
        <Button size="sm" variant="primary" disabled={!canSave} onPress={() => save(false)}>
          {saved ? copy.saveChanges : copy.save}
        </Button>
      </View>

      <View style={styles.field}>
        <Text style={[styles.fieldLabel, { color: color.ink2 }]}>{copy.nameLabel}</Text>
        <GlassSurface variant="card" radius={16} style={styles.inputWrap}>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder={copy.namePlaceholder}
            placeholderTextColor={color.ink4}
            autoCapitalize="sentences"
            autoFocus={!saved}
            maxLength={24}
            returnKeyType="next"
            onSubmitEditing={() => hintRef.current?.focus()}
            submitBehavior="submit"
            style={[styles.input, { color: color.ink }]}
            accessibilityLabel={copy.nameLabel}
          />
        </GlassSurface>
      </View>

      <View style={styles.field}>
        <View style={styles.fieldHead}>
          <Text style={[styles.fieldLabel, { color: color.ink2 }]}>{copy.hintLabel}</Text>
          <Text style={[styles.fieldOptional, { color: color.ink4 }]}>{copy.hintOptional}</Text>
        </View>
        <GlassSurface variant="card" radius={16} style={styles.inputWrap}>
          <TextInput
            ref={hintRef}
            value={hint}
            onChangeText={setHint}
            placeholder={copy.hintPlaceholder}
            placeholderTextColor={color.ink4}
            autoCapitalize="sentences"
            maxLength={34}
            returnKeyType="done"
            style={[styles.input, { color: color.ink }]}
            accessibilityLabel={copy.hintLabel}
          />
        </GlassSurface>
      </View>

      <View style={styles.field}>
        <Text style={[styles.fieldLabel, { color: color.ink2 }]}>{copy.iconLabel}</Text>
        {/* Eight square cells to a row, sized from the row's width. */}
        <View
          style={styles.iconGrid}
          accessibilityRole="radiogroup"
          onLayout={(e: LayoutChangeEvent) => {
            const w = Math.floor(e.nativeEvent.layout.width)
            if (w > 0 && w !== gridW) setGridW(w)
          }}
        >
          {gridW > 0
            ? CUSTOM_ICONS.map((ic) => {
                const active = ic === icon
                const cell = Math.floor((gridW - ICON_GAP * (ICONS_PER_ROW - 1)) / ICONS_PER_ROW)
                return (
                  <Pressable
                    key={ic}
                    onPress={() => {
                      feel('tick')
                      setIcon(ic)
                    }}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: active }}
                    accessibilityLabel={ic.replace('-', ' ')}
                    style={({ pressed }) => [
                      styles.iconCell,
                      {
                        width: cell,
                        height: cell,
                        backgroundColor: active ? GLASS_TINT.selected : 'rgba(255,255,255,0.05)',
                        transform: [{ scale: pressed ? 0.94 : 1 }],
                      },
                    ]}
                  >
                    <SoundGlyph icon={ic} size={19} color={active ? color.accent : color.ink2} />
                  </Pressable>
                )
              })
            : null}
        </View>
      </View>

      {saved ? (
        <>
          <Button variant="quiet" block disabled={!canSave} onPress={() => save(true)}>
            {copy.saveAsNew}
          </Button>
          <HoldButton label={copy.deleteHold} onConfirm={() => onDelete(saved.id)} />
        </>
      ) : null}
    </View>
  )

  return (
    <>
      <Sheet open={open} onClose={onClose} label="Composer">
        {step === 'mix' ? mixStep : nameStep}
      </Sheet>
      <GuideSheet topic={open ? guide : null} onClose={() => setGuide(null)} />
    </>
  )
}

const styles = StyleSheet.create({
  body: {
    gap: 18,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 40,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    letterSpacing: -0.3,
  },
  titleFlex: {
    flex: 1,
  },
  titleCentered: {
    flex: 1,
    textAlign: 'center',
  },
  playBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playGlyph: {
    marginLeft: 2,
  },
  lede: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: -10,
  },
  backBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scopeCard: {
    borderRadius: 20,
    borderCurve: 'continuous',
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.035)',
    paddingTop: 8,
  },
  scopeRows: {
    flexDirection: 'row',
    paddingLeft: 14,
    paddingRight: 10,
  },
  scopeLabels: {
    width: 78,
  },
  scopeLabel: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  scopeLines: {
    flex: 1,
  },
  silence: {
    fontSize: 13.5,
    textAlign: 'center',
    paddingVertical: 22,
  },
  scopeFoot: {
    marginTop: 8,
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 11,
    gap: 3,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  legend: {
    fontSize: 12,
    lineHeight: 16,
  },
  pulseLine: {
    fontSize: 12,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  section: {
    gap: 10,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  faderGroups: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 10,
  },
  faderGroup: {
    flexDirection: 'row',
    gap: 7,
  },
  groupRule: {
    width: StyleSheet.hairlineWidth,
    marginBottom: 30,
  },
  faderCol: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  faderTrack: {
    width: '100%',
    height: 150,
    borderRadius: 14,
    borderCurve: 'continuous',
    overflow: 'hidden',
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  faderFill: {
    width: '100%',
  },
  faderCap: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 2,
  },
  faderLabel: {
    fontSize: 11.5,
    fontWeight: '500',
  },
  faderSub: {
    fontSize: 10,
    marginTop: -5,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  chip: {
    width: '31.5%',
    flexGrow: 1,
    height: 40,
    borderRadius: 12,
    borderCurve: 'continuous',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '500',
  },
  pulseRow: {
    flexDirection: 'row',
    gap: 7,
  },
  pulseCard: {
    flex: 1,
    height: 66,
    borderRadius: 14,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 4,
  },
  pulseName: {
    fontSize: 12.5,
    fontWeight: '500',
  },
  pulseGreek: {
    fontSize: 11,
    marginTop: -2,
  },
  strengthRow: {
    flexDirection: 'row',
    gap: 7,
  },
  strengthCard: {
    flex: 1,
    height: 56,
    borderRadius: 14,
    borderCurve: 'continuous',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
  },
  strengthName: {
    fontSize: 14,
    fontWeight: '600',
  },
  strengthSub: {
    fontSize: 12,
    marginTop: 1,
  },
  guide: {
    gap: 16,
  },
  guideIntro: {
    fontSize: 14.5,
    lineHeight: 21,
    marginTop: -6,
  },
  guideSection: {
    gap: 8,
  },
  guideSectionTitle: {
    fontSize: 11.5,
    fontWeight: '600',
    letterSpacing: 0.8,
  },
  guideNote: {
    fontSize: 13,
    lineHeight: 18,
  },
  guideRows: {
    gap: 12,
    marginTop: 2,
  },
  guideRow: {
    flexDirection: 'row',
    gap: 12,
  },
  guideLead: {
    width: 36,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guideText: {
    flex: 1,
    gap: 2,
  },
  guideName: {
    fontSize: 15,
    fontWeight: '600',
  },
  guideTag: {
    fontSize: 12.5,
    fontWeight: '500',
  },
  guideUse: {
    fontSize: 13.5,
    lineHeight: 19,
  },
  guideTip: {
    borderRadius: 14,
    borderCurve: 'continuous',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  guideTipText: {
    fontSize: 13.5,
    lineHeight: 19,
  },
  field: {
    gap: 7,
  },
  fieldHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  fieldOptional: {
    fontSize: 12,
  },
  inputWrap: {
    height: 48,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  input: {
    fontSize: 16,
    paddingVertical: 0,
  },
  iconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: ICON_GAP,
  },
  iconCell: {
    borderRadius: 12,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
})
