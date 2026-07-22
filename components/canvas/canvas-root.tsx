import type { ReactNode } from 'react'
import type { PageSize } from '@/lib/layout/types'

interface CanvasRootProps {
  children: ReactNode
  printMode?: boolean
  // Only meaningful in printMode -- app/api/export/route.ts reads these back
  // as data-* attributes after navigating, to decide the PDF page format.
  pageSize?: PageSize
  customPageWidthMm?: number
  customPageHeightMm?: number
}

/**
 * The bleed-gutter wrapper Playwright measures via #canvas-root (see
 * app/api/export/route.ts) -- padding here covers the root frame's shadow so
 * it doesn't get clipped in the exported PDF. The root frame itself (styled
 * via frameStyle() + the .scripture-card class) supplies its own
 * background/padding/radius from the layout tree.
 */
export function CanvasRoot({ children, printMode, pageSize, customPageWidthMm, customPageHeightMm }: CanvasRootProps) {
  return (
    <div
      id="canvas-root"
      className={printMode ? 'scripture-canvas-root print-mode' : 'scripture-canvas-root'}
      data-page-size={printMode ? (pageSize ?? 'content') : undefined}
      data-page-width-mm={printMode ? customPageWidthMm : undefined}
      data-page-height-mm={printMode ? customPageHeightMm : undefined}
    >
      {children}
    </div>
  )
}
