import type { JSONContent } from '@tiptap/core'
import type { SyntaxStyleRange } from '@/lib/shiki/token-types'

export function plainTextFromDocument(node: JSONContent): string {
  if (node.text) return node.text
  return node.content?.map(plainTextFromDocument).join('') ?? ''
}

function sameMarks(
  left: JSONContent['marks'] | undefined,
  right: JSONContent['marks'] | undefined
): boolean {
  return JSON.stringify(left ?? []) === JSON.stringify(right ?? [])
}

function mergeAdjacentTextNodes(content: JSONContent[]): JSONContent[] {
  const result: JSONContent[] = []
  for (const node of content) {
    const previous = result[result.length - 1]
    if (previous?.text && node.text && sameMarks(previous.marks, node.marks)) {
      previous.text += node.text
    } else {
      result.push(node)
    }
  }
  return result
}

/**
 * Builds a short-lived export snapshot with syntax marks while retaining all
 * authored marks (bold, italic, format, etc.). The source JSON/Yjs fragment is
 * never modified.
 */
export function withSyntaxRanges(
  document: JSONContent,
  ranges: SyntaxStyleRange[]
): JSONContent {
  const text = plainTextFromDocument(document)
  let offset = 0
  let rangeIndex = 0

  function visit(node: JSONContent): JSONContent[] {
    if (typeof node.text !== 'string') {
      const content = node.content ? mergeAdjacentTextNodes(node.content.flatMap(visit)) : undefined
      return [{
        ...node,
        ...(content ? { content } : {}),
      }]
    }

    const nodeStart = offset
    const nodeEnd = nodeStart + node.text.length
    offset = nodeEnd
    const authoredMarks = node.marks?.filter((mark) => mark.type !== 'syntaxColor')
    const boundaries = new Set([nodeStart, nodeEnd])

    let boundaryRangeIndex = rangeIndex
    while (ranges[boundaryRangeIndex] && ranges[boundaryRangeIndex].to <= nodeStart) {
      boundaryRangeIndex += 1
    }
    for (let index = boundaryRangeIndex; index < ranges.length; index += 1) {
      const range = ranges[index]
      if (range.from >= nodeEnd) break
      if (range.to <= nodeStart || range.from >= nodeEnd) continue
      boundaries.add(Math.max(nodeStart, range.from))
      boundaries.add(Math.min(nodeEnd, range.to))
    }

    const points = [...boundaries].sort((left, right) => left - right)
    const result: JSONContent[] = []
    for (let index = 0; index < points.length - 1; index += 1) {
      const from = points[index]
      const to = points[index + 1]
      if (to <= from) continue
      while (ranges[rangeIndex] && ranges[rangeIndex].to <= from) rangeIndex += 1
      const candidate = ranges[rangeIndex]
      const syntax = candidate && candidate.from <= from && candidate.to >= to
        ? candidate
        : undefined
      const marks = authoredMarks ? [...authoredMarks] : []
      if (syntax) {
        marks.push({
          type: 'syntaxColor',
          attrs: {
            color: syntax.color,
            bold: syntax.bold,
            italic: syntax.italic,
          },
        })
      }

      const segment: JSONContent = {
        ...node,
        text: node.text.slice(from - nodeStart, to - nodeStart),
      }
      if (marks.length) segment.marks = marks
      else delete segment.marks

      const previous = result[result.length - 1]
      if (previous?.text && sameMarks(previous.marks, segment.marks)) {
        previous.text += segment.text
      } else {
        result.push(segment)
      }
    }
    return result
  }

  const result = visit(document)[0]
  if (offset !== text.length || plainTextFromDocument(result) !== text) {
    throw new Error('Syntax export snapshot attempted to change document text')
  }
  return result
}
