import test from 'node:test'
import assert from 'node:assert/strict'
import type { PlainToken } from '../lib/shiki/tokenize.ts'
import { syntaxMarkRanges } from '../lib/tiptap/syntax-highlighting.ts'

const token = (
  content: string,
  color: string | null = '#ffffff',
  bold = false,
  italic = false
): PlainToken => ({ content, color, bold, italic })

test('maps braces and multiline tokens to exact document positions', () => {
  const text = 'const value = {\n  fast: true,\n}\n'
  const lines: PlainToken[][] = [
    [token('const', '#ff79c6', true), token(' value = {')],
    [token('  fast'), token(': '), token('true', '#bd93f9'), token(',')],
    [token('}')],
    [],
  ]

  const ranges = syntaxMarkRanges(text, lines)

  assert.equal(ranges[0].from, 1)
  assert.equal(ranges[0].to, 6)
  assert.deepEqual(ranges[0].attrs, {
    color: '#ff79c6',
    bold: true,
    italic: false,
  })
  assert.equal(ranges.at(-1)?.to, text.length)
  assert.ok(ranges.every(({ from, to }) => from >= 1 && to <= text.length + 1 && to > from))
})

test('handles rapid-edit snapshots with blank and trailing lines', () => {
  const snapshots = [
    '}',
    '{}',
    '{\n}',
    '{\n\n}',
    'if (ready) {\n  run();\n}\n',
    'if (ready) {\n  run({ fast: true });\n}\n',
  ]

  for (const text of snapshots) {
    const lines = text.split('\n').map((line) => (line ? [token(line)] : []))
    assert.doesNotThrow(() => syntaxMarkRanges(text, lines))
  }
})

test('rejects token output that differs from editor text', () => {
  assert.throws(
    () => syntaxMarkRanges('const value = {}', [[token('const value = {}}')]]),
    /does not exactly match/
  )
})
