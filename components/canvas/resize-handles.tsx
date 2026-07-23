'use client'

import { useEffect, useRef } from 'react'

const MIN_SIZE = 32

type Axis = 'x' | 'y' | 'both'

interface ResizeHandlesProps {
  targetRef: React.RefObject<HTMLElement | null>
  onResize: (size: { width: number; height: number }) => void
  onCommit: (size: { width: number; height: number }) => void
  // Current canvas zoom factor (1 = 100%) -- see the matching comment in
  // frame-node.tsx's FrameNodeProps for why screen-space measurements need
  // dividing by this before being treated as content-space size values.
  zoom: number
  // True for canvas-mode nodes -- caps how far a resize can grow the block's
  // right/bottom edge to its parent frame's bounds. Without this, resizing
  // (unlike move-drag, which IS clamped via snapPosition's containerSize)
  // could grow a block arbitrarily far past its canvas frame. The container
  // rect and the node's own position are both derived from the DOM lazily
  // inside beginDrag below (not passed as pre-computed props) -- reading
  // targetRef.current during render, rather than inside an event handler,
  // is a real React rules-of-hooks violation (flagged by eslint-plugin-
  // react-hooks' refs rule), so the caller can't measure this upfront either.
  clampToParent?: boolean
}

/**
 * Corner/edge drag handles for the selected frame or block. Measures the
 * target's current rendered size at drag start (covers the common case
 * where width/height is still "auto"/content-sized, not yet an explicit
 * stored value) and reports live deltas during the drag, committing once on
 * release so resizing doesn't spam the undo stack on every pixel of motion.
 */
export function ResizeHandles({ targetRef, onResize, onCommit, zoom, clampToParent }: ResizeHandlesProps) {
  const dragState = useRef<{ startX: number; startY: number; startW: number; startH: number; axis: Axis } | null>(
    null
  )
  // Holds whatever the CURRENTLY active drag's own cleanup is, so an unmount
  // mid-drag (e.g. the block gets deleted, or the page is switched, while
  // still holding the handle down) can remove the window-level listeners
  // instead of leaking them -- they'd otherwise keep firing onResize/onCommit
  // against a stale node id/closure indefinitely.
  const activeCleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    return () => activeCleanupRef.current?.()
  }, [])

  function beginDrag(axis: Axis) {
    return (e: React.PointerEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const el = targetRef.current
      const rect = el?.getBoundingClientRect()
      if (!rect) return
      dragState.current = {
        startX: e.clientX,
        startY: e.clientY,
        startW: rect.width / zoom,
        startH: rect.height / zoom,
        axis,
      }

      // Derived from the DOM right here (a safe place to read targetRef --
      // inside an event handler, not during render): the node's own
      // content-space position is just its rect's offset from its parent's,
      // since canvas-mode absolute positioning directly encodes x/y as the
      // rendered left/top -- no need for the node's stored x/y to be passed
      // in separately.
      const parentRect = clampToParent ? el?.parentElement?.getBoundingClientRect() : null
      const maxWidth = parentRect ? (parentRect.width - (rect.left - parentRect.left)) / zoom : Infinity
      const maxHeight = parentRect ? (parentRect.height - (rect.top - parentRect.top)) / zoom : Infinity

      const compute = (ev: PointerEvent) => {
        const s = dragState.current
        if (!s) return null
        const dx = (ev.clientX - s.startX) / zoom
        const dy = (ev.clientY - s.startY) / zoom
        const width =
          s.axis === 'y' ? Math.round(s.startW) : Math.min(maxWidth, Math.max(MIN_SIZE, Math.round(s.startW + dx)))
        const height =
          s.axis === 'x' ? Math.round(s.startH) : Math.min(maxHeight, Math.max(MIN_SIZE, Math.round(s.startH + dy)))
        return { width, height }
      }

      const onMove = (ev: PointerEvent) => {
        const size = compute(ev)
        if (size) onResize(size)
      }
      const onUp = (ev: PointerEvent) => {
        cleanup()
        const size = compute(ev)
        dragState.current = null
        if (size) onCommit(size)
      }
      function cleanup() {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        activeCleanupRef.current = null
      }
      activeCleanupRef.current = cleanup
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
