import type { ChainedCommands, Editor } from '@tiptap/core'

/**
 * Inspector typography behaves like an object-level design control: an
 * explicit text range is the target, otherwise the whole mini-document is.
 * Restore a collapsed caret after the command so applying a block style does
 * not leave all of the text visibly selected.
 */
export function runSelectionFormattingCommand(
  editor: Editor,
  command: (chain: ChainedCommands) => ChainedCommands,
  wholeBlockWhenEmpty: boolean
): boolean {
  const { selection } = editor.state
  let chain = editor.chain().focus()

  if (wholeBlockWhenEmpty && selection.empty) chain = chain.selectAll()
  chain = command(chain)
  if (wholeBlockWhenEmpty && selection.empty) {
    chain = chain.setTextSelection(selection.from)
  }

  return chain.run()
}
