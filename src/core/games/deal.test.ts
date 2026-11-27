import { describe, expect, it } from 'vitest'
import { createCascade } from './cascade/engine'
import { createChime } from './chime/engine'
import { createDim } from './dim/engine'
import { createDrift } from './drift/engine'
import { createHue } from './hue/engine'
import { createKindle } from './kindle/engine'
import { createLanterns } from './lanterns/engine'
import { createNine } from './nine/engine'
import { createSettle } from './settle/engine'
import { createThread } from './thread/engine'
import { createWeave } from './weave/engine'

/**
 * Every game deals from its seed alone: the same seed gives the same board
 * (saves, restarts and tests rely on it), and another seed gives another.
 * One table here instead of a copy of this check in each game's tests.
 */
const DEALS: [string, (seed: number) => unknown][] = [
  ['cascade', (seed) => createCascade({ seed, calm: 0.2 })],
  ['chime', (seed) => createChime({ seed, calm: 0.2 })],
  ['dim', (seed) => createDim({ seed, calm: 0.2 })],
  ['drift', (seed) => createDrift({ seed, calm: 0.2 })],
  ['hue', (seed) => createHue({ seed, calm: 0.2 })],
  ['kindle', (seed) => createKindle({ seed, calm: 0.2 })],
  ['lanterns', (seed) => createLanterns({ seed, calm: 0.2 })],
  ['nine', (seed) => createNine({ seed, calm: 0.2 })],
  ['settle', (seed) => createSettle({ seed, calm: 0.2 })],
  ['thread', (seed) => createThread({ seed, calm: 0.2 })],
  ['weave', (seed) => createWeave({ seed, calm: 0.2 })],
]

describe('dealing from a seed', () => {
  it('in every game, the same seed deals the same board and another seed another', () => {
    for (const [game, deal] of DEALS) {
      expect(deal(12345), game).toEqual(deal(12345))
      expect(deal(12345), game).not.toEqual(deal(54321))
    }
  })
})
