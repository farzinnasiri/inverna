/**
 * Tells the visuals when the classical motif plays a phrase, with each note's
 * delay, so Nocturne strings can sound with their notes, Ink reverie can drop
 * ink on each phrase and Adagio can move its plate on the harmony changes.
 *
 * Listeners run on the JS thread right after the phrase is scheduled.
 */
import type { ClassicalMotifStyle } from '@/core/sound/catalog'

export interface MotifPhrase {
  style: ClassicalMotifStyle
  /** Flat [delaySeconds, voice, gain, decaySeconds] per note. Voice 0 is the bass, 1 + scale degree otherwise. */
  notes: number[]
}

type Listener = (phrase: MotifPhrase) => void

const listeners = new Set<Listener>()

export function onMotifPhrase(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function emitMotifPhrase(phrase: MotifPhrase): void {
  for (const l of listeners) {
    try {
      l(phrase)
    } catch {
      /* a visual listener must never break the audio scheduler */
    }
  }
}
