import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view'
import type { SyntaxStyleRange } from '@/lib/shiki/token-types'

interface DocumentSyntaxRange extends SyntaxStyleRange {
  from: number
  to: number
}

type SyntaxDecorationMeta =
  | { type: 'set'; text: string; ranges: DocumentSyntaxRange[] }
  | { type: 'clear' }

export const syntaxDecorationsPluginKey = new PluginKey<DecorationSet>('syntaxDecorations')

function decorationAttributes(range: DocumentSyntaxRange): Record<string, string> {
  const styles: string[] = []
  if (range.color) styles.push(`color: ${range.color}`)
  if (range.bold) styles.push('font-weight: 600')
  if (range.italic) styles.push('font-style: italic')
  return {
    class: 'scripture-syntax-token',
    ...(styles.length ? { style: styles.join('; ') } : {}),
  }
}

export const SyntaxDecorations = Extension.create({
  name: 'syntaxDecorations',

  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: syntaxDecorationsPluginKey,
        state: {
          init: () => DecorationSet.empty,
          apply(transaction, decorations) {
            const meta = transaction.getMeta(syntaxDecorationsPluginKey) as
              | SyntaxDecorationMeta
              | undefined

            if (meta?.type === 'clear') return DecorationSet.empty
            if (meta?.type === 'set') {
              if (transaction.doc.textContent !== meta.text) {
                return decorations.map(transaction.mapping, transaction.doc)
              }
              return DecorationSet.create(
                transaction.doc,
                meta.ranges.map((range) =>
                  Decoration.inline(range.from, range.to, decorationAttributes(range))
                )
              )
            }

            return decorations.map(transaction.mapping, transaction.doc)
          },
        },
        props: {
          decorations(state) {
            return syntaxDecorationsPluginKey.getState(state) ?? DecorationSet.empty
          },
        },
      }),
    ]
  },
})

export function applySyntaxDecorations(
  view: EditorView,
  text: string,
  ranges: SyntaxStyleRange[]
): boolean {
  if (view.state.doc.textContent !== text) return false
  const documentRanges = ranges.map((range) => ({
    ...range,
    from: range.from + 1,
    to: range.to + 1,
  }))
  view.dispatch(
    view.state.tr
      .setMeta(
        syntaxDecorationsPluginKey,
        { type: 'set', text, ranges: documentRanges } satisfies SyntaxDecorationMeta
      )
      .setMeta('addToHistory', false)
  )
  return true
}

export function clearSyntaxDecorations(view: EditorView) {
  view.dispatch(
    view.state.tr
      .setMeta(syntaxDecorationsPluginKey, { type: 'clear' } satisfies SyntaxDecorationMeta)
      .setMeta('addToHistory', false)
  )
}
