/**
 * Wide events: one structured record per unit of work (a launch, a game
 * round, a wind-down, a purchase, a caught error, a crash), carrying all its
 * context, instead of scattered log lines.
 *
 * Switched off, with no sink: Inverna's App Store label is "Data Not
 * Collected" and nothing leaves the phone. To use it, a sink (PostHog or
 * another) is plugged in with `setLogSink`, behind a setting the person
 * controls and an updated privacy page. Until then every call is a cheap
 * no-op. Never put a name, bedtime, check-in answer or anything typed in a
 * field.
 */
import { Platform } from 'react-native'

export type FieldValue = string | number | boolean | null | undefined
export type Fields = Record<string, FieldValue>

export interface WideEvent {
  name: string
  /** When the work started (ms since 1970). */
  at: number
  durationMs: number
  outcome: 'ok' | 'error' | 'cancelled'
  fields: Fields
  error?: { name: string; message: string; stack?: string }
}

export interface LogSink {
  send(event: WideEvent): void
}

let sink: LogSink | null = null
/** Context on every event: what build, which launch. */
const base: Fields = { platform: Platform.OS, launch: Math.random().toString(36).slice(2, 10) }

/** Plug a sink in (or take it out). With none, nothing is recorded. */
export function setLogSink(next: LogSink | null, context: Fields = {}): void {
  sink = next
  Object.assign(base, context)
}

export interface OpenEvent {
  /** Add context as the work goes on. */
  add(fields: Fields): OpenEvent
  /** Mark it failed (the event is still sent once, at end). */
  fail(error: unknown): OpenEvent
  /** Send it. Later calls do nothing. */
  end(outcome?: WideEvent['outcome']): void
}

const NOOP: OpenEvent = { add: () => NOOP, fail: () => NOOP, end: () => {} }

function errorFields(error: unknown): WideEvent['error'] {
  if (error instanceof Error) return { name: error.name, message: error.message, stack: error.stack }
  return { name: 'Unknown', message: String(error) }
}

/** Start one event for a unit of work; `end()` sends it, once. */
export function startEvent(name: string, fields: Fields = {}): OpenEvent {
  if (!sink) return NOOP
  const at = Date.now()
  const merged: Fields = { ...base, ...fields }
  let error: WideEvent['error']
  let sent = false
  const ev: OpenEvent = {
    add(more) {
      Object.assign(merged, more)
      return ev
    },
    fail(e) {
      error = errorFields(e)
      return ev
    },
    end(outcome) {
      if (sent || !sink) return
      sent = true
      try {
        sink.send({ name, at, durationMs: Date.now() - at, outcome: outcome ?? (error ? 'error' : 'ok'), fields: merged, ...(error ? { error } : null) })
      } catch {
        /* logging never breaks the app */
      }
    },
  }
  return ev
}

/** A caught error, as one event with where it happened. */
export function logError(where: string, error: unknown, fields: Fields = {}): void {
  startEvent('error', { where, ...fields }).fail(error).end('error')
}

/**
 * Crashes: an uncaught JS error becomes one event before React Native's own
 * handler runs. Installed once at launch; with no sink it only passes through.
 */
export function installCrashLogging(): void {
  const g = globalThis as unknown as {
    ErrorUtils?: {
      getGlobalHandler(): (error: unknown, isFatal?: boolean) => void
      setGlobalHandler(fn: (error: unknown, isFatal?: boolean) => void): void
    }
  }
  const eu = g.ErrorUtils
  if (!eu) return
  const previous = eu.getGlobalHandler()
  eu.setGlobalHandler((error, isFatal) => {
    startEvent('crash', { fatal: Boolean(isFatal) }).fail(error).end('error')
    previous(error, isFatal)
  })
}
