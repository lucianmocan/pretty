'use client'

import { useRef, useState } from 'react'
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
}: {
  id: string
  onMove: (id: string, direction: 'up' | 'down') => void
  onRemove: (id: string) => void
  gripHandlers: GripHandlers
}) {
  return (
    <div className="scripture-node-controls" onClick={(e) => e.stopPropagation()}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon-xs" aria-label="Drag to move" {...gripHandlers}>
            <GripVertical />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Drag to move</TooltipContent>
      </Tooltip>
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
}: FrameNodeProps) {
  const isRoot = node.id === ROOT_ID
  const isSelected = selectedIds.includes(node.id)
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
    />
  )

  function beginMoveDrag(e: React.PointerEvent) {
    e.stopPropagation()
    e.preventDefault()
    const el = elementRef.current
    const parentEl = el?.parentElement
    if (!el || !parentEl) return

    const parentRect = parentEl.getBoundingClientRect()
    setDragParentRect(parentRect)
    const startWidth = el.getBoundingClientRect().width
    const startHeight = el.getBoundingClientRect().height
    const startX = node.x ?? 0
    const startY = node.y ?? 0
    const startClientX = e.clientX
    const startClientY = e.clientY

    const siblingEls = Array.from(parentEl.querySelectorAll<HTMLElement>(':scope > [data-node-id]')).filter(
      (sib) => sib !== el
    )
    const siblings = siblingEls.map((sib) => {
      const r = sib.getBoundingClientRect()
      return { x: r.left - parentRect.left, y: r.top - parentRect.top, width: r.width, height: r.height }
    })

    const compute = (ev: PointerEvent) => {
      const dx = ev.clientX - startClientX
      const dy = ev.clientY - startClientY
      return snapPosition({ x: startX + dx, y: startY + dy, width: startWidth, height: startHeight }, siblings)
    }

    const onMovePointer = (ev: PointerEvent) => {
      const snapped = compute(ev)
      setLivePosition({ x: snapped.x, y: snapped.y })
      setGuides(snapped.guides)
    }
    const onUpPointer = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', onMovePointer)
      window.removeEventListener('pointerup', onUpPointer)
      const snapped = compute(ev)
      setLivePosition(null)
      setGuides(null)
      setDragParentRect(null)
      onRepositionNode(node.id, { x: snapped.x, y: snapped.y })
    }
    window.addEventListener('pointermove', onMovePointer)
    window.addEventListener('pointerup', onUpPointer)
  }

  const gripHandlers: GripHandlers =
    parentChildLayout === 'canvas'
      ? { onPointerDown: beginMoveDrag }
      : {
          draggable: true,
          onDragStart: (e: React.DragEvent) => {
            e.stopPropagation()
            e.dataTransfer.setData(DRAG_MIME, node.id)
            e.dataTransfer.effectAllowed = 'move'
          },
        }

  const guideOverlay = guides && dragParentRect && (
    <>
      {guides.x.map((gx, i) => (
        <div
          key={`gx-${i}`}
          className="scripture-canvas-guide scripture-canvas-guide-v"
          style={{
            left: dragParentRect.left + gx,
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
            top: dragParentRect.top + gy,
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
          isSelected && 'scripture-selected',
          isDragOver && 'is-drag-over'
        )}
        style={{ ...frameStyle(node), ...canvasPositionStyle, ...sizeOverride }}
        onClick={(e) => {
          e.stopPropagation()
          onSelect(node.id, e.shiftKey)
        }}
        {...dragTargetHandlers}
      >
        {!isRoot && !livePosition && !liveSize && (
          <NodeControls id={node.id} onMove={onMove} onRemove={onRemove} gripHandlers={gripHandlers} />
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
      {...dragTargetHandlers}
    >
      {!livePosition && !liveSize && (
        <NodeControls id={node.id} onMove={onMove} onRemove={onRemove} gripHandlers={gripHandlers} />
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
          language={node.language}
          theme={node.theme}
          fontFamily={node.fontFamily}
          filename={node.filename}
          chromeStyle={node.chromeStyle}
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
