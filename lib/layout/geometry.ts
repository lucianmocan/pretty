export interface NodeGeometry {
  id: string
  parentId: string | null
  x: number
  y: number
  width: number
  height: number
}

export type GeometryMap = ReadonlyMap<string, NodeGeometry>

export function geometryRecord(geometry: GeometryMap, ids: string[]): Record<string, NodeGeometry> {
  const result: Record<string, NodeGeometry> = {}
  for (const id of ids) {
    const measured = geometry.get(id)
    if (measured) result[id] = measured
  }
  return result
}

