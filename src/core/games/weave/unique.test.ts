import { it, expect } from 'vitest'

/** Counts nonogram solutions (up to `cap`) by row candidates + column prefix checks. */
import { WEAVE_PUZZLES as PATTERNS, parsePattern, computeLineClue } from './engine'

function countSolutions(rowsClue: number[][], colsClue: number[][], size: number, cap = 3): number {
  const rowCands: number[][][] = rowsClue.map((clue) => {
    const out: number[][] = []
    for (let m = 0; m < 1 << size; m++) {
      const line = Array.from({ length: size }, (_, i) => (m >> i) & 1)
      if (JSON.stringify(computeLineClue(line)) === JSON.stringify(clue)) out.push(line)
    }
    return out
  })
  const grid: number[][] = []
  let count = 0
  const colOk = (final: boolean) => {
    for (let c = 0; c < size; c++) {
      const col = grid.map((r) => r[c]!)
      const clue = colsClue[c]!.filter((x) => x > 0)
      if (final) { if (JSON.stringify(computeLineClue(col).filter((x) => x > 0)) !== JSON.stringify(clue)) return false; continue }
      // prefix feasibility: runs so far must match clue prefix, last run may be partial
      const runs = computeLineClue(col).filter((x) => x > 0)
      const open = col[col.length - 1] === 1
      for (let k = 0; k < runs.length; k++) {
        if (k >= clue.length) return false
        if (k < runs.length - 1 || !open) { if (runs[k] !== clue[k]) return false }
        else if (runs[k]! > clue[k]!) return false
      }
    }
    return true
  }
  const rec = (r: number) => {
    if (count >= cap) return
    if (r === size) { if (colOk(true)) count++; return }
    for (const cand of rowCands[r]!) { grid.push(cand); if (colOk(false)) rec(r + 1); grid.pop() }
  }
  rec(0)
  return count
}

it('every Weave pattern has exactly one solution, so hints can trust the answer key', () => {
  const report: string[] = []
  for (const p of PATTERNS) {
    const sol = parsePattern(p.pattern)
    const size = sol.length
    const rc = sol.map((r) => computeLineClue(r))
    const cc = Array.from({ length: size }, (_, c) => computeLineClue(sol.map((r) => r[c]!)))
    const n = countSolutions(rc, cc, size)
    if (n !== 1) report.push(`${p.id}: ${n} solutions`)
  }
  expect(report).toEqual([])
}, 120000)
