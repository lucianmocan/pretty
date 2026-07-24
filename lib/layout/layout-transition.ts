import type { LayoutNode } from './types'
import type { NodeGeometry } from './geometry'

export interface CanvasPosition {
  x: number
  y: number
}

function cascadeOffset(index: number): CanvasPosition {
  const col = index % 8
  const row = Math.floor(index / 8)
  return { x: 24 + col * 16, y: 24 + row * 16 }
}

/** Captures a flex frame's current visual child positions before those
 * children become absolutely positioned. Measurements from another parent
 * are ignored; missing measurements retain existing canvas coordinates or
 * receive the standard non-overlapping fallback. */
export function planFlexToCanvasPositions(
  parentId: string,
  children: Array<Pick<LayoutNode, 'id' | 'x' | 'y'>>,
  measured: Readonly<Record<string, NodeGeometry>>
): Record<string, CanvasPosition> {
  const result: Record<string, CanvasPosition> = {}

  children.forEach((child, index) => {
    const geometry = measured[child.id]
    if (geometry?.parentId === parentId) {
      result[child.id] = {
        x: Math.max(0, Math.round(geometry.x)),
        y: Math.max(0, Math.round(geometry.y)),
      }
      return
    }

    const fallback = cascadeOffset(index)
    result[child.id] = {
      x: child.x ?? fallback.x,
      y: child.y ?? fallback.y,
    }
  })

  return result
}
