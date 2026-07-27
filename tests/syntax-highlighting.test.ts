import test from 'node:test'
import assert from 'node:assert/strict'
import type { PlainToken } from '../lib/shiki/token-types.ts'
import { syntaxMarkRanges } from '../lib/tiptap/syntax-highlighting.ts'
import {
  plainTextFromDocument,
  withSyntaxRanges,
} from '../lib/tiptap/syntax-document.ts'
import { syntaxStyleRanges } from '../lib/shiki/token-ranges.ts'

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

test('omits inherited foreground runs and merges adjacent equal styles', () => {
  const text = 'const value'
  const ranges = syntaxStyleRanges(text, [[
    token('const', '#ff79c6'),
    token(' ', '#f8f8f2'),
    token('val', '#50fa7b'),
    token('ue', '#50FA7B'),
  ]], '#F8F8F2')

  assert.deepEqual(ranges, [
    { from: 0, to: 5, color: '#ff79c6', bold: false, italic: false },
    { from: 6, to: 11, color: '#50fa7b', bold: false, italic: false },
  ])
})

test('builds an export snapshot without mutating text or authored marks', () => {
  const document = {
    type: 'doc',
    content: [{
      type: 'annotatedCodeBlock',
      attrs: { language: 'javascript' },
      content: [
        { type: 'text', text: 'const ', marks: [{ type: 'bold' }] },
        {
          type: 'text',
          text: 'value = 1',
          marks: [{ type: 'syntaxColor', attrs: { color: '#old' } }],
        },
      ],
    }],
  }
  const original = JSON.stringify(document)
  const lines = [[
    token('const', '#ff79c6'),
    token(' value = ' , null),
    token('1', '#bd93f9'),
  ]]
  const highlighted = withSyntaxRanges(
    document,
    syntaxStyleRanges('const value = 1', lines)
  )

  assert.equal(plainTextFromDocument(highlighted), 'const value = 1')
  assert.equal(JSON.stringify(document), original)
  assert.doesNotMatch(JSON.stringify(highlighted), /#old/)
  assert.match(JSON.stringify(highlighted), /#ff79c6/)
  assert.match(JSON.stringify(highlighted), /#bd93f9/)

  const firstBlock = highlighted.content?.[0]
  const boldText = firstBlock?.content
    ?.filter((node) => node.marks?.some((mark) => mark.type === 'bold'))
    .map((node) => node.text)
    .join('')
  assert.equal(boldText, 'const ')
})
