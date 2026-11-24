import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * The worklet compiler turns each `'worklet'` function into a const that
 * captures what it calls at definition time, so hoisting no longer applies:
 * calling a function declared further down the file crashes at load
 * ("Cannot access X before initialization"). Vitest does not run that
 * compiler, so this test checks the order directly.
 */
const FILES = ['../../../core/backdrop/sim.ts', './draw.ts']

function functionsInOrder(src: string): { name: string; body: string }[] {
  const re = /^(?:export )?function (\w+)/gm
  const marks: { name: string; at: number }[] = []
  for (let m = re.exec(src); m; m = re.exec(src)) marks.push({ name: m[1]!, at: m.index })
  return marks.map((mk, i) => ({ name: mk.name, body: src.slice(mk.at, marks[i + 1]?.at ?? src.length) }))
}

describe('backdrop worklets', () => {
  it.each(FILES)('%s defines every worklet before its callers', (file) => {
    const src = readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8')
    const fns = functionsInOrder(src)
    const names = fns.map((f) => f.name)
    const problems: string[] = []
    fns.forEach((fn, i) => {
      for (const later of names.slice(i + 1)) {
        if (new RegExp(`\\b${later}\\(`).test(fn.body.replace(/^(?:export )?function \w+/, ''))) {
          problems.push(`${fn.name} calls ${later}, which is defined below it`)
        }
      }
    })
    expect(problems).toEqual([])
  })
})
