import { Node, mergeAttributes } from '@tiptap/core'

export interface AnnotatedCodeBlockOptions {
  HTMLAttributes: Record<string, unknown>
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    annotatedCodeBlock: {
      setLanguage: (language: string) => ReturnType
    }
  }
}

/**
 * Unlike Tiptap's stock CodeBlock (marks: ''), this node allows all marks so
 * bold/italic/highlight/fontSize/syntaxColor can stack on code text.
 */
export const AnnotatedCodeBlock = Node.create<AnnotatedCodeBlockOptions>({
  name: 'annotatedCodeBlock',

  addOptions() {
    return { HTMLAttributes: {} }
  },

  group: 'block',
  content: 'text*',
  marks: '_',
  code: true,
  defining: true,
  isolating: true,

  addAttributes() {
    return {
      language: {
        default: 'plaintext',
        parseHTML: (element) => element.getAttribute('data-language'),
        renderHTML: (attrs) => ({ 'data-language': attrs.language }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'pre', preserveWhitespace: 'full' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'pre',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes),
      // No inline font-family here -- it must inherit the ancestor
      // .scripture-code-editor rule (app/globals.css), which resolves
      // --scripture-code-font (set per-block by CodeChrome) to the actual
      // chosen font. An inline style on this innermost element would win
      // over that cascade regardless of what --scripture-code-font is.
      ['code', { style: 'white-space: pre' }, 0],
    ]
  },

  addCommands() {
    return {
      setLanguage:
        (language: string) =>
        ({ commands }) =>
          commands.updateAttributes(this.name, { language }),
    }
  },

  // Enter/Tab should behave like a code editor (insert characters in place),
  // not split the node into a new block or move focus out of it.
  addKeyboardShortcuts() {
    return {
      Enter: () => {
        if (!this.editor.isActive(this.name)) return false
        return this.editor.commands.insertContent('\n')
      },
      Tab: () => {
        if (!this.editor.isActive(this.name)) return false
        return this.editor.commands.insertContent('  ')
      },
    }
  },
})
