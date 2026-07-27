import type { ReactNode } from 'react'
import type { PageSize } from '@/lib/layout/types'

interface CanvasRootProps {
  children: ReactNode
  printMode?: boolean
  // Only meaningful in printMode -- the browser exporter reads these data-*
  // attributes to decide the PDF page format.
  pageSize?: PageSize
  customPageWidthMm?: number
  customPageHeightMm?: number
  exportMarginPx?: number
}

/**
 * The bleed-gutter wrapper captured via #canvas-root. Its padding covers the root frame's shadow so
 * it doesn't get clipped in the exported PDF. The root frame itself (styled
 * via frameStyle() + the .scripture-card class) supplies its own
 * background/padding/radius from the layout tree.
 */
export function CanvasRoot({
  children,
  printMode,
  pageSize,
  customPageWidthMm,
  customPageHeightMm,
  exportMarginPx,
}: CanvasRootProps) {
  return (
    <div
      id="canvas-root"
      className={printMode ? 'scripture-canvas-root print-mode' : 'scripture-canvas-root'}
      data-page-size={printMode ? (pageSize ?? 'content') : undefined}
      data-page-width-mm={printMode ? customPageWidthMm : undefined}
      data-page-height-mm={printMode ? customPageHeightMm : undefined}
      style={printMode && exportMarginPx != null ? { padding: exportMarginPx } : undefined}
    >
      {children}
    </div>
  )
}
