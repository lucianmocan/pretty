'use client'

import { useRef } from 'react'

const MIN_SIZE = 32

type Axis = 'x' | 'y' | 'both'

interface ResizeHandlesProps {
  targetRef: React.RefObject<HTMLElement | null>
  onResize: (size: { width: number; height: number }) => void
  onCommit: (size: { width: number; height: number }) => void
}

/**
 * Corner/edge drag handles for the selected frame or block. Measures the
 * target's current rendered size at drag start (covers the common case
 * where width/height is still "auto"/content-sized, not yet an explicit
 * stored value) and reports live deltas during the drag, committing once on
 * release so resizing doesn't spam the undo stack on every pixel of motion.
 */
export function ResizeHandles({ targetRef, onResize, onCommit }: ResizeHandlesProps) {
  const dragState = useRef<{ startX: number; startY: number; startW: number; startH: number; axis: Axis } | null>(
    null
  )

  function beginDrag(axis: Axis) {
    return (e: React.PointerEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const rect = targetRef.current?.getBoundingClientRect()
      if (!rect) return
      dragState.current = { startX: e.clientX, startY: e.clientY, startW: rect.width, startH: rect.height, axis }

      const compute = (ev: PointerEvent) => {
        const s = dragState.current
        if (!s) return null
        const dx = ev.clientX - s.startX
        const dy = ev.clientY - s.startY
        const width = s.axis === 'y' ? Math.round(s.startW) : Math.max(MIN_SIZE, Math.round(s.startW + dx))
        const height = s.axis === 'x' ? Math.round(s.startH) : Math.max(MIN_SIZE, Math.round(s.startH + dy))
        return { width, height }
      }

      const onMove = (ev: PointerEvent) => {
        const size = compute(ev)
        if (size) onResize(size)
      }
      const onUp = (ev: PointerEvent) => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        const size = compute(ev)
        dragState.current = null
        if (size) onCommit(size)
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    }
  }

  return (
    <>
      <div className="resize-handle resize-handle-e" onPointerDown={beginDrag('x')} />
      <div className="resize-handle resize-handle-s" onPointerDown={beginDrag('y')} />
      <div className="resize-handle resize-handle-se" onPointerDown={beginDrag('both')} />
    </>
  )
}
