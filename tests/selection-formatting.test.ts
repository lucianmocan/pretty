import assert from 'node:assert/strict'
import test from 'node:test'
import type { ChainedCommands, Editor } from '@tiptap/core'
import { runSelectionFormattingCommand } from '../lib/tiptap/selection-formatting.ts'

function editorDouble(empty: boolean, from = 7) {
  const calls: string[] = []
  const chain = new Proxy({}, {
    get(_target, property) {
      if (property === 'run') {
        return () => {
          calls.push('run')
          return true
        }
      }
      return (...args: unknown[]) => {
        calls.push(args.length > 0 ? `${String(property)}:${JSON.stringify(args[0])}` : String(property))
        return chain
      }
    },
  }) as ChainedCommands
  const editor = {
    state: { selection: { empty, from } },
    chain: () => chain,
  } as unknown as Editor
  return { editor, calls }
}

test('collapsed inspector formatting targets the full block and restores the caret', () => {
  const { editor, calls } = editorDouble(true)

  assert.equal(
    runSelectionFormattingCommand(editor, (chain) => chain.toggleItalic(), true),
    true
  )
  assert.deepEqual(calls, [
    'focus',
    'selectAll',
    'toggleItalic',
    'setTextSelection:7',
    'run',
  ])
})

test('an explicit text selection remains the only formatting target', () => {
  const { editor, calls } = editorDouble(false)

  runSelectionFormattingCommand(editor, (chain) => chain.toggleItalic(), true)

  assert.deepEqual(calls, ['focus', 'toggleItalic', 'run'])
})

test('bubble-menu commands never expand a collapsed selection', () => {
  const { editor, calls } = editorDouble(true)

  runSelectionFormattingCommand(editor, (chain) => chain.setHighlight('#fde047'), false)

  assert.deepEqual(calls, ['focus', 'setHighlight:"#fde047"', 'run'])
})
