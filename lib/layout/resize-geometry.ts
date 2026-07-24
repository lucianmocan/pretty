export const MIN_NODE_SIZE = 32

export type ResizeAxis = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

export interface NodeSize {
  width: number
  height: number
}

export interface NodePosition {
  x: number
  y: number
}

export type SizePatch = Partial<NodeSize>
export type PositionPatch = Partial<NodePosition>

export interface ResizeResult {
  size: SizePatch
  position?: PositionPatch
}

function resizeAxis(
  startSize: number,
  startPosition: number,
  delta: number,
  growsTowardFarEdge: boolean,
  tracksPosition: boolean,
  minimum: number
): { size: number; position?: number } {
  const desiredSize = Math.max(minimum, Math.round(startSize + (growsTowardFarEdge ? delta : -delta)))

  if (growsTowardFarEdge || !tracksPosition) {
    return { size: desiredSize }
  }

  // A north/west resize of an absolutely positioned canvas child keeps the
  // opposite edge fixed. Position zero is the hard near bound: once it is
  // reached the block can no longer grow toward that edge.
  const farEdge = startPosition + startSize
  const size = Math.min(Math.max(minimum, farEdge), desiredSize)
  return { size, position: Math.max(0, Math.round(farEdge - size)) }
}

/**
 * Pure pointer-delta -> geometry conversion shared by the live resize
 * interaction and its focused tests. Only dimensions represented by the
 * dragged handle are returned. That distinction is important: dragging an
 * east edge must not turn an auto-height code block into a fixed-height one.
 */
export function resizeGeometry({
  axis,
  startSize,
  startPosition,
  delta,
  trackPosition,
  minimum = MIN_NODE_SIZE,
}: {
  axis: ResizeAxis
  startSize: NodeSize
  startPosition?: NodePosition
  delta: { x: number; y: number }
  trackPosition: boolean
  minimum?: number
}): ResizeResult {
  const growsEast = axis === 'e' || axis === 'ne' || axis === 'se'
  const growsWest = axis === 'w' || axis === 'nw' || axis === 'sw'
  const growsSouth = axis === 's' || axis === 'se' || axis === 'sw'
  const growsNorth = axis === 'n' || axis === 'ne' || axis === 'nw'
  const position = startPosition ?? { x: 0, y: 0 }

  const size: SizePatch = {}
  const nextPosition: PositionPatch = {}

  if (growsEast || growsWest) {
    const horizontal = resizeAxis(
      startSize.width,
      position.x,
      delta.x,
      growsEast,
      trackPosition,
      minimum
    )
    size.width = horizontal.size
    if (horizontal.position !== undefined) nextPosition.x = horizontal.position
  }

  if (growsSouth || growsNorth) {
    const vertical = resizeAxis(
      startSize.height,
      position.y,
      delta.y,
      growsSouth,
      trackPosition,
      minimum
    )
    size.height = vertical.size
    if (vertical.position !== undefined) nextPosition.y = vertical.position
  }

  return {
    size,
    position: Object.keys(nextPosition).length > 0 ? nextPosition : undefined,
  }
}
