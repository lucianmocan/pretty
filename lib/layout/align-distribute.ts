export interface PositionedNode {
  id: string
  x: number
  y: number
  width: number
  height: number
}

export type PositionPatch = Record<string, { x: number; y: number }>

export type AlignEdge = 'left' | 'h-center' | 'right' | 'top' | 'v-center' | 'bottom'

/** Computes new x/y for every node so their edges/centers line up on the
 * given axis -- operates on plain position data, not the DOM, so it works
 * from whatever width/height is currently known (explicit override, or a
 * caller-supplied fallback for auto-sized nodes). */
export function alignNodes(nodes: PositionedNode[], edge: AlignEdge): PositionPatch {
  const patch: PositionPatch = {}
  if (nodes.length < 2) return patch

  if (edge === 'left') {
    const value = Math.min(...nodes.map((n) => n.x))
    for (const n of nodes) patch[n.id] = { x: value, y: n.y }
  } else if (edge === 'right') {
    const value = Math.max(...nodes.map((n) => n.x + n.width))
    for (const n of nodes) patch[n.id] = { x: value - n.width, y: n.y }
  } else if (edge === 'h-center') {
    const centers = nodes.map((n) => n.x + n.width / 2)
    const value = (Math.min(...centers) + Math.max(...centers)) / 2
    for (const n of nodes) patch[n.id] = { x: Math.round(value - n.width / 2), y: n.y }
  } else if (edge === 'top') {
    const value = Math.min(...nodes.map((n) => n.y))
    for (const n of nodes) patch[n.id] = { x: n.x, y: value }
  } else if (edge === 'bottom') {
    const value = Math.max(...nodes.map((n) => n.y + n.height))
    for (const n of nodes) patch[n.id] = { x: n.x, y: value - n.height }
  } else if (edge === 'v-center') {
    const centers = nodes.map((n) => n.y + n.height / 2)
    const value = (Math.min(...centers) + Math.max(...centers)) / 2
    for (const n of nodes) patch[n.id] = { x: n.x, y: Math.round(value - n.height / 2) }
  }
  return patch
}

/** Spaces 3+ nodes evenly between the outermost two along one axis, keeping
 * the first/last in place. No-ops (empty patch) for fewer than 3 nodes --
 * "distribute" is meaningless for 2, which are already maximally spaced. */
export function distributeNodes(nodes: PositionedNode[], axis: 'horizontal' | 'vertical'): PositionPatch {
  const patch: PositionPatch = {}
  if (nodes.length < 3) return patch

  if (axis === 'horizontal') {
    const sorted = [...nodes].sort((a, b) => a.x - b.x)
    const first = sorted[0]
    const last = sorted[sorted.length - 1]
    const totalWidth = sorted.reduce((sum, n) => sum + n.width, 0)
    const gap = (last.x + last.width - first.x - totalWidth) / (sorted.length - 1)
    let cursor = first.x
    for (const n of sorted) {
      patch[n.id] = { x: Math.round(cursor), y: n.y }
      cursor += n.width + gap
    }
  } else {
    const sorted = [...nodes].sort((a, b) => a.y - b.y)
    const first = sorted[0]
    const last = sorted[sorted.length - 1]
    const totalHeight = sorted.reduce((sum, n) => sum + n.height, 0)
    const gap = (last.y + last.height - first.y - totalHeight) / (sorted.length - 1)
    let cursor = first.y
    for (const n of sorted) {
      patch[n.id] = { x: n.x, y: Math.round(cursor) }
      cursor += n.height + gap
    }
  }
  return patch
}
