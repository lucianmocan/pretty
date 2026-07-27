import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_TAB_SIZE,
  indentationBackspaceCount,
  nextLineIndent,
  normalizeTabSize,
} from '../lib/editor-preferences.ts'

test('accepts the supported editor tab sizes', () => {
  assert.equal(normalizeTabSize(2), 2)
  assert.equal(normalizeTabSize('4'), 4)
  assert.equal(normalizeTabSize(8), 8)
})

test('falls back for unsupported or invalid tab sizes', () => {
  assert.equal(normalizeTabSize(3), DEFAULT_TAB_SIZE)
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
