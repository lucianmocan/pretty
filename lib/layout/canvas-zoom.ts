export const MIN_CANVAS_ZOOM = Number.EPSILON
export const MAX_CANVAS_ZOOM = 2

export function clampCanvasZoom(zoom: number) {
  if (Number.isNaN(zoom)) return 1
  return Math.min(MAX_CANVAS_ZOOM, Math.max(MIN_CANVAS_ZOOM, zoom))
}

export function formatCanvasZoom(zoom: number) {
  const percent = zoom * 100
  if (percent >= 1) return `${Math.round(percent)}%`
  if (percent < 0.0001) return '<0.0001%'
  return `${Number(percent.toFixed(4))}%`
}
