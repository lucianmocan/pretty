import { Mark, mergeAttributes } from '@tiptap/core'

/**
 * Carries the color Shiki assigned a token at paste time. Baked in once, not
 * kept live in sync with edits -- see lib/tiptap/shiki-to-doc.ts.
 */
export const SyntaxColorMark = Mark.create({
  name: 'syntaxColor',

  addAttributes() {
    return {
      color: {
        default: null,
        parseHTML: (element) => element.style.color || null,
        renderHTML: (attrs) => (attrs.color ? { style: `color: ${attrs.color}` } : {}),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-syntax-color]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-syntax-color': '' }), 0]
  },
})
