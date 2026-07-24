import type { NodeGeometry } from './geometry'

export function computeGroupBounds(
  ids: string[],
  measured: Readonly<Record<string, NodeGeometry>>
): { x: number; y: number; width: number; height: number } | null {
  const boxes = ids.map((id) => measured[id]).filter((box): box is NodeGeometry => Boolean(box))
  if (boxes.length !== ids.length || boxes.length === 0) return null
  const x = Math.min(...boxes.map((box) => box.x))
  const y = Math.min(...boxes.map((box) => box.y))
  const right = Math.max(...boxes.map((box) => box.x + box.width))
  const bottom = Math.max(...boxes.map((box) => box.y + box.height))
  return { x, y, width: right - x, height: bottom - y }
}

