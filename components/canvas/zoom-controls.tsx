'use client'

import { Minus, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ZoomControlsProps {
  zoom: number
  onZoomIn: () => void
  onZoomOut: () => void
  onReset: () => void
}

/** Floating bottom-right zoom control, Figma-style -- percent readout
 * doubles as a reset-to-100% button. */
export function ZoomControls({ zoom, onZoomIn, onZoomOut, onReset }: ZoomControlsProps) {
  return (
    // stopPropagation -- this sits inside .scripture-canvas-area, whose own
    // onClick resets selection to root on any click that reaches it. Without
    // this, clicking a zoom button would bubble up and immediately clear
    // whatever was selected.
    <div className="scripture-zoom-controls" onClick={(e) => e.stopPropagation()}>
      <Button variant="ghost" size="icon-xs" onClick={onZoomOut} aria-label="Zoom out">
        <Minus />
      </Button>
      <button type="button" className="scripture-zoom-percent" onClick={onReset} title="Reset to 100%">
        {Math.round(zoom * 100)}%
      </button>
      <Button variant="ghost" size="icon-xs" onClick={onZoomIn} aria-label="Zoom in">
        <Plus />
      </Button>
    </div>
  )
}
