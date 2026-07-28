import assert from 'node:assert/strict'
import test from 'node:test'
import { getSchema, type JSONContent } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { TextAlign } from '../lib/tiptap/extensions/text-align.ts'
import {
  googleFontsInDocument,
  googleFontsStylesheetUrl,
  textFontFamilyCss,
} from '../lib/google-fonts.ts'

const richDocument: JSONContent = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      attrs: { textAlign: 'center' },
      content: [
        {
          type: 'text',
          text: 'Styled prose',
          marks: [
            { type: 'bold' },
            {
              type: 'format',
              attrs: {
                highlight: 'rgba(96, 165, 250, 0.4)',
                fontFamily: 'Crimson Pro',
                fontSource: 'google',
                fontSize: '22px',
                textColor: '#1d4ed8',
              },
            },
          ],
        },
      ],
    },
    {
      type: 'taskList',
      content: [
        {
          type: 'taskItem',
          attrs: { checked: true },
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Done' }] }],
        },
      ],
    },
  ],
}

test('the rich-text nodes accept alignment and nested task lists', () => {
  const schema = getSchema([StarterKit, TaskList, TaskItem.configure({ nested: true }), TextAlign])
  const parsed = schema.nodeFromJSON({
    ...richDocument,
    content: [
      {
        type: 'paragraph',
        attrs: { textAlign: 'center' },
        content: [{ type: 'text', text: 'Styled prose', marks: [{ type: 'bold' }] }],
      },
      richDocument.content?.[1],
    ],
  }).toJSON()
  assert.equal(parsed.content?.[0]?.attrs?.textAlign, 'center')
  assert.equal(parsed.content?.[1]?.type, 'taskList')
  assert.equal(parsed.content?.[1]?.content?.[0]?.attrs?.checked, true)
})

test('Google font discovery includes both block defaults and marked ranges', () => {
  assert.deepEqual(
    googleFontsInDocument(richDocument, 'Source Serif 4', 'google'),
    ['Crimson Pro', 'Source Serif 4']
  )
  assert.equal(
    googleFontsStylesheetUrl(['Source Serif 4', 'Crimson Pro']),
    'https://fonts.googleapis.com/css2?family=Crimson+Pro&family=Source+Serif+4&display=swap'
  )
  assert.equal(textFontFamilyCss('Geist Sans', 'local'), 'var(--font-geist-sans), sans-serif')
})
