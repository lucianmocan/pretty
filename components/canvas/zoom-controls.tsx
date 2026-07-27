'use client'

import { Minus, Plus, Scan } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

interface ZoomControlsProps {
  zoom: number
  onZoomIn: () => void
  onZoomOut: () => void
  onReset: () => void
  onRecenter: () => void
}

/** Floating bottom-right zoom control, Figma-style -- percent readout
 * doubles as a reset-to-100% button; Recenter fits the card to the
 * available canvas area and centers the scroll on it (distinct from
 * "reset to 100%" -- a flat 100% can still leave the card off-screen after
 * panning, and can look tiny on a large/high-DPI display). */
export function ZoomControls({ zoom, onZoomIn, onZoomOut, onReset, onRecenter }: ZoomControlsProps) {
  return (
    // Kept propagation-isolated from the surrounding canvas stage so this
    // remains safe if the stage gains click-to-deselect behavior later.
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
      <div className="scripture-zoom-controls-divider" />
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon-xs" onClick={onRecenter} aria-label="Recenter">
            <Scan />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Recenter (fit &amp; center)</TooltipContent>
      </Tooltip>
    </div>
  )
}
