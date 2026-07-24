'use client'

import { useEffect, useRef, type CSSProperties } from 'react'
import {
  resizeGeometry,
  type NodePosition,
  type NodeSize,
  type PositionPatch,
  type ResizeAxis,
  type SizePatch,
} from '@/lib/layout/resize-geometry'

interface ResizeHandlesProps {
  targetRef: React.RefObject<HTMLElement | null>
  onResize: (size: SizePatch, position?: PositionPatch) => void
  onCommit: (size: SizePatch, position?: PositionPatch) => void
  onCancel: () => void
  // Stored canvas coordinates are authoritative. DOM offsets are not: they
  // include a scroll container's current scrollLeft/scrollTop and can also
  // contain transform rounding. Omit this for flex children and the root.
  position?: NodePosition
  // Stored geometry uses unscaled content units; pointer coordinates and
  // getBoundingClientRect() are in screen units.
  zoom: number
}

interface DragState {
  axis: ResizeAxis
  pointerId: number
  startClientX: number
  startClientY: number
  startSize: NodeSize
  moved: boolean
}

const EDGE_HIT_SIZE = 12
const CORNER_HIT_SIZE = 18
const DRAG_THRESHOLD = 2

/**
 * Figma-style border resizing. Live geometry stays local to the node while
 * dragging and is committed once on release. Escape, pointer cancellation,
 * window blur, and unmount all cleanly discard the preview.
 */
export function ResizeHandles({
  targetRef,
  onResize,
  onCommit,
  onCancel,
  position,
  zoom,
}: ResizeHandlesProps) {
  const dragState = useRef<DragState | null>(null)
  const activeCleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    return () => activeCleanupRef.current?.()
  }, [])

  function beginDrag(axis: ResizeAxis) {
    return (e: React.PointerEvent) => {
      if (!e.isPrimary || e.button !== 0 || dragState.current) return
      const el = targetRef.current
      const rect = el?.getBoundingClientRect()
      if (!rect) return

      e.preventDefault()
      e.stopPropagation()

      const safeZoom = Math.max(zoom, 0.01)
      dragState.current = {
        axis,
        pointerId: e.pointerId,
        startClientX: e.clientX,
        startClientY: e.clientY,
        startSize: {
          width: rect.width / safeZoom,
          height: rect.height / safeZoom,
        },
        moved: false,
      }

      document.documentElement.dataset.scriptureResizeAxis = axis

      const compute = (ev: PointerEvent) => {
        const state = dragState.current
        if (!state || ev.pointerId !== state.pointerId) return null
        const screenDx = ev.clientX - state.startClientX
        const screenDy = ev.clientY - state.startClientY
        if (Math.hypot(screenDx, screenDy) >= DRAG_THRESHOLD) state.moved = true

        return resizeGeometry({
          axis: state.axis,
          startSize: state.startSize,
          startPosition: position,
          delta: { x: screenDx / safeZoom, y: screenDy / safeZoom },
          trackPosition: position !== undefined,
        })
      }

      const cleanup = () => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', onPointerCancel)
        window.removeEventListener('blur', onWindowBlur)
        window.removeEventListener('keydown', onKeyDown)
        delete document.documentElement.dataset.scriptureResizeAxis
        activeCleanupRef.current = null
      }

      const cancel = () => {
        cleanup()
        dragState.current = null
        onCancel()
      }

      const onMove = (ev: PointerEvent) => {
        const result = compute(ev)
        if (!result || !dragState.current?.moved) return
        ev.preventDefault()
        onResize(result.size, result.position)
      }

      const onUp = (ev: PointerEvent) => {
        if (ev.pointerId !== dragState.current?.pointerId) return
        const result = compute(ev)
        const moved = dragState.current?.moved ?? false
        cleanup()
        dragState.current = null
        if (result && moved) onCommit(result.size, result.position)
        else onCancel()
      }

      const onPointerCancel = (ev: PointerEvent) => {
        if (ev.pointerId === dragState.current?.pointerId) cancel()
      }
      const onWindowBlur = () => cancel()
      const onKeyDown = (event: KeyboardEvent) => {
        if (event.key !== 'Escape') return
        event.preventDefault()
        cancel()
      }

      activeCleanupRef.current = cleanup
      window.addEventListener('pointermove', onMove, { passive: false })
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onPointerCancel)
      window.addEventListener('blur', onWindowBlur)
      window.addEventListener('keydown', onKeyDown)
    }
  }

  const safeZoom = Math.max(zoom, 0.01)
  const hitTargetStyle = {
    '--resize-edge-hit': `${EDGE_HIT_SIZE / safeZoom}px`,
    '--resize-edge-offset': `${-EDGE_HIT_SIZE / (safeZoom * 2)}px`,
    '--resize-corner-hit': `${CORNER_HIT_SIZE / safeZoom}px`,
    '--resize-corner-offset': `${-CORNER_HIT_SIZE / (safeZoom * 2)}px`,
  } as CSSProperties

  const handle = (axis: ResizeAxis) => (
    <div
      key={axis}
      className={`resize-handle resize-handle-${axis}`}
      data-resize-axis={axis}
      onPointerDown={beginDrag(axis)}
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
      }}
    />
  )

  // North/west handles need a persistent x/y shift to keep the opposite
  // edge anchored. Flex children and the root have no position to store, so
  // only their east/south edges are exposed.
  const axes: ResizeAxis[] = position
    ? ['e', 's', 'w', 'n', 'se', 'sw', 'ne', 'nw']
    : ['e', 's', 'se']

  return (
    <div className="resize-handles" style={hitTargetStyle}>
      {axes.map(handle)}
    </div>
  )
}
