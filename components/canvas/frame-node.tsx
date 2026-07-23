'use client'

import { useEffect, useRef, useState } from 'react'
import { GripVertical, ChevronUp, ChevronDown, Trash2 } from 'lucide-react'
import type { ChildLayout, LayoutNode } from '@/lib/layout/types'
import { frameStyle, sizeStyle } from '@/lib/layout/frame-style'
import { snapPosition } from '@/lib/layout/canvas-snap'
import { BlockEditor } from '@/components/editor/block-editor'
import { getYDoc } from '@/lib/yjs/doc-store'
import { ROOT_ID, updateCallout, removeCallout, updateImageProps, type GutterClickMode } from '@/lib/yjs/layout-store'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ResizeHandles } from './resize-handles'
import { Callout } from './callout'
import { ImageBlock } from './image-block'

interface FrameNodeProps {
  node: LayoutNode
  docId: string
  selectedIds: string[]
  onSelect: (id: string, additive: boolean) => void
  onMove: (id: string, direction: 'up' | 'down') => void
  onRemove: (id: string) => void
  onReorder: (draggedId: string, targetId: string) => void
  onResizeNode: (id: string, size: { width: number; height: number }) => void
  onRepositionNode: (id: string, position: { x: number; y: number }) => void
  // The layout mode of THIS node's parent frame -- determines whether this
  // node flows via flex (default) or is absolutely positioned via its own
  // x/y. The root has no parent of its own, so this is irrelevant for it.
  parentChildLayout: ChildLayout
  // What clicking a code block's gutter line number does -- shared,
  // ephemeral UI state (not persisted), set via the Inspector.
  gutterClickMode: GutterClickMode
  onGutterClick: (blockId: string, lineNumber: number) => void
  // Current canvas zoom factor (1 = 100%). node.x/y/width/height are always
  // stored in true, unscaled content units, but getBoundingClientRect() and
  // pointer client coordinates reflect the CSS `transform: scale(zoom)`
  // applied upstream on .scripture-canvas-viewport -- every drag/resize
  // computation here must divide screen-space measurements by zoom to
  // recover content-space values before comparing against or writing back
  // to stored positions/sizes.
  zoom: number
  // Figma-style selection model (canvas-mode blocks only): which ONE block,
  // if any, is actually in text-edit mode right now (entered via double-
  // click). A block that's merely *selected* isn't -- its editor renders
  // non-editable, freeing up plain click+drag to mean "move this" instead
  // of "place a text cursor".
  editingId: string | null
  onSetEditing: (id: string | null) => void
}

function classNames(...parts: Array<string | false | undefined>) {
  return parts.filter(Boolean).join(' ')
}

// A custom MIME type, not 'text/plain': code/text blocks are contenteditable,
// and browsers natively insert a 'text/plain' drop payload as literal text
// into whatever contenteditable it lands on -- bypassing our onDrop handler's
// preventDefault() entirely and corrupting the block's content with a raw
// node id. A type contenteditable doesn't recognize sidesteps that default
// behavior completely.
const DRAG_MIME = 'application/x-scripture-node-id'

interface GripHandlers {
  draggable?: boolean
  onDragStart?: (e: React.DragEvent) => void
  onPointerDown?: (e: React.PointerEvent) => void
}

function NodeControls({
  id,
  onMove,
  onRemove,
  gripHandlers,
  showGrip,
}: {
  id: string
  onMove: (id: string, direction: 'up' | 'down') => void
  onRemove: (id: string) => void
  gripHandlers: GripHandlers
  // false for canvas-mode nodes -- dragging works directly on the block
  // itself there (see beginMoveDrag wired to the block's own onPointerDown),
  // so a separate grip handle would be redundant chrome. Still shown for
  // flex-mode nodes, where the grip is what starts native drag-and-drop
  // reordering (a different interaction, not a position drag).
  showGrip: boolean
}) {
  return (
    <div className="scripture-node-controls" onClick={(e) => e.stopPropagation()}>
      {showGrip && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-xs" aria-label="Drag to move" {...gripHandlers}>
              <GripVertical />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Drag to move</TooltipContent>
        </Tooltip>
      )}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon-xs" onClick={() => onMove(id, 'up')} aria-label="Move up">
            <ChevronUp />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Move up</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon-xs" onClick={() => onMove(id, 'down')} aria-label="Move down">
            <ChevronDown />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Move down</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon-xs" onClick={() => onRemove(id)} aria-label="Delete">
            <Trash2 />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Delete</TooltipContent>
      </Tooltip>
    </div>
  )
}

/**
 * Recursive interactive renderer for the layout tree -- selection + hover
 * controls + drag-and-drop reordering + resize handles + canvas-mode
 * positioning all live here. The print route walks the same tree shape
 * separately (it has no interactivity), but both call the shared
 * frameStyle()/sizeStyle() for the actual styling so they can't diverge.
 */
export function FrameNode({
  node,
  docId,
  selectedIds,
  onSelect,
  onMove,
  onRemove,
  onReorder,
  onResizeNode,
  onRepositionNode,
  parentChildLayout,
  gutterClickMode,
  onGutterClick,
  zoom,
  editingId,
  onSetEditing,
}: FrameNodeProps) {
  const isRoot = node.id === ROOT_ID
  const isSelected = selectedIds.includes(node.id)
  const isCanvasChild = parentChildLayout === 'canvas'
  // Only textual canvas-mode blocks need the selected-vs-editing split --
  // flex-mode blocks have no competing "drag the block by clicking it"
  // gesture (dragging there is still grip-initiated, native drag-and-drop
  // reordering), so they stay exactly as always-editable as before; image
  // blocks have no text content to edit in the first place, just a click-
  // to-upload/replace action, so they're always draggable-by-body in canvas
  // mode with no editing gate at all.
  const isTextual = node.kind === 'code' || node.kind === 'text'
  const needsEditGate = isTextual && isCanvasChild
  const isEditing = !needsEditGate || editingId === node.id
  const canDragViaBody = isCanvasChild && !(needsEditGate && isEditing)
  const isOnlySelected = isSelected && selectedIds.length === 1
  const [isDragOver, setIsDragOver] = useState(false)
  // Optimistic preview during a resize/move drag -- committed to Yjs only on
  // release (see ResizeHandles / beginMoveDrag), so dragging doesn't spam
  // the undo stack on every pixel of motion.
  const [liveSize, setLiveSize] = useState<{ width: number; height: number } | null>(null)
  const [livePosition, setLivePosition] = useState<{ x: number; y: number } | null>(null)
  const [guides, setGuides] = useState<{ x: number[]; y: number[] } | null>(null)
  const [dragParentRect, setDragParentRect] = useState<DOMRect | null>(null)
  const elementRef = useRef<HTMLDivElement>(null)
  // Holds the currently active move-drag's own cleanup, if any -- an unmount
  // mid-drag (deleting this node, e.g. via Delete/Backspace, or switching
  // pages while still holding it) would otherwise leave the window-level
  // pointermove/pointerup listeners attached forever, later calling
  // onRepositionNode against a stale node id/closure.
  const activeDragCleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    return () => activeDragCleanupRef.current?.()
  }, [])

  const sizeOverride = liveSize ? { width: `${liveSize.width}px`, height: `${liveSize.height}px` } : undefined

  const canvasPositionStyle: React.CSSProperties | undefined =
    !isRoot && parentChildLayout === 'canvas'
      ? {
          position: 'absolute',
          left: livePosition ? livePosition.x : (node.x ?? 0),
          top: livePosition ? livePosition.y : (node.y ?? 0),
        }
      : undefined

  const resizeHandles = isOnlySelected && (
    <ResizeHandles
      targetRef={elementRef}
      onResize={setLiveSize}
      onCommit={(size) => {
        setLiveSize(null)
        onResizeNode(node.id, size)
      }}
      zoom={zoom}
      clampToParent={isCanvasChild}
    />
  )

  function beginMoveDrag(e: React.PointerEvent) {
    e.stopPropagation()
    e.preventDefault()
    const el = elementRef.current
    const parentEl = el?.parentElement
    if (!el || !parentEl) return

    // Dragging now starts directly from the block itself (no floating grip
    // to click first), so make sure it's actually selected as this drag
    // begins -- matches Figma: click-dragging an unselected shape selects
    // AND moves it in one motion. Skipped if already selected (whether
    // alone or part of a multi-selection) so starting a drag on one member
    // of an existing multi-select doesn't collapse the rest of it.
    if (!isSelected) onSelect(node.id, e.shiftKey)

    const parentRect = parentEl.getBoundingClientRect()
    setDragParentRect(parentRect)
    const startWidth = el.getBoundingClientRect().width / zoom
    const startHeight = el.getBoundingClientRect().height / zoom
    const startX = node.x ?? 0
    const startY = node.y ?? 0
    const startClientX = e.clientX
    const startClientY = e.clientY

    const siblingEls = Array.from(parentEl.querySelectorAll<HTMLElement>(':scope > [data-node-id]')).filter(
      (sib) => sib !== el
    )
    const siblings = siblingEls.map((sib) => {
      const r = sib.getBoundingClientRect()
      return {
        x: (r.left - parentRect.left) / zoom,
        y: (r.top - parentRect.top) / zoom,
        width: r.width / zoom,
        height: r.height / zoom,
      }
    })

    // Absolute positioning in canvas mode is relative to the parent's
    // PADDING box (per the CSS spec for absolutely-positioned descendants),
    // which is exactly what parentRect measures -- so this is already the
    // container's own available x/y space, no extra padding/margin to
    // subtract. Clamping to it (see snapPosition's containerSize param) is
    // what keeps a dragged block -- and the floating NodeControls/tooltip
    // cluster that renders outside its own top edge -- from ever crossing
    // into negative territory the scrollable canvas area can't scroll back to.
    const containerSize = { width: parentRect.width / zoom, height: parentRect.height / zoom }

    const compute = (ev: PointerEvent) => {
      const dx = (ev.clientX - startClientX) / zoom
      const dy = (ev.clientY - startClientY) / zoom
      return snapPosition(
        { x: startX + dx, y: startY + dy, width: startWidth, height: startHeight },
        siblings,
        containerSize
      )
    }

    const onMovePointer = (ev: PointerEvent) => {
      const snapped = compute(ev)
      setLivePosition({ x: snapped.x, y: snapped.y })
      setGuides(snapped.guides)
    }
    const onUpPointer = (ev: PointerEvent) => {
      cleanup()
      const snapped = compute(ev)
      setLivePosition(null)
      setGuides(null)
      setDragParentRect(null)
      onRepositionNode(node.id, { x: snapped.x, y: snapped.y })
    }
    function cleanup() {
      window.removeEventListener('pointermove', onMovePointer)
      window.removeEventListener('pointerup', onUpPointer)
      activeDragCleanupRef.current = null
    }
    activeDragCleanupRef.current = cleanup
    window.addEventListener('pointermove', onMovePointer)
    window.addEventListener('pointerup', onUpPointer)
  }

  // Canvas mode no longer uses the grip at all -- see showGrip below --
  // dragging is wired directly to the block's own onPointerDown instead.
  const gripHandlers: GripHandlers =
    parentChildLayout === 'canvas'
      ? {}
      : {
          draggable: true,
          onDragStart: (e: React.DragEvent) => {
            e.stopPropagation()
            e.dataTransfer.setData(DRAG_MIME, node.id)
            e.dataTransfer.effectAllowed = 'move'
          },
        }
  const showGrip = parentChildLayout !== 'canvas'

  function handleDoubleClick(e: React.MouseEvent) {
    e.stopPropagation()
    onSelect(node.id, false)
    onSetEditing(node.id)
  }

  const guideOverlay = guides && dragParentRect && (
    <>
      {guides.x.map((gx, i) => (
        <div
          key={`gx-${i}`}
          className="scripture-canvas-guide scripture-canvas-guide-v"
          style={{
            // dragParentRect is a raw screen-space rect; gx/gy are
            // content-space (unscaled), so they need re-scaling by zoom
            // before being combined with it.
            left: dragParentRect.left + gx * zoom,
            top: dragParentRect.top,
            height: dragParentRect.height,
          }}
        />
      ))}
      {guides.y.map((gy, i) => (
        <div
          key={`gy-${i}`}
          className="scripture-canvas-guide scripture-canvas-guide-h"
          style={{
            top: dragParentRect.top + gy * zoom,
            left: dragParentRect.left,
            width: dragParentRect.width,
          }}
        />
      ))}
    </>
  )

  const dragTargetHandlers = isRoot
    ? {}
    : {
        onDragOver: (e: React.DragEvent) => {
          e.preventDefault()
          e.stopPropagation()
          setIsDragOver(true)
        },
        onDragLeave: (e: React.DragEvent) => {
          e.stopPropagation()
          setIsDragOver(false)
        },
        onDrop: (e: React.DragEvent) => {
          e.preventDefault()
          e.stopPropagation()
          setIsDragOver(false)
          const draggedId = e.dataTransfer.getData(DRAG_MIME)
          if (draggedId) onReorder(draggedId, node.id)
        },
      }

  if (node.kind === 'frame') {
    const children = node.children ?? []
    const childLayout = node.childLayout ?? 'flex'
    return (
      <div
        ref={elementRef}
        data-node-id={node.id}
        className={classNames(
          'scripture-frame',
          isRoot && 'scripture-card',
          childLayout === 'canvas' && 'scripture-frame-canvas',
          isSelected && 'scripture-selected',
          isDragOver && 'is-drag-over'
        )}
        style={{ ...frameStyle(node), ...canvasPositionStyle, ...sizeOverride }}
        onClick={(e) => {
          e.stopPropagation()
          onSelect(node.id, e.shiftKey)
        }}
        onPointerDown={!isRoot && parentChildLayout === 'canvas' ? beginMoveDrag : undefined}
        {...dragTargetHandlers}
      >
        {!isRoot && !livePosition && !liveSize && (
          <NodeControls id={node.id} onMove={onMove} onRemove={onRemove} gripHandlers={gripHandlers} showGrip={showGrip} />
        )}
        {children.length === 0 && (
          <div className="scripture-empty-frame">Empty frame. Select it and add a block.</div>
        )}
        {children.map((child) => (
          <FrameNode
            key={child.id}
            node={child}
            docId={docId}
            selectedIds={selectedIds}
            onSelect={onSelect}
            onMove={onMove}
            onRemove={onRemove}
            onReorder={onReorder}
            onResizeNode={onResizeNode}
            onRepositionNode={onRepositionNode}
            parentChildLayout={childLayout}
            gutterClickMode={gutterClickMode}
            onGutterClick={onGutterClick}
            zoom={zoom}
            editingId={editingId}
            onSetEditing={onSetEditing}
          />
        ))}
        {(node.callouts ?? []).map((callout) => (
          <Callout
            key={callout.id}
            docId={docId}
            frameId={node.id}
            callout={callout}
            onChange={(patch) => updateCallout(getYDoc(docId).doc, node.id, callout.id, patch)}
            onRemove={() => removeCallout(getYDoc(docId).doc, node.id, callout.id)}
          />
        ))}
        {resizeHandles}
        {guideOverlay}
      </div>
    )
  }

  return (
    <div
      ref={elementRef}
      data-node-id={node.id}
      className={classNames('scripture-leaf', isSelected && 'scripture-selected', isDragOver && 'is-drag-over')}
      style={{ ...sizeStyle(node), ...canvasPositionStyle, ...sizeOverride }}
      onClick={(e) => {
        e.stopPropagation()
        onSelect(node.id, e.shiftKey)
      }}
      onDoubleClick={needsEditGate ? handleDoubleClick : undefined}
      onPointerDown={canDragViaBody ? beginMoveDrag : undefined}
      {...dragTargetHandlers}
    >
      {!livePosition && !liveSize && (
        <NodeControls id={node.id} onMove={onMove} onRemove={onRemove} gripHandlers={gripHandlers} showGrip={showGrip} />
      )}
      {node.kind === 'image' ? (
        <ImageBlock
          src={node.src ?? ''}
          alt={node.alt ?? ''}
          onUploaded={(url) => updateImageProps(getYDoc(docId).doc, node.id, { src: url })}
        />
      ) : (
        <BlockEditor
          docId={docId}
          blockId={node.id}
          kind={node.kind}
          editable={isEditing}
          language={node.language}
          theme={node.theme}
          fontFamily={node.fontFamily}
          filename={node.filename}
          chromeStyle={node.chromeStyle}
          customChrome={node.customChrome}
          showLineNumbers={node.showLineNumbers}
          startLineNumber={node.startLineNumber}
          ligatures={node.ligatures}
          lineHeight={node.lineHeight}
          letterSpacing={node.letterSpacing}
          highlightLines={node.highlightLines}
          trimRanges={node.trimRanges}
          diffLines={node.diffLines}
          onLineClick={(lineNumber) => onGutterClick(node.id, lineNumber)}
          onEmptyBlur={() => onRemove(node.id)}
        />
      )}
      {resizeHandles}
      {guideOverlay}
    </div>
  )
}
