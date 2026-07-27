import type { PlainToken } from '@/lib/shiki/token-types'

export interface ProseMirrorTextNode {
  type: 'text'
  text: string
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>
}

/**
 * Converts Shiki's per-line token output into the ProseMirror text-node content
 * of a single annotatedCodeBlock node. Live editors use local decorations;
 * this marked representation is only suitable for static snapshots.
 */
export function tokensToContent(lines: PlainToken[][]): ProseMirrorTextNode[] {
  const content: ProseMirrorTextNode[] = []

  lines.forEach((line, lineIndex) => {
    for (const token of line) {
      if (token.content.length === 0) continue

      const marks: NonNullable<ProseMirrorTextNode['marks']> = []
      if (token.color || token.bold || token.italic) {
        marks.push({
          type: 'syntaxColor',
          attrs: {
            color: token.color ?? null,
            bold: Boolean(token.bold),
            italic: Boolean(token.italic),
          },
        })
      }

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
