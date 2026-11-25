import { describe, expect, it } from 'vitest'
import { createDim, hint, litCount, nextPuzzle, press, pressFootprint, restartPuzzle, sizeForCalm, solve } from './engine'

function clearWithHints(seed: number, calm: number) {
  let s = createDim({ seed, calm })
  const par = s.par
  for (let guard = 0; guard < 60 && !s.solved; guard++) {
    const h = hint(s)
    expect(h).not.toBeNull()
    s = press(s, h!)
  }
  return { s, par }
}

describe('dim engine', () => {
  it('flips a stone and its orthogonal neighbours', () => {
    expect(pressFootprint(5, 0).sort((a, b) => a - b)).toEqual([0, 1, 5])
    expect(pressFootprint(5, 12).sort((a, b) => a - b)).toEqual([7, 11, 12, 13, 17])
    expect(pressFootprint(4, 15).sort((a, b) => a - b)).toEqual([11, 14, 15])
  })

  it('pressing the same stone twice undoes it', () => {
    const s = createDim({ seed: 3 })
    const twice = press(press(s, 7), 7)
    expect(twice.lights).toEqual(s.lights)
    expect(twice.moves).toBe(2)
  })

  it('picks the board size from calm', () => {
    expect(sizeForCalm(0)).toBe(5)
    expect(sizeForCalm(0.8)).toBe(4)
    expect(createDim({ seed: 1, calm: 0.9 }).lights).toHaveLength(16)
  })

  it.each([1, 2, 3, 42, 777, 9001])('deals a solvable, unsolved board whose par is exact (seed %i)', (seed) => {
    for (const calm of [0, 1]) {
      const s = createDim({ seed, calm })
      expect(s.solved).toBe(false)
      expect(litCount(s.lights)).toBeGreaterThanOrEqual(5)
      const presses = solve(s.lights, s.size)
      expect(presses).not.toBeNull()
      expect(presses!.length).toBe(s.par)
      let lights = s.lights.slice()
      for (const i of presses!) lights = press({ ...s, lights }, i).lights
      expect(litCount(lights)).toBe(0)
    }
  })

  it('following hints clears the board in exactly par presses', () => {
    for (const seed of [5, 6, 7, 8]) {
      const { s, par } = clearWithHints(seed, 0)
      expect(s.solved).toBe(true)
      expect(s.moves).toBe(par)
    }
  })

  it('reports boards that cannot be cleared', () => {
    // A single lit corner on 5×5 is outside the reachable set.
    const lights = new Array(25).fill(0)
    lights[0] = 1
    expect(solve(lights, 5)).toBeNull()
  })

  it('ignores presses after the board is clear and restarts to the dealt board', () => {
    const { s } = clearWithHints(11, 0)
    expect(press(s, 0)).toBe(s)
    expect(hint(s)).toBeNull()
    const again = restartPuzzle(s)
    expect(again.solved).toBe(false)
    expect(again.moves).toBe(0)
    expect(again.lights).toEqual(again.initialLights)
  })

  it('deals the next board deterministically', () => {
    const a = nextPuzzle(createDim({ seed: 12 }))
    const b = nextPuzzle(createDim({ seed: 12 }))
    expect(a.lights).toEqual(b.lights)
    expect(a.puzzleNumber).toBe(2)
  })
})
