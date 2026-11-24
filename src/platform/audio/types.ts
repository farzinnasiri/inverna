/**
 * Minimal structural Web Audio interfaces satisfied identically by:
 * - Browser DOM `AudioContext` (Web)
 * - Software Mansion `react-native-audio-api` (iOS CoreAudio / Android Oboe C++)
 * - Lightweight unit test mocks (Vitest)
 */

export type AudioContextStateLike = 'suspended' | 'running' | 'closed' | 'interrupted' | string

export interface AudioParamLike {
  value: number
  setValueAtTime(value: number, startTime: number): unknown
  linearRampToValueAtTime(value: number, endTime: number): unknown
  exponentialRampToValueAtTime(value: number, endTime: number): unknown
  cancelScheduledValues(cancelTime: number): unknown
  cancelAndHoldAtTime?(cancelTime: number): unknown
}

export interface AudioNodeLike {
  channelCount?: number
  channelCountMode?: string
  connect(destination: AudioNodeLike, output?: number, input?: number): unknown
  connect(destination: AudioParamLike, output?: number): unknown
  disconnect(): void
}

export interface GainNodeLike extends AudioNodeLike {
  readonly gain: AudioParamLike
}

export type BiquadFilterTypeLike =
  | 'lowpass'
  | 'highpass'
  | 'bandpass'
  | 'lowshelf'
  | 'highshelf'
  | 'peaking'
  | 'notch'
  | 'allpass'

export interface BiquadFilterNodeLike extends AudioNodeLike {
  type: BiquadFilterTypeLike
  readonly frequency: AudioParamLike
  readonly Q: AudioParamLike
  readonly gain: AudioParamLike
}

export interface StereoPannerNodeLike extends AudioNodeLike {
  readonly pan: AudioParamLike
}

export interface DelayNodeLike extends AudioNodeLike {
  readonly delayTime: AudioParamLike
}

export interface WaveShaperNodeLike extends AudioNodeLike {
  curve: Float32Array | null
  oversample?: 'none' | '2x' | '4x'
}

export interface DynamicsCompressorNodeLike extends AudioNodeLike {
  readonly threshold: AudioParamLike
  readonly knee: AudioParamLike
  readonly ratio: AudioParamLike
  readonly attack: AudioParamLike
  readonly release: AudioParamLike
}

export interface AudioBufferLike {
  readonly numberOfChannels: number
  readonly length: number
  readonly sampleRate: number
  readonly duration: number
  getChannelData(channel: number): Float32Array
}

export interface AudioBufferSourceNodeLike extends AudioNodeLike {
  buffer: AudioBufferLike | null
  loop: boolean
  onended: ((...args: unknown[]) => void) | null | undefined
  start(when?: number, offset?: number, duration?: number): void
  stop(when?: number): void
}

export interface OscillatorNodeLike extends AudioNodeLike {
  type: 'sine' | 'square' | 'sawtooth' | 'triangle' | 'custom'
  readonly frequency: AudioParamLike
  readonly detune?: AudioParamLike
  onended: ((...args: unknown[]) => void) | null | undefined
  setPeriodicWave?(wave: unknown): void
  start(when?: number): void
  stop(when?: number): void
}

export interface AudioContextLike {
  readonly state: AudioContextStateLike
  readonly currentTime: number
  readonly sampleRate: number
  readonly destination: AudioNodeLike
  createGain(): GainNodeLike
  createBiquadFilter(): BiquadFilterNodeLike
  createOscillator(): OscillatorNodeLike
  createBuffer(numberOfChannels: number, length: number, sampleRate: number): AudioBufferLike
  createBufferSource(): AudioBufferSourceNodeLike
  createStereoPanner?(): StereoPannerNodeLike
  createDelay?(maxDelayTime?: number): DelayNodeLike
  createChannelMerger?(numberOfInputs?: number): AudioNodeLike
  createPeriodicWave?(real: Float32Array, imag: Float32Array): unknown
  createWaveShaper?(): WaveShaperNodeLike
  createDynamicsCompressor?(): DynamicsCompressorNodeLike
  resume(): Promise<unknown>
  suspend?(): Promise<unknown>
  close?(): Promise<unknown>
}
