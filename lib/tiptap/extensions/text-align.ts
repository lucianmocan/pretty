import { Extension, type Command } from '@tiptap/core'

export type TextAlignment = 'left' | 'center' | 'right' | 'justify'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    scriptureTextAlign: {
      setTextAlign: (alignment: TextAlignment) => ReturnType
      unsetTextAlign: () => ReturnType
    }
  }
}

const TYPES = ['paragraph', 'heading']

function updateSelectedTextblocks(alignment: TextAlignment | null): Command {
  return ({ state, dispatch }) => {
    const { from, to } = state.selection
    let transaction = state.tr
    let changed = false

    state.doc.nodesBetween(from, Math.min(state.doc.content.size, Math.max(from + 1, to)), (node, position) => {
      if (!TYPES.includes(node.type.name) || node.attrs.textAlign === alignment) return
      transaction = transaction.setNodeMarkup(position, undefined, { ...node.attrs, textAlign: alignment })
      changed = true
    })

    if (changed && dispatch) dispatch(transaction)
    return changed
  }
}

/** Small local equivalent of Tiptap's TextAlign extension. Keeping it here
 * avoids another runtime dependency while following Tiptap's documented
 * global-attribute format, so static rendering and Yjs share the same schema. */
export const TextAlign = Extension.create({
  name: 'scriptureTextAlign',

  addGlobalAttributes() {
    return [
      {
        types: TYPES,
        attributes: {
          textAlign: {
            default: null,
            parseHTML: (element) => element.style.textAlign || null,
            renderHTML: (attributes) =>
              attributes.textAlign ? { style: `text-align: ${attributes.textAlign}` } : {},
          },
        },
      },
    ]
  },

  addCommands() {
    return {
      setTextAlign: (alignment: TextAlignment) => updateSelectedTextblocks(alignment),
      unsetTextAlign: () => updateSelectedTextblocks(null),
    }
  },

  addKeyboardShortcuts() {
    return {
      'Mod-Shift-l': () => this.editor.commands.setTextAlign('left'),
      'Mod-Shift-e': () => this.editor.commands.setTextAlign('center'),
      'Mod-Shift-r': () => this.editor.commands.setTextAlign('right'),
      'Mod-Shift-j': () => this.editor.commands.setTextAlign('justify'),
    }
  },
})
