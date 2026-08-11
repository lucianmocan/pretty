'use client'

import { useEffect, useRef, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { normalizeImageCrop } from '@/lib/layout/image-crop'

export interface CropRequest {
  nodeId: string
  src: string
  cropX: number
  cropY: number
  cropWidth: number
  cropHeight: number
}

export interface CropResult {
  nodeId: string
  cropX: number
  cropY: number
  cropWidth: number
  cropHeight: number
  intrinsicWidth: number
  intrinsicHeight: number
}

interface ImageCropDialogProps {
  request: CropRequest | null
  onOpenChange: (open: boolean) => void
  onApply: (result: CropResult) => void
}

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

type DragMode = 'move' | 'nw' | 'ne' | 'sw' | 'se'

const MIN_FRACTION = 0.05
const PREVIEW_MAX = 420

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function nextRect(mode: DragMode, start: Rect, dx: number, dy: number): Rect {
  if (mode === 'move') {
    return {
      x: clamp(start.x + dx, 0, 1 - start.width),
      y: clamp(start.y + dy, 0, 1 - start.height),
      width: start.width,
      height: start.height,
    }
  }
  let left = start.x
  let top = start.y
  let right = start.x + start.width
  let bottom = start.y + start.height
  if (mode === 'nw' || mode === 'sw') left = clamp(start.x + dx, 0, right - MIN_FRACTION)
  if (mode === 'ne' || mode === 'se') right = clamp(right + dx, left + MIN_FRACTION, 1)
  if (mode === 'nw' || mode === 'ne') top = clamp(start.y + dy, 0, bottom - MIN_FRACTION)
  if (mode === 'sw' || mode === 'se') bottom = clamp(bottom + dy, top + MIN_FRACTION, 1)
  return { x: left, y: top, width: right - left, height: bottom - top }
}

const CORNERS: DragMode[] = ['nw', 'ne', 'sw', 'se']

/** A focused crop picker -- drag the rectangle to pan, drag a corner to
 * resize, both clamped to the image's own bounds. Coordinates are tracked as
 * [0,1] fractions of the image's natural size the whole time; the actual
 * "zoom into this window" rendering happens in image-block.tsx, using the
 * exact same fractions. */
export function ImageCropDialog({ request, onOpenChange, onApply }: ImageCropDialogProps) {
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [rect, setRect] = useState<Rect>({ x: 0, y: 0, width: 1, height: 1 })
  const containerRef = useRef<HTMLDivElement>(null)
  const activeDragCleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    activeDragCleanupRef.current?.()
    if (!request) return
    // Resetting local state to match a new `request` here (rather than via
    // a `key`-forced remount) keeps the dialog's own open/close animation
    // uninterrupted across requests -- deliberate, not a derivable value.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNatural(null)
    setLoadError(false)
    const crop = normalizeImageCrop(request)
    setRect({ x: crop.cropX, y: crop.cropY, width: crop.cropWidth, height: crop.cropHeight })
    const img = new Image()
    img.onload = () => setNatural({ width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = () => setLoadError(true)
    img.src = request.src
    return () => {
      img.onload = null
      img.onerror = null
    }
  }, [request])

  useEffect(() => () => activeDragCleanupRef.current?.(), [])

  function beginDrag(mode: DragMode, e: React.PointerEvent) {
    e.preventDefault()
    e.stopPropagation()
    const bounds = containerRef.current?.getBoundingClientRect()
    if (!bounds) return
    // Plain numbers, not `bounds` itself -- TS's narrowing of the optional
    // chain above doesn't carry into these nested function declarations.
    const boundsWidth = bounds.width
    const boundsHeight = bounds.height
    const start = rect
    const startClientX = e.clientX
    const startClientY = e.clientY
    activeDragCleanupRef.current?.()

    function onMove(ev: PointerEvent) {
      const dx = (ev.clientX - startClientX) / boundsWidth
      const dy = (ev.clientY - startClientY) / boundsHeight
      setRect(nextRect(mode, start, dx, dy))
    }
    function cleanup() {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', cleanup)
      window.removeEventListener('pointercancel', cleanup)
      window.removeEventListener('blur', cleanup)
      if (activeDragCleanupRef.current === cleanup) activeDragCleanupRef.current = null
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', cleanup)
    window.addEventListener('pointercancel', cleanup)
    window.addEventListener('blur', cleanup)
    activeDragCleanupRef.current = cleanup
  }

  function handleApply() {
    if (!request) return
    onApply({
      nodeId: request.nodeId,
      cropX: rect.x,
      cropY: rect.y,
      cropWidth: rect.width,
      cropHeight: rect.height,
      intrinsicWidth: natural?.width ?? 0,
      intrinsicHeight: natural?.height ?? 0,
    })
    onOpenChange(false)
  }

  let previewWidth = PREVIEW_MAX
  let previewHeight = PREVIEW_MAX
  if (natural && natural.width > 0 && natural.height > 0) {
    const aspect = natural.width / natural.height
    if (aspect >= 1) {
      previewWidth = PREVIEW_MAX
      previewHeight = PREVIEW_MAX / aspect
    } else {
      previewHeight = PREVIEW_MAX
      previewWidth = PREVIEW_MAX * aspect
    }
  }

  return (
    <Dialog open={request != null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-fit">
        <DialogHeader>
          <DialogTitle>Crop image</DialogTitle>
          <DialogDescription>Drag the window to pan, or a corner to resize.</DialogDescription>
        </DialogHeader>

        {!natural && !loadError && <p className="scripture-inspector-hint">Loading image…</p>}
        {loadError && (
          <p className="scripture-error-text" role="alert">
            The image could not be loaded. Close the crop window and try the upload again.
          </p>
        )}

        {natural && request && (
          <div
            ref={containerRef}
            className="scripture-crop-canvas"
            style={{ width: previewWidth, height: previewHeight }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size crop preview, not a next/image candidate */}
            <img className="scripture-crop-image" src={request.src} alt="" draggable={false} />
            <div
              className="scripture-crop-rect"
              style={{
                left: `${rect.x * 100}%`,
                top: `${rect.y * 100}%`,
                width: `${rect.width * 100}%`,
                height: `${rect.height * 100}%`,
              }}
              onPointerDown={(e) => beginDrag('move', e)}
            >
              {CORNERS.map((corner) => (
                <div
                  key={corner}
                  className={`scripture-crop-handle scripture-crop-handle-${corner}`}
                  onPointerDown={(e) => beginDrag(corner, e)}
                />
              ))}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setRect({ x: 0, y: 0, width: 1, height: 1 })}>
            Reset
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleApply} disabled={!natural || loadError}>
            Apply crop
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
