'use client'

import { Minus, Plus, Scan } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatCanvasZoom } from '@/lib/layout/canvas-zoom'

const ZOOM_PRESETS = [0.01, 0.05, 0.1, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2]

interface ZoomControlsProps {
  zoom: number
  onZoomIn: () => void
  onZoomOut: () => void
  onZoomChange: (zoom: number) => void
  onRecenter: () => void
}

/** Floating bottom-right zoom control, Figma-style. The percentage opens a
 * preset picker; Recenter fits the card to the available area independently. */
export function ZoomControls({ zoom, onZoomIn, onZoomOut, onZoomChange, onRecenter }: ZoomControlsProps) {
  const selectedPreset = ZOOM_PRESETS.find((preset) => Math.abs(preset - zoom) < Number.EPSILON * 4)

  return (
    // Kept propagation-isolated from the surrounding canvas stage so this
    // remains safe if the stage gains click-to-deselect behavior later.
    <div className="scripture-zoom-controls" onClick={(e) => e.stopPropagation()}>
      <Button variant="ghost" size="icon-xs" onClick={onZoomOut} aria-label="Zoom out">
        <Minus />
      </Button>
      <Select
        value={selectedPreset == null ? '' : String(selectedPreset)}
        onValueChange={(value) => onZoomChange(Number(value))}
      >
        <SelectTrigger
          size="sm"
          showIcon={false}
          className="scripture-zoom-percent"
          aria-label={`Zoom level, ${formatCanvasZoom(zoom)}`}
          title="Choose zoom level"
        >
          <SelectValue placeholder={formatCanvasZoom(zoom)} />
        </SelectTrigger>
        <SelectContent position="popper" side="top" align="center" sideOffset={8} size="sm" className="min-w-28">
          <SelectGroup>
            <SelectLabel>Zoom</SelectLabel>
            {ZOOM_PRESETS.map((preset) => (
              <SelectItem key={preset} value={String(preset)}>
                {formatCanvasZoom(preset)}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
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
