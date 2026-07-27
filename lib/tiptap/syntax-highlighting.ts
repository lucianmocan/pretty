import type { PlainToken } from '@/lib/shiki/tokenize'

export interface SyntaxMarkRange {
  from: number
  to: number
  attrs: {
    color: string | null
    bold: boolean
    italic: boolean
  }
}

/**
 * Converts Shiki tokens into ProseMirror mark ranges without producing any
 * replacement text. The exact round-trip check is intentional: highlighting
 * must never be allowed to change editor content, even if a tokenizer or
 * language grammar returns an unexpected token stream.
 */
export function syntaxMarkRanges(
  text: string,
  lines: PlainToken[][],
  contentStart = 1
): SyntaxMarkRange[] {
  const ranges: SyntaxMarkRange[] = []
  let offset = 0
  let tokenizedText = ''

  lines.forEach((line, lineIndex) => {
    for (const token of line) {
      tokenizedText += token.content
      const from = contentStart + offset
      offset += token.content.length

      if (token.content && (token.color || token.bold || token.italic)) {
        ranges.push({
          from,
          to: contentStart + offset,
          attrs: {
            color: token.color ?? null,
            bold: Boolean(token.bold),
            italic: Boolean(token.italic),
          },
        })
      }
    }

    if (lineIndex < lines.length - 1) {
      tokenizedText += '\n'
      offset++
    }
  })

  if (tokenizedText !== text) {
    throw new Error('Tokenized text does not exactly match the editor snapshot')
  }

  return ranges
}
