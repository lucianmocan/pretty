import type { JSONContent } from '@tiptap/core'

export const DEFAULT_CODE_FONT_SIZE = 14

function markFontSize(node: JSONContent): number {
  const raw = node.marks?.find((mark) => mark.type === 'format')?.attrs?.fontSize
  const parsed = typeof raw === 'string' ? Number.parseFloat(raw) : Number.NaN
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_CODE_FONT_SIZE
}

/** Largest authored font size on each literal code line. A line's browser
 * line box is governed by its largest inline run, so using the same value
 * for its gutter number keeps both columns vertically aligned. */
export function codeLineFontSizes(document: JSONContent): number[] {
  const sizes = [0]
  let line = 0

  const visit = (node: JSONContent) => {
    if (node.text != null) {
      const size = markFontSize(node)
      const parts = node.text.split('\n')
      parts.forEach((part, index) => {
        if (part.length > 0) sizes[line] = Math.max(sizes[line] ?? 0, size)
        if (index < parts.length - 1) {
          line += 1
          sizes[line] = 0
        }
      })
      return
    }
    node.content?.forEach(visit)
  }

  visit(document)
  return sizes.map((size) => size || DEFAULT_CODE_FONT_SIZE)
}
