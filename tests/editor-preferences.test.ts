import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_TAB_SIZE,
  indentationBackspaceCount,
  nextLineIndent,
  normalizeTabSize,
  selectedLineIndentEdits,
} from '../lib/editor-preferences.ts'

test('accepts preset and custom editor tab sizes', () => {
  assert.equal(normalizeTabSize(1), 1)
  assert.equal(normalizeTabSize(2), 2)
  assert.equal(normalizeTabSize(3), 3)
  assert.equal(normalizeTabSize('4'), 4)
  assert.equal(normalizeTabSize(8), 8)
  assert.equal(normalizeTabSize(16), 16)
})

test('falls back for out-of-range or invalid tab sizes', () => {
  assert.equal(normalizeTabSize(0), DEFAULT_TAB_SIZE)
  assert.equal(normalizeTabSize(17), DEFAULT_TAB_SIZE)
  assert.equal(normalizeTabSize(2.5), DEFAULT_TAB_SIZE)
  assert.equal(normalizeTabSize('nope'), DEFAULT_TAB_SIZE)
  assert.equal(normalizeTabSize(null), DEFAULT_TAB_SIZE)
})

test('backspace removes leading indentation to the previous tab stop', () => {
  assert.equal(indentationBackspaceCount('  ', 2), 2)
  assert.equal(indentationBackspaceCount('    ', 2), 2)
  assert.equal(indentationBackspaceCount('      ', 4), 2)
  assert.equal(indentationBackspaceCount('        ', 4), 4)
  assert.equal(indentationBackspaceCount('line\n  ', 2), 2)
})

test('backspace remains character-based outside leading indentation', () => {
  assert.equal(indentationBackspaceCount('', 2), 0)
  assert.equal(indentationBackspaceCount('const value =  ', 2), 0)
  assert.equal(indentationBackspaceCount('  value', 2), 0)
})

test('automatic indentation carries whitespace and indents opening brackets', () => {
  assert.equal(nextLineIndent('  const value = 1', 2), '  ')
  assert.equal(nextLineIndent('  if (ready) {', 2), '    ')
  assert.equal(nextLineIndent('call(', 4), '    ')
  assert.equal(nextLineIndent('line\n    item', 4), '    ')
})

function applyEdits(text: string, edits: ReturnType<typeof selectedLineIndentEdits>): string {
  return [...edits]
    .reverse()
    .reduce((result, edit) => result.slice(0, edit.from) + edit.text + result.slice(edit.to), text)
}

test('tab indents every selected line without replacing its text', () => {
  const text = 'first\nsecond\nthird'
  const edits = selectedLineIndentEdits(text, 1, 12, 2, false)
  assert.equal(applyEdits(text, edits), '  first\n  second\nthird')
})

test('shift-tab outdents every selected line and ignores an excluded trailing line', () => {
  const text = '  first\n    second\n  third'
  const thirdLineStart = text.indexOf('  third')
  const edits = selectedLineIndentEdits(text, 0, thirdLineStart, 2, true)
  assert.equal(applyEdits(text, edits), 'first\n  second\n  third')
})
