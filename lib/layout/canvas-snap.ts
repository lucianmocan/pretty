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
 *
 * When `containerSize` is given, the result is also clamped so the box's
 * edges never leave [0, containerSize] on either axis -- the exact border
 * of the canvas container, no extra inset. Without this, a block (and the
 * floating NodeControls/tooltip cluster that renders outside its own top
 * edge) could be dragged to a negative x/y -- content positioned there
 * renders above/left of the scrollable canvas area's own scroll bounds
 * (which are only ever sized to cover non-negative content), so scrollTop/
 * scrollLeft can never reach back to 0 or below to reveal it again. That's
 * functionally indistinguishable from the block just disappearing, even
 * though nothing is technically clipped by an overflow:hidden rule.
 */
export function snapPosition(dragged: Box, siblings: Box[], containerSize?: { width: number; height: number }): SnapResult {
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

  if (containerSize) {
    // Math.max(0, ...) first, so a box bigger than the container (maxX < 0)
    // still clamps to the top-left corner instead of a negative position.
    const maxX = Math.max(0, containerSize.width - dragged.width)
    const maxY = Math.max(0, containerSize.height - dragged.height)
    x = Math.min(Math.max(0, x), maxX)
    y = Math.min(Math.max(0, y), maxY)
  }

  return { x, y, guides: { x: guideX, y: guideY } }
}
