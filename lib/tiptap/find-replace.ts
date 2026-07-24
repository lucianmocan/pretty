import type { Editor } from '@tiptap/react'

export interface LocalMatch {
  from: number
  to: number
}

export interface Match extends LocalMatch {
  blockId: string
}

/** Position-tracked substring search over a single editor's document.
 * Adjacent ProseMirror text nodes are merged into a searchable run, which
 * lets a match cross bold/italic/syntax mark boundaries while preserving
 * the exact document positions needed by selection and replacement. */
export function findMatchesInEditor(editor: Editor, query: string): LocalMatch[] {
  if (!query) return []
  const matches: LocalMatch[] = []
  const lowerQuery = query.toLowerCase()
  const runs: Array<{ text: string; positions: number[] }> = []
  let current: { text: string; positions: number[] } | null = null
  editor.state.doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return
    const expected = current && current.positions.length > 0
      ? current.positions[current.positions.length - 1] + 1
      : null
    if (!current || expected !== pos) {
      current = { text: '', positions: [] }
      runs.push(current)
    }
    current.text += node.text
    for (let index = 0; index < node.text.length; index += 1) current.positions.push(pos + index)
  })

  for (const run of runs) {
    const text = run.text.toLowerCase()
    let index = text.indexOf(lowerQuery)
    while (index !== -1) {
      const endIndex = index + query.length - 1
      matches.push({ from: run.positions[index], to: run.positions[endIndex] + 1 })
      index = text.indexOf(lowerQuery, index + 1)
    }
  }
  return matches
}

export function findAllMatches(editors: Map<string, Editor>, query: string): Match[] {
  const all: Match[] = []
  for (const [blockId, editor] of editors) {
    for (const match of findMatchesInEditor(editor, query)) {
      all.push({ blockId, ...match })
    }
  }
  return all
}

export function selectMatch(editor: Editor, match: LocalMatch) {
  editor.chain().focus().setTextSelection({ from: match.from, to: match.to }).scrollIntoView().run()
}

/** Replacing drops any marks (bold/italic/highlight/syntaxColor) on the
 * matched text itself -- the surrounding text keeps its own marks, same
 * trade-off as manually retyping that range. */
export function replaceMatch(editor: Editor, match: LocalMatch, replacement: string) {
  editor.chain().focus().insertContentAt({ from: match.from, to: match.to }, replacement).run()
}

/** Replaces every match in one editor. Iterates highest-offset-first --
 * replacing a later match can shift every position after it, so replacing
 * in reverse keeps earlier matches' positions valid throughout. Returns how
 * many replacements were made. */
export function replaceAllInEditor(editor: Editor, query: string, replacement: string): number {
  const matches = findMatchesInEditor(editor, query)
  for (const match of [...matches].reverse()) {
    replaceMatch(editor, match, replacement)
  }
  return matches.length
}
