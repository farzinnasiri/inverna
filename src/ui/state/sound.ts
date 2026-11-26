import { create } from 'zustand'
import { computeDescent, type DescentSnapshot } from '@/core/sound/arc'
import { minutesUntilRangeEnd } from '@/core/night'
import { DEFAULT_PRESET_ID, isSilent, presetById, type Mix, type SoundIconId } from '@/core/sound/catalog'
import { DEFAULT_HARMONIC_KEY, type HarmonicKeyId } from '@/core/sound/harmonics'
import { sound } from '@/platform'
import { useSession } from './session'
import { currentSchedule, useSettings } from './settings'

interface SoundState {
  playing: boolean
  presetId: string | null
  mix: Mix | null
  harmonicKey: HarmonicKeyId
  descent: DescentSnapshot
  volume: number
  stopAt: number | null
  playPreset: (id: string, timerMinutes?: number) => void
  /** What the lock screen calls a mix: a saved sound's name, or "Your mix". */
  mixMeta: MixMeta | null
  playMix: (mix: Mix, timerMinutes?: number, meta?: MixMeta | null) => void
  /** `meta` renames what's playing; left out, the name stays. */
  updateMix: (mix: Mix, meta?: MixMeta | null) => void
  setVolume: (volume: number) => void
  setTimer: (minutes: number) => void
  syncDescent: (now?: Date, rampSeconds?: number) => DescentSnapshot
  stop: (fadeSeconds?: number, opts?: { hideNotification?: boolean }) => void
}

export interface MixMeta {
  title: string
  hint: string
  icon: SoundIconId
}

const SLEEP_FADE_SECONDS = 12

/** Sleep-timer choice meaning "fade out at the end of my sleep time" (the late edge of the range). */
export const UNTIL_LIGHTS_OUT = -1
/** Past the end of the sleep time already: fade after this long rather than play all night. */
const LATE_FADE_MIN = 45

/** Minutes until the sound should fade (0 = no timer) for a timer choice. */
export function resolveTimer(choice: number, now = new Date()): number {
  if (choice !== UNTIL_LIGHTS_OUT) return Math.max(0, choice)
  const until = minutesUntilRangeEnd(currentSchedule(now), now)
  if (until === null) return 0
  return until > 0 && until <= 12 * 60 ? until : LATE_FADE_MIN
}

const timerToStopAt = (minutes: number | undefined) => (minutes && minutes > 0 ? Date.now() + minutes * 60_000 : null)

function syncNativeSleepFade(minutes: number | undefined) {
  if (minutes && minutes > 0) {
    sound.scheduleSleepFade?.(minutes * 60, SLEEP_FADE_SECONDS)
  } else {
    sound.cancelSleepFade?.()
  }
}

function inferIconFromMix(mix: Mix | null): SoundIconId {
  if (!mix) return 'rain'
  if (mix.classicalMotif === 'reverie') return 'feather'
  if (mix.classicalMotif === 'adagio') return 'disc'
  if (mix.classicalMotif === 'nocturne') return 'piano'
  const l = mix.layers
  const ranked: [SoundIconId, number][] = [
    ['rain', l.rain ?? 0],
    ['waves', l.waves ?? 0],
    ['fire', l.fire ?? 0],
    ['wind', l.wind ?? 0],
    ['moon', (l.brown ?? 0) + (l.pink ?? 0) * 0.6 + (mix.band === 'delta' ? 0.5 : 0)],
  ]
  ranked.sort((a, b) => b[1] - a[1])
  return ranked[0]![1] > 0.05 ? ranked[0]![0] : 'rain'
}

function buildDescentSnapshot(presetId: string | null, now = new Date()): DescentSnapshot {
  const settings = useSettings.getState()
  const session = useSession.getState().session
  const preset = presetById(presetId ?? settings.sessionPreset ?? DEFAULT_PRESET_ID)
  return computeDescent({
    schedule: currentSchedule(now),
    now,
    session,
    preset,
    depth: settings.modulationDepth,
    followBedtime: settings.autoDescent,
  })
}

function mixNowPlaying(mix: Mix, meta: MixMeta | null, choice: number) {
  return {
    title: meta?.title ?? 'Your mix',
    subtitle: nowPlayingSubtitle(meta?.hint || 'Your own sleep sound', choice),
    icon: meta?.icon ?? inferIconFromMix(mix),
  }
}

function nowPlayingSubtitle(hint: string, choice: number): string {
  if (choice === UNTIL_LIGHTS_OUT) return resolveTimer(choice) > 0 ? `${hint} (stops at bedtime)` : hint
  return choice > 0 ? `${hint} (${choice} min timer)` : hint
}

export const useSound = create<SoundState>()((set, get) => {
  sound.onExternalPause?.(() => {
    sound.cancelSleepFade?.()
    set({ playing: false, stopAt: null })
  })
  sound.onExternalPlay?.((mix) => {
    const mins = resolveTimer(useSettings.getState().sleepTimer)
    syncNativeSleepFade(mins)
    // The engine resumes the last mix that made sound, which may not be the
    // store's if the mix was turned all the way down since.
    const current = get().mix
    set({ playing: true, stopAt: timerToStopAt(mins), ...(current && isSilent(current) ? { mix } : null) })
  })

  const initialPreset = presetById(useSettings.getState().sessionPreset ?? DEFAULT_PRESET_ID)
  const initialKey = initialPreset?.harmonicKey ?? DEFAULT_HARMONIC_KEY
  const initialDescent = buildDescentSnapshot(initialPreset?.id ?? DEFAULT_PRESET_ID)
  sound.setHarmonicKey?.(initialKey)
  sound.setDescent?.(initialDescent, 0.1)

  return {
    playing: false,
    presetId: null,
    mix: null,
    mixMeta: null,
    harmonicKey: initialKey,
    descent: initialDescent,
    volume: useSettings.getState().volume,
    stopAt: null,

    playPreset: (id, timerMinutes) => {
      const preset = presetById(id)
      if (!preset) return
      void sound.unlock()
      const choice = timerMinutes ?? useSettings.getState().sleepTimer
      const mins = resolveTimer(choice)
      const descent = buildDescentSnapshot(preset.id)
      sound.setHarmonicKey?.(preset.harmonicKey)
      sound.setDescent?.(descent, 0.6)
      sound.setNowPlayingMeta?.({
        title: preset.name,
        subtitle: nowPlayingSubtitle(preset.hint, choice),
        icon: preset.icon,
        scene: preset.scene,
      })
      sound.setMaster(get().volume, 0.5)
      sound.setMix(preset.mix, 1.4)
      syncNativeSleepFade(mins)
      set({
        playing: true,
        presetId: preset.id,
        mix: preset.mix,
        mixMeta: null,
        harmonicKey: preset.harmonicKey,
        descent,
        stopAt: timerToStopAt(mins),
      })
    },

    playMix: (mix, timerMinutes, meta = null) => {
      // Nothing to hear: stopped, not "playing" silence.
      if (isSilent(mix)) {
        get().stop()
        set({ mix, presetId: null, mixMeta: meta })
        return
      }
      void sound.unlock()
      const choice = timerMinutes ?? useSettings.getState().sleepTimer
      const mins = resolveTimer(choice)
      const key = mix.harmonicKey ?? get().harmonicKey ?? DEFAULT_HARMONIC_KEY
      const descent = buildDescentSnapshot(null)
      sound.setHarmonicKey?.(key)
      sound.setDescent?.(descent, 0.6)
      sound.setNowPlayingMeta?.(mixNowPlaying(mix, meta, choice))
      sound.setMaster(get().volume, 0.5)
      sound.setMix({ ...mix, harmonicKey: key }, 1.2)
      syncNativeSleepFade(mins)
      set({
        playing: true,
        presetId: null,
        mix: { ...mix, harmonicKey: key },
        harmonicKey: key,
        descent,
        stopAt: timerToStopAt(mins),
        mixMeta: meta,
      })
    },

    updateMix: (mix, meta) => {
      const mixMeta = meta === undefined ? get().mixMeta : meta
      const key = mix.harmonicKey ?? get().harmonicKey ?? DEFAULT_HARMONIC_KEY
      const nextMix = { ...mix, harmonicKey: key }
      sound.setHarmonicKey?.(key)
      if (get().playing) {
        const mins = useSettings.getState().sleepTimer
        sound.setNowPlayingMeta?.(mixNowPlaying(nextMix, mixMeta, mins))
        sound.setMix(nextMix, 0.25)
      }
      // Turning every layer down stops the sound in the engine; say so here too,
      // or Play shows a sound that isn't playing and the sleep timer keeps running.
      if (get().playing && isSilent(nextMix)) {
        sound.cancelSleepFade?.()
        set({ mix: nextMix, mixMeta, presetId: null, harmonicKey: key, playing: false, stopAt: null })
        return
      }
      set({ mix: nextMix, mixMeta, presetId: null, harmonicKey: key })
    },

    setVolume: (raw) => {
      const volume = Math.min(1, Math.max(0, raw))
      sound.setMaster(volume, 0.12)
      set({ volume })
      useSettings.getState().set({ volume })
    },

    setTimer: (choice) => {
      const minutes = resolveTimer(choice)
      if (get().playing) {
        const preset = get().presetId ? presetById(get().presetId!) : null
        sound.setNowPlayingMeta?.({
          title: preset?.name ?? 'Your mix',
          subtitle: nowPlayingSubtitle(preset?.hint ?? 'Custom sleep sound', choice),
          icon: preset?.icon ?? inferIconFromMix(get().mix),
          scene: preset?.scene,
        })
        syncNativeSleepFade(minutes)
        set({ stopAt: timerToStopAt(minutes) })
      }
    },

    syncDescent: (now = new Date(), rampSeconds = 3.0) => {
      const state = get()
      const settings = useSettings.getState()
      const activePreset = presetById(state.presetId ?? settings.sessionPreset ?? DEFAULT_PRESET_ID)
      const key = state.mix?.harmonicKey ?? activePreset?.harmonicKey ?? DEFAULT_HARMONIC_KEY
      const next = buildDescentSnapshot(state.presetId ?? activePreset?.id ?? DEFAULT_PRESET_ID, now)

      sound.setHarmonicKey?.(key)
      sound.setDescent?.(next, rampSeconds)

      set({ descent: next, harmonicKey: key })
      return next
    },

    stop: (fadeSeconds = 1.4, opts) => {
      sound.stop(fadeSeconds, opts)
      set({ playing: false, stopAt: null })
    },
  }
})

/**
 * One-tap ambient sound control shared by Play, the game top bar and the game
 * Sound sheet: plays the last chosen sound (or tonight's preset) or fades it out.
 */
export function useAmbientToggle(): { playing: boolean; name: string; icon: SoundIconId; toggle: () => void } {
  const playing = useSound((s) => s.playing)
  const presetId = useSound((s) => s.presetId)
  const sessionPreset = useSettings((s) => s.sessionPreset)
  const id = presetId ?? sessionPreset ?? DEFAULT_PRESET_ID
  const preset = presetById(id)
  const name = preset?.name ?? 'Sound'
  const icon: SoundIconId = preset?.icon ?? 'rain'
  const toggle = () => {
    const st = useSound.getState()
    if (st.playing) st.stop(0.8)
    else st.playPreset(id, useSettings.getState().sleepTimer)
  }
  return { playing, name, icon, toggle }
}
