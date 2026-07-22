import { Mark, mergeAttributes } from '@tiptap/core'

export interface FormatOptions {
  HTMLAttributes: Record<string, unknown>
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    format: {
      setHighlight: (color: string) => ReturnType
      unsetHighlight: () => ReturnType
      setFontSize: (size: string) => ReturnType
      unsetFontSize: () => ReturnType
    }
  }
}

/**
 * User-applied highlight color + font size, consolidated into one mark (not
 * two) so future retokenize/diff logic only has one mark type to reconcile.
 */
export const FormatMark = Mark.create<FormatOptions>({
  name: 'format',

  addOptions() {
    return { HTMLAttributes: {} }
  },

  addAttributes() {
    return {
      highlight: {
        default: null,
        parseHTML: (element) => element.style.backgroundColor || null,
        renderHTML: (attrs) =>
          attrs.highlight ? { style: `background-color: ${attrs.highlight}` } : {},
      },
      fontSize: {
        default: null,
        parseHTML: (element) => element.style.fontSize || null,
        renderHTML: (attrs) => (attrs.fontSize ? { style: `font-size: ${attrs.fontSize}` } : {}),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-format]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, { 'data-format': '' }), 0]
  },

  addCommands() {
    // format has two independent attrs on one mark, so every command merges
    // with whatever the selection already has instead of clobbering the other.
    return {
      setHighlight:
        (color: string) =>
        ({ editor, commands }) =>
          commands.setMark(this.name, { ...editor.getAttributes(this.name), highlight: color }),
      unsetHighlight:
        () =>
        ({ editor, commands }) =>
          commands.setMark(this.name, { ...editor.getAttributes(this.name), highlight: null }),
      setFontSize:
        (size: string) =>
        ({ editor, commands }) =>
          commands.setMark(this.name, { ...editor.getAttributes(this.name), fontSize: size }),
      unsetFontSize:
        () =>
        ({ editor, commands }) =>
          commands.setMark(this.name, { ...editor.getAttributes(this.name), fontSize: null }),
    }
  },
})
