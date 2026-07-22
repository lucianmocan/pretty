const GRID_SIZE = 8
const SNAP_THRESHOLD = 6

export interface Box {
  x: number
  y: number
  width: number
  height: number
}

export interface SnapResult {
  x: number
  y: number
  // Parent-local coordinates of any guide lines to draw for the duration of
  // the drag -- one axis position per matched alignment.
  guides: { x: number[]; y: number[] }
}

/**
 * Snaps a dragged box's position to the nearest grid line, then to sibling
 * edges/centers if within a small threshold (a sibling alignment match wins
 * over plain grid snapping) -- the same "smart guides" technique design
 * tools use, scoped down to axis-aligned edge/center comparisons only.
 */
export function snapPosition(dragged: Box, siblings: Box[]): SnapResult {
  let x = Math.round(dragged.x / GRID_SIZE) * GRID_SIZE
  let y = Math.round(dragged.y / GRID_SIZE) * GRID_SIZE
  const guideX: number[] = []
  const guideY: number[] = []

  const draggedEdgesX = [dragged.x, dragged.x + dragged.width / 2, dragged.x + dragged.width]
  const draggedEdgesY = [dragged.y, dragged.y + dragged.height / 2, dragged.y + dragged.height]

  for (const sib of siblings) {
    const sibEdgesX = [sib.x, sib.x + sib.width / 2, sib.x + sib.width]
    const sibEdgesY = [sib.y, sib.y + sib.height / 2, sib.y + sib.height]

    for (const dEdge of draggedEdgesX) {
      for (const sx of sibEdgesX) {
        if (Math.abs(dEdge - sx) <= SNAP_THRESHOLD) {
          x = sx - (dEdge - dragged.x)
          guideX.push(sx)
        }
      }
    }
    for (const dEdge of draggedEdgesY) {
      for (const sy of sibEdgesY) {
        if (Math.abs(dEdge - sy) <= SNAP_THRESHOLD) {
          y = sy - (dEdge - dragged.y)
          guideY.push(sy)
        }
      }
    }
  }

  return { x, y, guides: { x: guideX, y: guideY } }
}
