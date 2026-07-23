'use client'

import { useEffect, useRef } from 'react'

const MIN_SIZE = 32

type Axis = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

interface ResizeHandlesProps {
  targetRef: React.RefObject<HTMLElement | null>
  // `position` is only ever populated for a drag whose axis includes a
  // left/top component (w/n/nw/ne/sw), and only when clampToParent is set --
  // see the clampToParent doc below for why those need a canvas-mode x/y to
  // shift in the first place.
  onResize: (size: { width: number; height: number }, position?: { x: number; y: number }) => void
  onCommit: (size: { width: number; height: number }, position?: { x: number; y: number }) => void
  // Current canvas zoom factor (1 = 100%) -- see the matching comment in
  // frame-node.tsx's FrameNodeProps for why screen-space measurements need
  // dividing by this before being treated as content-space size values.
  zoom: number
  // True for canvas-mode nodes. Two things hinge on this:
  //  1. Caps how far an e/s/se-ward resize can grow past its parent frame's
  //     bounds (unlike move-drag, which IS clamped via snapPosition's
  //     containerSize).
  //  2. Unlocks the full 8-direction handle set (N/S/E/W + all 4 corners).
  //     A left/top-edge drag only makes sense for a node with its own
  //     explicit x/y to shift -- a flex-mode child (or the root, which has
  //     neither) has no such anchor: flex flow alone pins its edge, so
  //     growing "leftward" wouldn't visually do anything. Those stay on the
  //     original right/bottom/corner set.
  // The container rect and the node's own position are both derived from
  // the DOM lazily inside beginDrag below (not passed as pre-computed props)
  // -- reading targetRef.current during render, rather than inside an event
  // handler, is a real React rules-of-hooks violation (flagged by eslint-
  // plugin-react-hooks' refs rule), so the caller can't measure this upfront
  // either.
  clampToParent?: boolean
}

interface DragState {
  axis: Axis
  startClientX: number
  startClientY: number
  startW: number
  startH: number
  // The node's own position relative to its parent, in content-space
  // (unscaled) units -- only meaningful for canvas-mode nodes (clampToParent).
  // A w/n-inclusive drag keeps the OPPOSITE edge fixed by deriving a new x/y
  // from this anchor, rather than just growing width/height in place.
  startNodeX: number
  startNodeY: number
  maxWidth: number
  maxHeight: number
}

/**
 * Border-drag resizing for the selected frame or block, Figma-style -- the
 * whole right/bottom/left/top edge is grabbable (plus a small hit area at
 * each corner for two-axis resize), not just a discrete handle square, see
 * the CSS for the actual hit-area shape. Measures the target's current
 * rendered size (and, for canvas-mode nodes, position) at drag start (covers
 * the common case where width/height is still "auto"/content-sized, not yet
 * an explicit stored value) and reports live deltas during the drag,
 * committing once on release so resizing doesn't spam the undo stack on
 * every pixel of motion.
 */
export function ResizeHandles({ targetRef, onResize, onCommit, zoom, clampToParent }: ResizeHandlesProps) {
  const dragState = useRef<DragState | null>(null)
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

      // Derived from the DOM right here (a safe place to read targetRef --
      // inside an event handler, not during render): the node's own
      // content-space position is just its rect's offset from its parent's,
      // since canvas-mode absolute positioning directly encodes x/y as the
      // rendered left/top -- no need for the node's stored x/y to be passed
      // in separately.
      const parentRect = clampToParent ? el?.parentElement?.getBoundingClientRect() : null
      const startW = rect.width / zoom
      const startH = rect.height / zoom

      dragState.current = {
        axis,
        startClientX: e.clientX,
        startClientY: e.clientY,
        startW,
        startH,
        startNodeX: parentRect ? (rect.left - parentRect.left) / zoom : 0,
        startNodeY: parentRect ? (rect.top - parentRect.top) / zoom : 0,
        maxWidth: parentRect ? (parentRect.width - (rect.left - parentRect.left)) / zoom : Infinity,
        maxHeight: parentRect ? (parentRect.height - (rect.top - parentRect.top)) / zoom : Infinity,
      }

      const compute = (ev: PointerEvent) => {
        const s = dragState.current
        if (!s) return null
        const dx = (ev.clientX - s.startClientX) / zoom
        const dy = (ev.clientY - s.startClientY) / zoom

        const growsRight = s.axis === 'e' || s.axis === 'ne' || s.axis === 'se'
        const growsLeft = s.axis === 'w' || s.axis === 'nw' || s.axis === 'sw'
        const growsDown = s.axis === 's' || s.axis === 'se' || s.axis === 'sw'
        const growsUp = s.axis === 'n' || s.axis === 'ne' || s.axis === 'nw'

        let width = s.startW
        let height = s.startH
        let x: number | undefined
        let y: number | undefined

        if (growsRight) {
          width = Math.min(s.maxWidth, Math.max(MIN_SIZE, Math.round(s.startW + dx)))
        } else if (growsLeft) {
          // Anchor the RIGHT edge in place -- recompute width from how far
          // the pointer is from that fixed edge, then derive x from the
          // (now clamped) width so the anchor never drifts even once width
          // hits MIN_SIZE.
          const anchorRight = s.startNodeX + s.startW
          width = Math.min(anchorRight, Math.max(MIN_SIZE, Math.round(s.startW - dx)))
          x = Math.round(anchorRight - width)
        }

        if (growsDown) {
          height = Math.min(s.maxHeight, Math.max(MIN_SIZE, Math.round(s.startH + dy)))
        } else if (growsUp) {
          const anchorBottom = s.startNodeY + s.startH
          height = Math.min(anchorBottom, Math.max(MIN_SIZE, Math.round(s.startH - dy)))
          y = Math.round(anchorBottom - height)
        }

        const position = x != null || y != null ? { x: x ?? s.startNodeX, y: y ?? s.startNodeY } : undefined
        return { size: { width, height }, position }
      }

      const onMove = (ev: PointerEvent) => {
        const result = compute(ev)
        if (result) onResize(result.size, result.position)
      }
      const onUp = (ev: PointerEvent) => {
        cleanup()
        const result = compute(ev)
        dragState.current = null
        if (result) onCommit(result.size, result.position)
        // Whenever a resize clamps (hits MIN_SIZE, a parent bound, or x/y
        // reaching 0) before the pointer stops moving, the handle itself
        // stops tracking the cursor -- so by release, the pointer can be
        // sitting over an ANCESTOR of the handle (the node's own frame, or
        // its parent) instead of the handle. Browsers synthesize a 'click'
        // on the nearest common ancestor of the mousedown/mouseup targets
        // when they differ, which would otherwise bubble into that
        // ancestor's onClick and silently reselect it. One-shot, capture-
        // phase, and removed either when it fires or after this tick if it
        // never does (e.g. down/up targets matched, so no synthesized click
        // needed suppressing).
        const suppressNextClick = (ce: MouseEvent) => {
          ce.stopPropagation()
          window.removeEventListener('click', suppressNextClick, true)
        }
        window.addEventListener('click', suppressNextClick, true)
        setTimeout(() => window.removeEventListener('click', suppressNextClick, true), 0)
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

  // Handles live inside the zoomed canvas viewport (transform: scale(zoom)),
  // so a fixed CSS size on them scales WITH the content -- at the ~2-3x
  // auto-fit zoom this app now defaults to, a "14px" edge strip renders as
  // 30-40+ screen px, easily covering most of a modestly-sized block and
  // stealing clicks meant for dragging its body. Counter-scaling by 1/zoom
  // keeps their actual ON-SCREEN size constant at every zoom level, exactly
  // like Figma's own selection handles -- ...Origin (set per-direction in
  // CSS) keeps each handle still flush against its real edge/corner as it
  // shrinks, instead of shrinking toward its own center and drifting away
  // from that edge.
  const counterScale = { transform: `scale(${1 / zoom})` }

  return (
    <>
      <div className="resize-handle resize-handle-e" style={counterScale} onPointerDown={beginDrag('e')} />
      <div className="resize-handle resize-handle-s" style={counterScale} onPointerDown={beginDrag('s')} />
      {clampToParent && (
        <>
          <div className="resize-handle resize-handle-w" style={counterScale} onPointerDown={beginDrag('w')} />
          <div className="resize-handle resize-handle-n" style={counterScale} onPointerDown={beginDrag('n')} />
        </>
      )}
      <div className="resize-handle resize-handle-se" style={counterScale} onPointerDown={beginDrag('se')} />
      {clampToParent && (
        <>
          <div className="resize-handle resize-handle-sw" style={counterScale} onPointerDown={beginDrag('sw')} />
          <div className="resize-handle resize-handle-ne" style={counterScale} onPointerDown={beginDrag('ne')} />
          <div className="resize-handle resize-handle-nw" style={counterScale} onPointerDown={beginDrag('nw')} />
        </>
      )}
    </>
  )
}
