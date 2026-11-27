import { create } from 'zustand'
import { computeDescent, type DescentSnapshot } from '@/core/sound/arc'
import { minutesUntilRangeEnd } from '@/core/night'
import { sessionEnd } from '@/core/session'
import { DEFAULT_PRESET_ID, isSilent, presetById, SILENT_MIX, type Mix, type SoundIconId } from '@/core/sound/catalog'
import { DEFAULT_HARMONIC_KEY, type HarmonicKeyId } from '@/core/sound/harmonics'
import { sound } from '@/platform'
import { useSession } from './session'
import { currentSchedule, useSettings } from './settings'

interface SoundState {
  playing: boolean
  /** The preset loaded (playing, or last played); null for a mix. */
  presetId: string | null
  /** The mix loaded (playing, or last played). */
  mix: Mix | null
  harmonicKey: HarmonicKeyId
  descent: DescentSnapshot
  volume: number
  /**
   * The one deadline: when the sound fades out (sleep timer, or the end of a
   * wind-down, whichever is first). Kept through an interruption.
   */
  stopAt: number | null
  /** Paused by the OS (a call, Siri), and may play again when it ends. */
  interrupted: boolean
  /** The sleep-timer choice for what's loaded (minutes, 0 = all night, UNTIL_LIGHTS_OUT). */
  timer: number
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
  /** Erase all data: stop, hide Now Playing, and forget what was loaded. */
  reset: () => void
}

export interface MixMeta {
  /** A saved sound's id; none for "Your mix". */
  id?: string
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

/**
 * When sound started now should fade out: the sleep timer, or the end of a
 * wind-down in progress, whichever comes first. Null plays all night.
 */
function deadlineFor(choice: number, now = Date.now()): number | null {
  const minutes = resolveTimer(choice, new Date(now))
  const timer = minutes > 0 ? now + minutes * 60_000 : null
  const { session, ended } = useSession.getState()
  const end = session && !ended ? sessionEnd(session) : null
  if (end === null || end <= now) return timer
  return timer === null ? end : Math.min(timer, end)
}

/** Fade out on the audio clock at the deadline, so it happens even with the phone locked. */
function armDeadline(stopAt: number | null, now = Date.now()) {
  if (stopAt !== null && stopAt > now) sound.scheduleSleepFade?.((stopAt - now) / 1000, SLEEP_FADE_SECONDS)
  else sound.cancelSleepFade?.()
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

/** The descent for what's loaded: `mix` is the sound's own (its pulse band). */
function buildDescentSnapshot(presetId: string | null, mix: Mix | null, now = new Date()): DescentSnapshot {
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
    band: (mix ?? preset?.mix)?.band ?? null,
  })
}

/** The lock screen's title and line for what's loaded. */
function nowPlayingFor(presetId: string | null, mix: Mix | null, meta: MixMeta | null, choice: number) {
  const preset = presetId ? presetById(presetId) : null
  if (preset) {
    return { title: preset.name, subtitle: nowPlayingSubtitle(preset.hint, choice), icon: preset.icon, scene: preset.scene }
  }
  return mixNowPlaying(mix ?? SILENT_MIX, meta, choice)
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
  // The lock screen's Pause and Play are the user's own: Pause clears the
  // deadline, Play starts the timer afresh.
  sound.onExternalPause?.(() => {
    sound.cancelSleepFade?.()
    set({ playing: false, stopAt: null, interrupted: false })
  })
  sound.onExternalPlay?.((mix) => {
    const now = Date.now()
    const stopAt = deadlineFor(get().timer, now)
    armDeadline(stopAt, now)
    // The engine resumes the last mix that made sound, which may not be the
    // store's if the mix was turned all the way down since.
    const current = get().mix
    set({ playing: true, stopAt, interrupted: false, ...(current && isSilent(current) ? { mix } : null) })
  })
  // The deadline came while JS may have been asleep: the engine has already stopped.
  sound.onExpired?.(() => set({ playing: false, stopAt: null, interrupted: false }))
  // A call or Siri: the deadline stays. Playing again afterwards only if
  // nothing stopped the sound meanwhile and the deadline hasn't passed.
  sound.onInterruption?.((event) => {
    if (event.phase === 'began') {
      if (get().playing) set({ playing: false, interrupted: true })
      return
    }
    const { interrupted, stopAt, mix } = get()
    if (!interrupted) return
    const now = Date.now()
    if (!event.shouldResume || !mix) {
      sound.cancelSleepFade?.()
      set({ interrupted: false, stopAt: null })
      return
    }
    if (stopAt !== null && now >= stopAt - SLEEP_FADE_SECONDS * 1000) {
      get().stop(0, { hideNotification: true })
      return
    }
    sound.setMix(mix, 1.0)
    armDeadline(stopAt, now)
    set({ playing: true, interrupted: false })
  })
  // Starting or ending a wind-down moves the deadline of what's playing.
  useSession.subscribe((next, prev) => {
    if (next.session === prev.session && next.ended === prev.ended) return
    if (!get().playing) return
    const now = Date.now()
    const stopAt = deadlineFor(get().timer, now)
    armDeadline(stopAt, now)
    set({ stopAt })
  })

  const initialPreset = presetById(useSettings.getState().sessionPreset ?? DEFAULT_PRESET_ID)
  const initialKey = initialPreset?.harmonicKey ?? DEFAULT_HARMONIC_KEY
  const initialDescent = buildDescentSnapshot(initialPreset?.id ?? DEFAULT_PRESET_ID, initialPreset?.mix ?? null)
  sound.setHarmonicKey?.(initialKey)
  sound.setDescent?.(initialDescent, 0.1)
  // Only tonight's sound is worked out ahead; the rest wait until something plays.
  if (initialPreset) sound.prepare?.(initialPreset.mix)

  return {
    playing: false,
    presetId: null,
    mix: null,
    mixMeta: null,
    harmonicKey: initialKey,
    descent: initialDescent,
    volume: useSettings.getState().volume,
    stopAt: null,
    interrupted: false,
    timer: useSettings.getState().sleepTimer,

    playPreset: (id, timerMinutes) => {
      const preset = presetById(id)
      if (!preset) return
      void sound.unlock()
      const choice = timerMinutes ?? useSettings.getState().sleepTimer
      const now = Date.now()
      const stopAt = deadlineFor(choice, now)
      const descent = buildDescentSnapshot(preset.id, preset.mix)
      sound.setHarmonicKey?.(preset.harmonicKey)
      sound.setDescent?.(descent, 0.6)
      sound.setNowPlayingMeta?.(nowPlayingFor(preset.id, preset.mix, null, choice))
      sound.setMaster(get().volume, 0.5)
      sound.setMix(preset.mix, 1.4)
      // Playing only if the engine really started (no audio context: stays stopped).
      if (!sound.isRunning) return
      armDeadline(stopAt, now)
      set({
        playing: true,
        presetId: preset.id,
        mix: preset.mix,
        mixMeta: null,
        harmonicKey: preset.harmonicKey,
        descent,
        stopAt,
        interrupted: false,
        timer: choice,
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
      const now = Date.now()
      const stopAt = deadlineFor(choice, now)
      const key = mix.harmonicKey ?? get().harmonicKey ?? DEFAULT_HARMONIC_KEY
      const keyed = { ...mix, harmonicKey: key }
      const descent = buildDescentSnapshot(null, mix)
      sound.setHarmonicKey?.(key)
      sound.setDescent?.(descent, 0.6)
      sound.setNowPlayingMeta?.(nowPlayingFor(null, keyed, meta, choice))
      sound.setMaster(get().volume, 0.5)
      sound.setMix(keyed, 1.2)
      if (!sound.isRunning) return
      armDeadline(stopAt, now)
      set({ playing: true, presetId: null, mix: keyed, harmonicKey: key, descent, stopAt, mixMeta: meta, interrupted: false, timer: choice })
    },

    // An edit: what's heard changes, the deadline and its fade don't.
    updateMix: (mix, meta) => {
      const mixMeta = meta === undefined ? get().mixMeta : meta
      const key = mix.harmonicKey ?? get().harmonicKey ?? DEFAULT_HARMONIC_KEY
      const nextMix = { ...mix, harmonicKey: key }
      sound.setHarmonicKey?.(key)
      if (get().playing) {
        sound.setNowPlayingMeta?.(nowPlayingFor(null, nextMix, mixMeta, get().timer))
        sound.setMix(nextMix, 0.25)
      }
      // A new pulse band moves the rate (and what the Sounds chip says).
      if (nextMix.band !== get().mix?.band) {
        const descent = buildDescentSnapshot(null, nextMix)
        sound.setDescent?.(descent, 0.6)
        set({ descent })
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
      const st = get()
      if (!st.playing) return
      const now = Date.now()
      const stopAt = deadlineFor(choice, now)
      sound.setNowPlayingMeta?.(nowPlayingFor(st.presetId, st.mix, st.mixMeta, choice))
      armDeadline(stopAt, now)
      set({ stopAt, timer: choice })
    },

    syncDescent: (now = new Date(), rampSeconds = 3.0) => {
      const state = get()
      const settings = useSettings.getState()
      const activePreset = presetById(state.presetId ?? settings.sessionPreset ?? DEFAULT_PRESET_ID)
      const key = state.mix?.harmonicKey ?? activePreset?.harmonicKey ?? DEFAULT_HARMONIC_KEY
      const next = buildDescentSnapshot(state.presetId ?? activePreset?.id ?? DEFAULT_PRESET_ID, state.mix, now)

      sound.setHarmonicKey?.(key)
      sound.setDescent?.(next, rampSeconds)

      set({ descent: next, harmonicKey: key })
      return next
    },

    stop: (fadeSeconds = 1.4, opts) => {
      sound.stop(fadeSeconds, opts)
      set({ playing: false, stopAt: null, interrupted: false })
    },

    reset: () => {
      sound.cancelSleepFade?.()
      if (sound.reset) sound.reset()
      else sound.stop(0, { hideNotification: true })
      set({ playing: false, presetId: null, mix: null, mixMeta: null, stopAt: null, interrupted: false })
    },
  }
})

/**
 * One-tap ambient sound control shared by Play, the game top bar and the game
 * Sound sheet: plays what played last (a preset, a saved sound by its name,
 * or Your mix), else tonight's preset; or fades it out.
 */
export function useAmbientToggle(): { playing: boolean; name: string; icon: SoundIconId; toggle: () => void } {
  const playing = useSound((s) => s.playing)
  const presetId = useSound((s) => s.presetId)
  const mix = useSound((s) => s.mix)
  const mixMeta = useSound((s) => s.mixMeta)
  const sessionPreset = useSettings((s) => s.sessionPreset)
  const lastIsMix = presetId === null && mix !== null && !isSilent(mix)
  const preset = presetById(presetId ?? sessionPreset ?? DEFAULT_PRESET_ID)
  const name = lastIsMix ? (mixMeta?.title ?? 'Your mix') : (preset?.name ?? 'Sound')
  const icon: SoundIconId = lastIsMix ? (mixMeta?.icon ?? inferIconFromMix(mix)) : (preset?.icon ?? 'rain')
  const toggle = () => {
    const st = useSound.getState()
    const timer = useSettings.getState().sleepTimer
    if (st.playing) st.stop(0.8)
    else if (lastIsMix && st.mix) st.playMix(st.mix, timer, st.mixMeta)
    else st.playPreset(preset?.id ?? DEFAULT_PRESET_ID, timer)
  }
  return { playing, name, icon, toggle }
}
