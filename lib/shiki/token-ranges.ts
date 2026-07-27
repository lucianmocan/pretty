import type { PlainToken, SyntaxStyleRange } from './token-types'

function sameColor(left: string | null, right: string | null): boolean {
  return left?.toLowerCase() === right?.toLowerCase()
}

function sameStyle(left: SyntaxStyleRange, right: SyntaxStyleRange): boolean {
  return (
    sameColor(left.color, right.color) &&
    left.bold === right.bold &&
    left.italic === right.italic
  )
}

/** Converts Shiki's token text to compact offsets, validates the round trip,
 * omits the inherited theme foreground, and coalesces equal adjacent runs. */
export function syntaxStyleRanges(
  text: string,
  lines: PlainToken[][],
  defaultForeground: string | null = null,
  contentStart = 0
): SyntaxStyleRange[] {
  const ranges: SyntaxStyleRange[] = []
  let offset = 0
  let tokenizedText = ''

  lines.forEach((line, lineIndex) => {
    for (const token of line) {
      tokenizedText += token.content
      const from = contentStart + offset
      offset += token.content.length
      const color = sameColor(token.color, defaultForeground) ? null : token.color

      if (token.content && (color || token.bold || token.italic)) {
        const next: SyntaxStyleRange = {
          from,
          to: contentStart + offset,
          color: color ?? null,
          bold: Boolean(token.bold),
          italic: Boolean(token.italic),
        }
        const previous = ranges[ranges.length - 1]
        if (previous && previous.to === next.from && sameStyle(previous, next)) {
          previous.to = next.to
        } else {
          ranges.push(next)
        }
      }
    }

    if (lineIndex < lines.length - 1) {
      tokenizedText += '\n'
      offset += 1
    }
  })

  if (tokenizedText !== text) {
    throw new Error('Tokenized text does not exactly match the editor snapshot')
  }

  return ranges
}
