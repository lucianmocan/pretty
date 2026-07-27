import type { PlainToken } from '@/lib/shiki/token-types'
import { syntaxStyleRanges } from '../shiki/token-ranges.ts'

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
  return syntaxStyleRanges(text, lines, null, contentStart).map((range) => ({
    from: range.from,
    to: range.to,
    attrs: {
      color: range.color,
      bold: range.bold,
      italic: range.italic,
    },
  }))
}
