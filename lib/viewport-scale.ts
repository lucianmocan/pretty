// The editor's authored desktop size (and default browser-test viewport) is
// approximately 1440 x 900. Larger effective viewports scale from there so
// browser zoom-out is counterbalanced proportionally instead of waiting
// until the CSS viewport has already become enormous.
const REFERENCE_VIEWPORT_WIDTH = 1440
const REFERENCE_VIEWPORT_HEIGHT = 900
const MAX_UI_SCALE = 2

/**
 * Keeps the application chrome at roughly the same physical size when a
 * display exposes substantially more CSS pixels, including browser zoom-out
 * and high-resolution displays without OS-level scaling.
 */
export function calculateViewportScale(width: number, height: number): number {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return 1
  const fittedScale = Math.min(width / REFERENCE_VIEWPORT_WIDTH, height / REFERENCE_VIEWPORT_HEIGHT)
  return Math.round(Math.min(MAX_UI_SCALE, Math.max(1, fittedScale)) * 1000) / 1000
}
