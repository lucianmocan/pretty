import assert from 'node:assert/strict'
import test from 'node:test'
import { findMatchesInEditor } from '../lib/tiptap/find-replace.ts'
import type { Editor } from '@tiptap/react'

function mockEditor(nodes: Array<{ text: string; pos: number }>): Editor {
  return {
    state: {
      doc: {
        descendants(callback: (node: { isText: boolean; text: string }, pos: number) => void) {
          for (const node of nodes) callback({ isText: true, text: node.text }, node.pos)
        },
      },
    },
  } as unknown as Editor
}

test('finds a query across adjacent marked ProseMirror text nodes', () => {
  const editor = mockEditor([
    { text: 'con', pos: 1 },
    { text: 'sole', pos: 4 },
    { text: '.log', pos: 8 },
  ])

  assert.deepEqual(findMatchesInEditor(editor, 'console'), [{ from: 1, to: 8 }])
})

test('does not match across a document-position boundary', () => {
  const editor = mockEditor([
    { text: 'hello', pos: 1 },
    { text: 'world', pos: 8 },
  ])

  assert.deepEqual(findMatchesInEditor(editor, 'lowo'), [])
})

