import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

/**
 * The worklet compiler turns each `'worklet'` function into a const that
 * captures what it calls at definition time, so hoisting no longer applies:
 * a module-level worklet calling a function declared further down the file
 * crashes on the UI thread ("undefined is not a function"). Vitest doesn't run
 * that compiler, so this test reads the syntax tree of every file that has
 * worklets and checks the order.
 */
const SRC = fileURLToPath(new URL('../../', import.meta.url))

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) ? [path] : []
  })
}

const WORKLET_FILES = sourceFiles(SRC).filter((f) => readFileSync(f, 'utf8').includes("'worklet'"))

/** Module-level functions in order: declarations and consts holding a function. */
function topLevelFunctions(sf: ts.SourceFile): { name: string; body: ts.Node }[] {
  const out: { name: string; body: ts.Node }[] = []
  for (const st of sf.statements) {
    if (ts.isFunctionDeclaration(st) && st.name && st.body) out.push({ name: st.name.text, body: st.body })
    if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        const init = d.initializer
        if (ts.isIdentifier(d.name) && init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) {
          out.push({ name: d.name.text, body: init.body })
        }
      }
    }
  }
  return out
}

function calledNames(node: ts.Node): Set<string> {
  const names = new Set<string>()
  const visit = (n: ts.Node) => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression)) names.add(n.expression.text)
    ts.forEachChild(n, visit)
  }
  visit(node)
  return names
}

describe('worklets', () => {
  it('are found (the check below would pass vacuously otherwise)', () => {
    expect(WORKLET_FILES.length).toBeGreaterThan(3)
  })

  it.each(WORKLET_FILES.map((f) => [relative(SRC, f), f]))('%s defines every function before its callers', (_rel, file) => {
    const sf = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
    const fns = topLevelFunctions(sf)
    const problems: string[] = []
    fns.forEach((fn, i) => {
      const calls = calledNames(fn.body)
      for (const later of fns.slice(i + 1)) {
        if (calls.has(later.name)) problems.push(`${fn.name} calls ${later.name}, which is defined below it`)
      }
    })
    expect(problems).toEqual([])
  })
})
