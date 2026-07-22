import type { Editor } from '@tiptap/react'

export interface LocalMatch {
  from: number
  to: number
}

export interface Match extends LocalMatch {
  blockId: string
}

/** Position-tracked substring search over a single editor's document --
 * the standard ProseMirror technique: descendants() already reports each
 * text node's correct absolute position (accounting for every ancestor
 * node's open/close boundaries), so `pos + index` needs no further offset
 * math regardless of nesting depth (flat code blocks vs paragraph-wrapped
 * text blocks alike). Case-insensitive. */
export function findMatchesInEditor(editor: Editor, query: string): LocalMatch[] {
  if (!query) return []
  const matches: LocalMatch[] = []
  const lowerQuery = query.toLowerCase()
  editor.state.doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return
    const text = node.text.toLowerCase()
    let index = text.indexOf(lowerQuery)
    while (index !== -1) {
      matches.push({ from: pos + index, to: pos + index + query.length })
      index = text.indexOf(lowerQuery, index + 1)
    }
  })
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
