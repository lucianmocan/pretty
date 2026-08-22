'use client'

import { useEffect, useRef, useState } from 'react'
import { Trash2 } from 'lucide-react'
import type { CalloutAnnotation } from '@/lib/layout/types'
import { Button } from '@/components/ui/button'
import { MIN_CANVAS_ZOOM } from '@/lib/layout/canvas-zoom'

interface CalloutProps {
  docId: string
  frameId: string
  callout: CalloutAnnotation
  onChange: (patch: Partial<CalloutAnnotation>) => void
  onRemove: () => void
  zoom: number
  active?: boolean
}

/**
 * A small floating arrow+caption, positioned at (dx, dy) within the frame
 * that owns it -- same coordinate space as a canvas-mode child's x/y.
 * Rendering a dynamic arrow that tracks a moving target's exact edge would
 * need real per-frame geometry/trig; instead this uses a fixed speech-bubble
 * tail (like a standard tooltip), which still reads as "pointing at
 * something nearby" without that complexity. `targetId` is kept in the data
 * model for a future version that draws a real anchored line.
 */
export function Callout({ callout, onChange, onRemove, zoom, active = true }: CalloutProps) {
  const calloutRef = useRef<HTMLDivElement>(null)
  const dragState = useRef<{
    pointerId: number
    startX: number
    startY: number
    startDx: number
    startDy: number
    scrollLeft: number
    scrollTop: number
    scrollElement: HTMLElement | null
  } | null>(null)
  const [live, setLive] = useState<{ dx: number; dy: number } | null>(null)
  const dx = live?.dx ?? callout.dx
  const dy = live?.dy ?? callout.dy
  // Holds the currently active drag's own cleanup, if any -- deleting this
  // callout's owning frame (or the callout itself) mid-drag unmounts this
  // component; without this, the window-level pointermove/pointerup
  // listeners would keep firing forever, later calling onChange for a
  // frame/callout that may no longer exist.
  const activeCleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    return () => activeCleanupRef.current?.()
  }, [])

  useEffect(() => {
    if (!active) activeCleanupRef.current?.()
  }, [active])

  function beginDrag(e: React.PointerEvent) {
    if (!active || !e.isPrimary || e.button !== 0 || activeCleanupRef.current) return
    e.stopPropagation()
    e.preventDefault()
    const scrollElement = calloutRef.current?.closest<HTMLElement>('.scripture-canvas-area') ?? null
    dragState.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startDx: callout.dx,
      startDy: callout.dy,
      scrollLeft: scrollElement?.scrollLeft ?? 0,
      scrollTop: scrollElement?.scrollTop ?? 0,
      scrollElement,
    }

    const compute = (ev: PointerEvent) => {
      const s = dragState.current
      if (!s || ev.pointerId !== s.pointerId) return null
      const scale = Math.max(zoom, MIN_CANVAS_ZOOM)
      const scrollDx = ((s.scrollElement?.scrollLeft ?? 0) - s.scrollLeft) / scale
      const scrollDy = ((s.scrollElement?.scrollTop ?? 0) - s.scrollTop) / scale
      const element = calloutRef.current
      const parent = element?.parentElement
      const rawDx = s.startDx + (ev.clientX - s.startX) / scale + scrollDx
      const rawDy = s.startDy + (ev.clientY - s.startY) / scale + scrollDy
      const maxDx = Math.max(0, (parent?.clientWidth ?? rawDx) - (element?.offsetWidth ?? 0))
      const maxDy = Math.max(0, (parent?.clientHeight ?? rawDy) - (element?.offsetHeight ?? 0))
      return {
        dx: Math.min(maxDx, Math.max(0, rawDx)),
        dy: Math.min(maxDy, Math.max(0, rawDy)),
      }
    }
    const onMove = (ev: PointerEvent) => {
      const next = compute(ev)
      if (next) setLive(next)
    }
    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== dragState.current?.pointerId) return
      cleanup()
      const next = compute(ev)
      dragState.current = null
      setLive(null)
      if (next) onChange(next)
    }
    const onCancel = (ev: PointerEvent) => {
      if (ev.pointerId !== dragState.current?.pointerId) return
      cleanup()
      dragState.current = null
      setLive(null)
    }
    const onBlur = () => onCancel({ pointerId: dragState.current?.pointerId } as PointerEvent)
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onBlur()
    }
    function cleanup() {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('keydown', onKeyDown)
      activeCleanupRef.current = null
    }
    activeCleanupRef.current = onBlur
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    window.addEventListener('blur', onBlur)
    window.addEventListener('keydown', onKeyDown)
  }

  return (
    <div
      ref={calloutRef}
      className="scripture-callout"
      style={{ left: dx, top: dy }}
      onClick={(e) => e.stopPropagation()}
    >
      <button type="button" className="scripture-callout-tail" onPointerDown={beginDrag} aria-label="Drag callout" />
      <input
        className="scripture-callout-text"
        value={callout.text}
        placeholder="Note…"
        onChange={(e) => onChange({ text: e.target.value })}
      />
      <Button
        variant="ghost"
        size="icon-xs"
        className="scripture-callout-remove"
        onClick={onRemove}
        aria-label="Remove callout"
      >
        <Trash2 />
      </Button>
    </div>
  )
}
