import { Mark, mergeAttributes } from '@tiptap/core'

/** Carries Shiki-owned presentation separately from user formatting marks. */
export const SyntaxColorMark = Mark.create({
  name: 'syntaxColor',

  addAttributes() {
    return {
      color: {
        default: null,
        rendered: false,
        parseHTML: (element) => element.style.color || null,
      },
      bold: {
        default: false,
        rendered: false,
        parseHTML: (element) => Number.parseInt(element.style.fontWeight, 10) >= 600,
      },
      italic: {
        default: false,
        rendered: false,
        parseHTML: (element) => element.style.fontStyle === 'italic',
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-syntax-color]' }]
  },

  renderHTML({ mark, HTMLAttributes }) {
    const styles = [
      mark.attrs.color ? `color: ${mark.attrs.color}` : '',
      mark.attrs.bold ? 'font-weight: 700' : '',
      mark.attrs.italic ? 'font-style: italic' : '',
    ].filter(Boolean)

    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-syntax-color': '',
        ...(styles.length ? { style: styles.join('; ') } : {}),
      }),
      0,
    ]
  },
})
