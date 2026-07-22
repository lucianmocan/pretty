import type { PlainToken } from '@/lib/shiki/tokenize'

export interface ProseMirrorTextNode {
  type: 'text'
  text: string
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>
}

/**
 * Converts Shiki's per-line token output into the ProseMirror text-node content
 * of a single annotatedCodeBlock node. Baked in once at paste time -- syntaxColor
 * marks are not kept in sync with later edits (see plan: re-highlight is a
 * separate, explicit action).
 */
export function tokensToContent(lines: PlainToken[][]): ProseMirrorTextNode[] {
  const content: ProseMirrorTextNode[] = []

  lines.forEach((line, lineIndex) => {
    for (const token of line) {
      if (token.content.length === 0) continue

      const marks: NonNullable<ProseMirrorTextNode['marks']> = []
      if (token.color) {
        marks.push({ type: 'syntaxColor', attrs: { color: token.color } })
      }
      if (token.bold) marks.push({ type: 'bold' })
      if (token.italic) marks.push({ type: 'italic' })

      content.push({ type: 'text', text: token.content, ...(marks.length ? { marks } : {}) })
    }

    if (lineIndex < lines.length - 1) {
      content.push({ type: 'text', text: '\n' })
    }
  })

  return content
}

export function codeToAnnotatedCodeBlockDoc(lines: PlainToken[][], language: string) {
  return {
    type: 'doc',
    content: [
      {
        type: 'annotatedCodeBlock',
        attrs: { language },
        content: tokensToContent(lines),
      },
    ],
  }
}
