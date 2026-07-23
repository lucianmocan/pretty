'use client'

import { useEffect, useRef, useState } from 'react'
import { Trash2 } from 'lucide-react'
import type { CalloutAnnotation } from '@/lib/layout/types'
import { Button } from '@/components/ui/button'

interface CalloutProps {
  docId: string
  frameId: string
  callout: CalloutAnnotation
  onChange: (patch: Partial<CalloutAnnotation>) => void
  onRemove: () => void
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
export function Callout({ callout, onChange, onRemove }: CalloutProps) {
  const dragState = useRef<{ startX: number; startY: number; startDx: number; startDy: number } | null>(null)
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

  function beginDrag(e: React.PointerEvent) {
    e.stopPropagation()
    e.preventDefault()
    dragState.current = { startX: e.clientX, startY: e.clientY, startDx: callout.dx, startDy: callout.dy }

    const compute = (ev: PointerEvent) => {
      const s = dragState.current
      if (!s) return null
      return { dx: s.startDx + (ev.clientX - s.startX), dy: s.startDy + (ev.clientY - s.startY) }
    }
    const onMove = (ev: PointerEvent) => {
      const next = compute(ev)
      if (next) setLive(next)
    }
    const onUp = (ev: PointerEvent) => {
      cleanup()
      const next = compute(ev)
      dragState.current = null
      setLive(null)
      if (next) onChange(next)
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

  return (
    <div className="scripture-callout" style={{ left: dx, top: dy }} onClick={(e) => e.stopPropagation()}>
      <div className="scripture-callout-tail" onPointerDown={beginDrag} />
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
