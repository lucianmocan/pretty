'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ContextMenu as ContextMenuPrimitive, DropdownMenu as DropdownMenuPrimitive } from 'radix-ui'
import { GripVertical, ChevronUp, ChevronDown, Copy, LocateFixed, MoreHorizontal, Trash2 } from 'lucide-react'
import type { ChildLayout, LayoutNode } from '@/lib/layout/types'
import { frameOuterStyle, frameInnerStyle, outerBoxStyle, contentOverflowStyle } from '@/lib/layout/frame-style'
import { snapPosition } from '@/lib/layout/canvas-snap'
import { BlockEditor } from '@/components/editor/block-editor'
import { getYDoc } from '@/lib/yjs/doc-store'
import {
  ROOT_ID,
  updateCallout,
  removeCallout,
  updateCodeProps,
  updateImageProps,
  type GutterClickMode,
} from '@/lib/yjs/layout-store'
import {
  resolveThemeBackground,
  resolveThemeLineNumberForeground,
} from '@/lib/presets/custom-syntax-themes'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ResizeHandles } from './resize-handles'
import { Callout } from './callout'
import { ImageBlock } from './image-block'
import { baseFileName } from '@/lib/images/client'
import type { PositionPatch, SizePatch } from '@/lib/layout/resize-geometry'
import type { PageNumberSettings } from '@/lib/documents/manifest'
import { CanvasPageNumber } from '@/components/canvas/canvas-page-number'
import { useGeometryActions } from './geometry-registry'
import type { ImageEffectPreview } from '@/lib/layout/image-effects'
import { MIN_CANVAS_ZOOM } from '@/lib/layout/canvas-zoom'

interface FrameNodeProps {
  node: LayoutNode
  docId: string
  selectedIds: string[]
  onSelect: (id: string, additive: boolean) => void
  onSelectionChange: (ids: string[]) => void
  onMove: (id: string, direction: 'up' | 'down') => void
  onDuplicate: (id: string) => void
  onRemove: (id: string) => void
  onReorder: (draggedId: string, targetId: string) => void
  onResizeNode: (id: string, size: SizePatch, position?: PositionPatch) => void
  // Partial -- a resize-driven reposition only ever touches the axis
  // actually being dragged (see ResizeHandlesProps.onResize); a move-drag
  // always passes both.
  onRepositionNode: (id: string, position: { x?: number; y?: number }) => void
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
  parentId?: string | null
  onAddBlockToFrame: (frameId: string, kind: 'code' | 'text' | 'image') => void
  // A PDF was picked/dropped for an image node -- opens the page-picker
  // dialog instead of uploading directly (see PdfPagePickerDialog).
  onRequestPdfPicker: (frameId: string, nodeId: string, file: File) => void
  // OS files (not an internal DRAG_MIME reorder payload) dropped onto this
  // frame -- images upload directly, PDFs go through onRequestPdfPicker.
  onDropFiles: (frameId: string, files: File[]) => void
  pageNumber?: { number: number; settings: PageNumberSettings }
  imageEffectPreview?: ImageEffectPreview | null
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
const MOVE_DRAG_THRESHOLD = 3
const SNAP_THRESHOLD_PX = 6

function suppressNextClick() {
  const suppress = (event: MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    window.removeEventListener('click', suppress, true)
  }
  window.addEventListener('click', suppress, true)
  setTimeout(() => window.removeEventListener('click', suppress, true), 0)
}

interface GripHandlers {
  draggable?: boolean
  onDragStart?: (e: React.DragEvent) => void
  onPointerDown?: (e: React.PointerEvent) => void
}

interface ClipStrip {
  top: number
  left: number
  width: number
  height: number
}

interface AnchorGeometry {
  rect: DOMRect
  // True once the anchor's own box no longer overlaps its immediate DOM
  // parent's box at all -- i.e. it's not just clipped at an edge, it's
  // entirely outside the region its parent's overflow:hidden paints/hit-
  // tests. Meaningless (always false) for anything not canvas-positioned,
  // since flex/root nodes never leave their parent's box.
  isOutsideParent: boolean
  // True if ANY part of the box falls outside the parent -- a partially
  // clipped block still has this true even though isOutsideParent is false.
  isClipped: boolean
  // The parts of `rect` that fall outside the parent's box, as up to four
  // rectangular strips (top/bottom/left/right overhang; corners can appear
  // in two strips at once, which is harmless -- both just start the same
  // drag). Each strip only covers area the parent's overflow:hidden never
  // paints, so it can never overlap real on-screen content underneath.
  clipStrips: ClipStrip[]
}

/** Tracks an anchor element's live viewport rect and clipping state relative
 * to its immediate DOM parent (see AnchorGeometry), for chrome that's
 * portaled to document.body (so it renders outside any ancestor's overflow
 * clip) but still needs to sit exactly on top of the element it belongs to. */
function useAnchorGeometry(
  anchorRef: React.RefObject<HTMLElement | null>,
  visible: boolean,
  zoom: number
) {
  const [geometry, setGeometry] = useState<AnchorGeometry | null>(null)

  useLayoutEffect(() => {
    if (!visible) return
    const anchor = anchorRef.current
    if (!anchor) return

    const update = () => {
      const rect = anchor.getBoundingClientRect()
      const parentRect = anchor.parentElement?.getBoundingClientRect()
      if (!parentRect) {
        setGeometry({ rect, isOutsideParent: false, isClipped: false, clipStrips: [] })
        return
      }
      const isOutsideParent =
        rect.right <= parentRect.left ||
        rect.left >= parentRect.right ||
        rect.bottom <= parentRect.top ||
        rect.top >= parentRect.bottom

      const clipStrips: ClipStrip[] = []
      if (rect.top < parentRect.top) {
        clipStrips.push({
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: Math.min(rect.bottom, parentRect.top) - rect.top,
        })
      }
      if (rect.bottom > parentRect.bottom) {
        const top = Math.max(rect.top, parentRect.bottom)
        clipStrips.push({ top, left: rect.left, width: rect.width, height: rect.bottom - top })
      }
      if (rect.left < parentRect.left) {
        clipStrips.push({
          top: rect.top,
          left: rect.left,
          width: Math.min(rect.right, parentRect.left) - rect.left,
          height: rect.height,
        })
      }
      if (rect.right > parentRect.right) {
        const left = Math.max(rect.left, parentRect.right)
        clipStrips.push({ top: rect.top, left, width: rect.right - left, height: rect.height })
      }

      setGeometry({ rect, isOutsideParent, isClipped: clipStrips.length > 0, clipStrips })
    }
    update()
    window.addEventListener('resize', update)
    // Capture is intentional: scroll events do not bubble, and the clipping
    // frame can be any ancestor in a recursively nested layout tree.
    window.addEventListener('scroll', update, true)
    const observer = new ResizeObserver(update)
    observer.observe(anchor)
    const mutationObserver = new MutationObserver(update)
    mutationObserver.observe(anchor, { attributes: true, attributeFilter: ['class', 'style'] })
    // Canvas zoom changes the viewport ancestor's transform without changing
    // the anchor's layout box, so neither ResizeObserver nor the anchor's own
    // MutationObserver fires. Track that transform explicitly so portaled
    // selection chrome stays on the node while zooming.
    const canvasViewport = anchor.closest('.scripture-canvas-viewport')
    const viewportMutationObserver = canvasViewport ? new MutationObserver(update) : null
    if (canvasViewport && viewportMutationObserver) {
      viewportMutationObserver.observe(canvasViewport, {
        attributes: true,
        attributeFilter: ['style'],
      })
    }
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
      observer.disconnect()
      mutationObserver.disconnect()
      viewportMutationObserver?.disconnect()
    }
  }, [anchorRef, visible, zoom])

  return geometry
}

/** A selected block's own ::after outline (see .scripture-selected::after in
 * globals.css) is clipped along with everything else once part of a canvas-
 * mode block crosses its parent's overflow:hidden edge -- content should
 * disappear there, but the selection border is how you see where the block
 * went so you can drag it back. Portaling a lookalike border to document.body
 * escapes that clip entirely; it just overlaps the real one pixel-for-pixel
 * whenever the block is still fully on-screen.
 *
 * The clipped-away part of the block also stops receiving pointer events --
 * clipped content isn't hit-tested, only painted-away -- so dragging
 * directly on the block only works through whatever sliver is still inside
 * the parent, which is exactly the "why can I only drag the visible part"
 * problem. `clipStrips` are laid over precisely the invisible part (never
 * the visible part, so this never steals clicks meant for the block's own
 * content -- double-click-to-edit, image upload, buttons in callouts) and
 * forward to the same onStartDrag used for normal in-bounds dragging, so
 * grabbing anywhere the block "would be," visible or not, moves it. */
function SelectionOutline({
  anchorRef,
  visible,
  zoom,
  onStartDrag,
}: {
  anchorRef: React.RefObject<HTMLElement | null>
  visible: boolean
  zoom: number
  onStartDrag?: (e: React.PointerEvent) => void
}) {
  const geometry = useAnchorGeometry(anchorRef, visible, zoom)
  if (!visible || !geometry) return null
  const { rect, isClipped, clipStrips } = geometry

  return createPortal(
    <>
      {isClipped && (
        <div
          className="scripture-selection-outline is-clipped"
          style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
        />
      )}
      {onStartDrag &&
        clipStrips.map((strip, index) => (
          <div
            key={index}
            className="scripture-selection-outline-grab"
            style={{ top: strip.top, left: strip.left, width: strip.width, height: strip.height }}
            onPointerDown={onStartDrag}
          />
        ))}
    </>,
    document.body
  )
}

function NodeControls({
  id,
  anchorRef,
  visible,
  zoom,
  onMove,
  onDuplicate,
  onRemove,
  gripHandlers,
  showGrip,
  showReorderActions,
  onBringIntoView,
}: {
  id: string
  anchorRef: React.RefObject<HTMLElement | null>
  visible: boolean
  zoom: number
  onMove: (id: string, direction: 'up' | 'down') => void
  onDuplicate: (id: string) => void
  onRemove: (id: string) => void
  gripHandlers: GripHandlers
  // false for canvas-mode nodes -- dragging works directly on the block
  // itself there (see beginMoveDrag wired to the block's own onPointerDown),
  // so a separate grip handle would be redundant chrome. Still shown for
  // flex-mode nodes, where the grip is what starts native drag-and-drop
  // reordering (a different interaction, not a position drag).
  showGrip: boolean
  showReorderActions: boolean
  // Only provided for canvas-mode blocks; the menu item that calls it is
  // only shown once this same geometry check finds part of the block outside
  // its parent's box (see AnchorGeometry / useAnchorGeometry above).
  onBringIntoView?: () => void
}) {
  const geometry = useAnchorGeometry(anchorRef, visible, zoom)

  if (!visible || !geometry) return null
  const { rect, isClipped } = geometry

  const toolbarLeft = Math.max(72, Math.min(window.innerWidth - 72, rect.left + rect.width / 2))
  const preferredTop = rect.top >= 42 ? rect.top - 34 : rect.bottom + 6
  const toolbarTop = Math.max(8, Math.min(window.innerHeight - 38, preferredTop))

  return createPortal(
    <div
      className="scripture-node-controls"
      style={{
        top: toolbarTop,
        left: toolbarLeft,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {showGrip && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Drag to move"
              draggable={gripHandlers.draggable}
              onPointerDown={gripHandlers.onPointerDown}
              onDragStart={gripHandlers.onDragStart}
            >
              <GripVertical />
            </Button>
          </TooltipTrigger>
          <TooltipContent className="z-40">Drag to move</TooltipContent>
        </Tooltip>
      )}
      {showReorderActions && (
        <>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-xs" onClick={() => onMove(id, 'up')} aria-label="Move up">
                <ChevronUp />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="z-40">Move up</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-xs" onClick={() => onMove(id, 'down')} aria-label="Move down">
                <ChevronDown />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="z-40">Move down</TooltipContent>
          </Tooltip>
        </>
      )}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon-xs" onClick={() => onDuplicate(id)} aria-label="Duplicate">
            <Copy />
          </Button>
        </TooltipTrigger>
        <TooltipContent className="z-40">Duplicate</TooltipContent>
      </Tooltip>
      <DropdownMenuPrimitive.Root>
        <DropdownMenuPrimitive.Trigger asChild>
          <Button variant="ghost" size="icon-xs" aria-label="More actions" title="More actions">
            <MoreHorizontal />
          </Button>
        </DropdownMenuPrimitive.Trigger>
        <DropdownMenuPrimitive.Portal>
          <DropdownMenuPrimitive.Content
            className="scripture-node-menu is-compact"
            align="end"
            sideOffset={5}
            collisionPadding={8}
          >
            {onBringIntoView && isClipped && (
              <DropdownMenuPrimitive.Item className="scripture-node-menu-item" onSelect={onBringIntoView}>
                <LocateFixed />
                Bring into view
              </DropdownMenuPrimitive.Item>
            )}
            <DropdownMenuPrimitive.Item
              className="scripture-node-menu-item is-destructive"
              onSelect={() => onRemove(id)}
            >
              <Trash2 />
              Delete
            </DropdownMenuPrimitive.Item>
          </DropdownMenuPrimitive.Content>
        </DropdownMenuPrimitive.Portal>
      </DropdownMenuPrimitive.Root>
    </div>,
    document.body
  )
}

function NodeContextActions({
  children,
  enabled,
  onOpen,
  onDuplicate,
  onRemove,
}: {
  children: React.ReactElement
  enabled: boolean
  onOpen: () => void
  onDuplicate: () => void
  onRemove: () => void
}) {
  if (!enabled) return children
  return (
    <ContextMenuPrimitive.Root onOpenChange={(open) => open && onOpen()}>
      <ContextMenuPrimitive.Trigger asChild>{children}</ContextMenuPrimitive.Trigger>
      <ContextMenuPrimitive.Portal>
        <ContextMenuPrimitive.Content className="scripture-node-menu">
          <ContextMenuPrimitive.Item className="scripture-node-menu-item" onSelect={onDuplicate}>
            <Copy />
            Duplicate
            <span className="scripture-node-menu-shortcut">⌘D</span>
          </ContextMenuPrimitive.Item>
          <ContextMenuPrimitive.Separator className="scripture-node-menu-separator" />
          <ContextMenuPrimitive.Item
            className="scripture-node-menu-item is-destructive"
            onSelect={onRemove}
          >
            <Trash2 />
            Delete layer
            <span className="scripture-node-menu-shortcut">⌫</span>
          </ContextMenuPrimitive.Item>
        </ContextMenuPrimitive.Content>
      </ContextMenuPrimitive.Portal>
    </ContextMenuPrimitive.Root>
  )
}

/**
 * Recursive interactive renderer for the layout tree -- selection controls,
 * context actions, drag-and-drop reordering, resize handles, and canvas-mode
 * positioning all live here. The print route walks the same tree shape
 * separately (it has no interactivity) using the unified frameStyle()/
 * sizeStyle() on a single div; this component instead splits that into an
 * outer position-hosting box (frameOuterStyle/outerBoxStyle) and an inner
 * content wrapper that owns flex layout + scroll/clip
 * (frameInnerStyle/contentOverflowStyle) -- see those functions' doc
 * comments in lib/layout/frame-style.ts for why. The static export renderer
 * mirrors the same outer/inner structure so its positioning cannot diverge.
 */
export function FrameNode({
  node,
  docId,
  selectedIds,
  onSelect,
  onSelectionChange,
  onMove,
  onDuplicate,
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
  parentId = null,
  onAddBlockToFrame,
  onRequestPdfPicker,
  onDropFiles,
  pageNumber,
  imageEffectPreview,
}: FrameNodeProps) {
  const isRoot = node.id === ROOT_ID
  const resolvedCodeBackground = node.kind === 'code' ? resolveThemeBackground(node.theme) : undefined
  const resolvedLineNumberForeground =
    node.kind === 'code' ? resolveThemeLineNumberForeground(node.theme) : undefined
  const nodeChildLayout = node.kind === 'frame' ? (node.childLayout ?? 'flex') : 'flex'
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
  const [liveSize, setLiveSize] = useState<SizePatch | null>(null)
  // Resize-driven updates are partial (only the axis actually being
  // dragged, see ResizeHandlesProps.onResize) -- move-drag always sets both.
  const [livePosition, setLivePosition] = useState<PositionPatch | null>(null)
  const [guides, setGuides] = useState<{ x: number[]; y: number[] } | null>(null)
  const [dragParentGeometry, setDragParentGeometry] = useState<{
    rect: DOMRect
    scrollLeft: number
    scrollTop: number
  } | null>(null)
  const [marquee, setMarquee] = useState<{ x: number; y: number; width: number; height: number } | null>(null)
  const elementRef = useRef<HTMLDivElement>(null)

  // Persist resolved theme chrome on the block so custom themes survive the
  // server-rendered print/export path, which cannot read browser-local theme
  // definitions. This also backfills existing blocks created before these
  // values were stored with each block.
  useEffect(() => {
    if (node.kind !== 'code') return
    const patch = {
      ...(node.themeBackground !== resolvedCodeBackground && {
        themeBackground: resolvedCodeBackground,
      }),
      ...(node.themeLineNumberForeground !== resolvedLineNumberForeground && {
        themeLineNumberForeground: resolvedLineNumberForeground,
      }),
    }
    if (Object.keys(patch).length > 0) updateCodeProps(getYDoc(docId).doc, node.id, patch)
  }, [
    docId,
    node.id,
    node.kind,
    node.themeBackground,
    node.themeLineNumberForeground,
    resolvedCodeBackground,
    resolvedLineNumberForeground,
  ])

  const contentRef = useRef<HTMLDivElement>(null)
  const renderedNode = liveSize ? { ...node, ...liveSize } : node
  const previewedImageEffects = imageEffectPreview?.nodeId === node.id
    ? imageEffectPreview.effects
    : undefined
  // Holds the currently active move-drag's own cleanup, if any -- an unmount
  // mid-drag (deleting this node, e.g. via Delete/Backspace, or switching
  // pages while still holding it) would otherwise leave the window-level
  // pointermove/pointerup listeners attached forever, later calling
  // onRepositionNode against a stale node id/closure.
  const activeDragCleanupRef = useRef<(() => void) | null>(null)
  const activeMarqueeCleanupRef = useRef<(() => void) | null>(null)
  const { observe: observeGeometry } = useGeometryActions()
  const handleCodeLineClick = useCallback(
    (lineNumber: number) => onGutterClick(node.id, lineNumber),
    [node.id, onGutterClick]
  )

  useEffect(() => {
    return () => {
      activeDragCleanupRef.current?.()
      activeMarqueeCleanupRef.current?.()
    }
  }, [])

  useEffect(() => {
    const element = elementRef.current
    if (!element) return
    return observeGeometry(node.id, parentId, element, element.parentElement, zoom)
  }, [
    node.id,
    parentId,
    zoom,
    node.x,
    node.y,
    node.width,
    node.height,
    observeGeometry,
  ])

  const isAutoWidth = renderedNode.width == null
  const isAutoHeight = renderedNode.height == null
  const showSelectionControls = isOnlySelected && editingId !== node.id && !livePosition && !liveSize

  const canvasPositionStyle: React.CSSProperties | undefined =
    !isRoot && parentChildLayout === 'canvas'
      ? {
          position: 'absolute',
          // Absolutely positioned auto-width boxes otherwise use CSS's
          // shrink-to-fit algorithm, whose available width decreases as
          // `left` approaches the parent's right edge. Images then honor
          // their own max-width: 100% and visibly shrink during a move drag.
          // Keep intrinsic width independent of position; an explicit or
          // live resize still wins through outerBoxStyle(renderedNode).
          ...(isAutoWidth && { width: 'max-content', maxWidth: 'none' }),
          // Per-axis fallback to the node's own stored value -- NOT to a
          // freshly re-measured DOM rect -- so a resize that only touches
          // one axis (e.g. dragging the w handle) never nudges the other.
          left: (livePosition?.x ?? node.x) ?? 0,
          top: (livePosition?.y ?? node.y) ?? 0,
        }
      : undefined

  // The root frame's manual width/height only ever affects the export while
  // Page size is Content-sized -- the fixed formats (A4/Letter/Custom) force
  // their own paper dimensions regardless (see app/api/export/route.ts), so
  // dragging the root otherwise would visibly resize the on-screen card for
  // no actual effect. Matches the Size section's own gating in
  // inspector-panel.tsx.
  const rootResizeDisabled = isRoot && (node.pageSize ?? 'content') !== 'content'
  const resizeHandles = isOnlySelected && !rootResizeDisabled && (
    <ResizeHandles
      targetRef={elementRef}
      onResize={(size, position) => {
        setLiveSize(size)
        if (position) setLivePosition(position)
      }}
      onCommit={(size, position) => {
        suppressNextClick()
        setLiveSize(null)
        setLivePosition(null)
        onResizeNode(node.id, size, position)
      }}
      onCancel={() => {
        setLiveSize(null)
        setLivePosition(null)
      }}
      zoom={zoom}
      position={isCanvasChild ? { x: node.x ?? 0, y: node.y ?? 0 } : undefined}
      preserveAspectRatio={
        node.kind === 'image' && Boolean(node.src) && (node.aspectRatioLocked ?? true)
      }
    />
  )

  // Also passed to SelectionOutline as its drag handle: once a canvas-mode
  // block is entirely outside its parent's box, the block itself stops
  // receiving pointer events there (clipped-away content isn't hit-tested),
  // so the portaled outline is the only thing left to grab. Its target is
  // never inside a button/input, so the guard below never fires for it.
  function beginMoveDrag(e: React.PointerEvent) {
    if (!e.isPrimary || e.button !== 0 || activeDragCleanupRef.current) return
    if ((e.target as HTMLElement).closest('button, input, textarea, select, a, [data-node-drag-ignore]')) return
    e.stopPropagation()
    e.preventDefault()
    const el = elementRef.current
    const parentEl = el?.parentElement
    if (!el || !parentEl) return

    const parentRect = parentEl.getBoundingClientRect()
    const startWidth = el.getBoundingClientRect().width / zoom
    const startHeight = el.getBoundingClientRect().height / zoom
    const startX = node.x ?? 0
    const startY = node.y ?? 0
    const startClientX = e.clientX
    const startClientY = e.clientY
    const pointerId = e.pointerId
    const startScrollLeft = parentEl.scrollLeft
    const startScrollTop = parentEl.scrollTop
    let moved = false
    let selectionApplied = false

    const siblingEls = Array.from(parentEl.querySelectorAll<HTMLElement>(':scope > [data-node-id]')).filter(
      (sib) => sib !== el
    )
    const siblings = siblingEls.map((sib) => {
      const r = sib.getBoundingClientRect()
      return {
        x: (r.left - parentRect.left) / zoom + startScrollLeft,
        y: (r.top - parentRect.top) / zoom + startScrollTop,
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
    const containerSize = { width: parentEl.clientWidth, height: parentEl.clientHeight }

    const updateDragGeometry = () => {
      if (!moved) return
      setDragParentGeometry({
        rect: parentEl.getBoundingClientRect(),
        scrollLeft: parentEl.scrollLeft,
        scrollTop: parentEl.scrollTop,
      })
    }

    const compute = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return null
      // Include scroll accumulated during the gesture so the same content
      // point remains under the pointer if any canvas ancestor is scrolled.
      const dx = (ev.clientX - startClientX) / zoom + (parentEl.scrollLeft - startScrollLeft)
      const dy = (ev.clientY - startClientY) / zoom + (parentEl.scrollTop - startScrollTop)
      return snapPosition(
        { x: startX + dx, y: startY + dy, width: startWidth, height: startHeight },
        siblings,
        containerSize,
        SNAP_THRESHOLD_PX / Math.max(zoom, MIN_CANVAS_ZOOM)
      )
    }

    const onMovePointer = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return
      if (!moved && Math.hypot(ev.clientX - startClientX, ev.clientY - startClientY) < MOVE_DRAG_THRESHOLD) return
      if (!moved) {
        moved = true
        document.documentElement.dataset.scriptureMoving = 'true'
        updateDragGeometry()
      }
      if (!selectionApplied && !isSelected) {
        selectionApplied = true
        onSelect(node.id, e.shiftKey)
      }
      ev.preventDefault()
      const snapped = compute(ev)
      if (!snapped) return
      setLivePosition({ x: snapped.x, y: snapped.y })
      setGuides(snapped.guides)
    }
    const onUpPointer = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return
      const snapped = moved ? compute(ev) : null
      cleanup()
      setLivePosition(null)
      setGuides(null)
      setDragParentGeometry(null)
      if (snapped) {
        suppressNextClick()
        onRepositionNode(node.id, { x: snapped.x, y: snapped.y })
      }
    }
    const cancel = () => {
      cleanup()
      setLivePosition(null)
      setGuides(null)
      setDragParentGeometry(null)
    }
    const onPointerCancel = (ev: PointerEvent) => {
      if (ev.pointerId === pointerId) cancel()
    }
    const onWindowBlur = () => cancel()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      cancel()
    }
    function cleanup() {
      window.removeEventListener('pointermove', onMovePointer)
      window.removeEventListener('pointerup', onUpPointer)
      window.removeEventListener('pointercancel', onPointerCancel)
      window.removeEventListener('blur', onWindowBlur)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('resize', updateDragGeometry)
      window.removeEventListener('scroll', updateDragGeometry, true)
      delete document.documentElement.dataset.scriptureMoving
      activeDragCleanupRef.current = null
    }
    activeDragCleanupRef.current = cleanup
    window.addEventListener('pointermove', onMovePointer, { passive: false })
    window.addEventListener('pointerup', onUpPointer)
    window.addEventListener('pointercancel', onPointerCancel)
    window.addEventListener('blur', onWindowBlur)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('resize', updateDragGeometry)
    window.addEventListener('scroll', updateDragGeometry, true)
  }

  function beginMarquee(e: React.PointerEvent<HTMLDivElement>) {
    if (
      nodeChildLayout !== 'canvas' ||
      e.target !== e.currentTarget ||
      !e.isPrimary ||
      e.button !== 0 ||
      activeMarqueeCleanupRef.current
    ) {
      return
    }
    e.stopPropagation()
    const container = e.currentTarget
    const pointerId = e.pointerId
    const rect = container.getBoundingClientRect()
    const startScrollLeft = container.scrollLeft
    const startScrollTop = container.scrollTop
    const start = {
      x: (e.clientX - rect.left) / zoom + startScrollLeft,
      y: (e.clientY - rect.top) / zoom + startScrollTop,
    }
    let moved = false

    const point = (event: PointerEvent) => {
      const currentRect = container.getBoundingClientRect()
      return {
        x: (event.clientX - currentRect.left) / zoom + container.scrollLeft,
        y: (event.clientY - currentRect.top) / zoom + container.scrollTop,
      }
    }
    const boxFor = (event: PointerEvent) => {
      const current = point(event)
      return {
        x: Math.min(start.x, current.x),
        y: Math.min(start.y, current.y),
        width: Math.abs(current.x - start.x),
        height: Math.abs(current.y - start.y),
      }
    }
    const onMove = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return
      const box = boxFor(event)
      if (!moved && Math.hypot(box.width, box.height) < MOVE_DRAG_THRESHOLD) return
      moved = true
      event.preventDefault()
      setMarquee(box)
    }
    const finish = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return
      const box = moved ? boxFor(event) : null
      cleanup()
      setMarquee(null)
      if (!box) {
        onSelectionChange([node.id])
        return
      }
      suppressNextClick()
      const selected = Array.from(container.querySelectorAll<HTMLElement>(':scope > [data-node-id]'))
        .filter((child) => {
          const currentRect = container.getBoundingClientRect()
          const childRect = child.getBoundingClientRect()
          const childBox = {
            x: (childRect.left - currentRect.left) / zoom + container.scrollLeft,
            y: (childRect.top - currentRect.top) / zoom + container.scrollTop,
            width: childRect.width / zoom,
            height: childRect.height / zoom,
          }
          return (
            childBox.x < box.x + box.width &&
            childBox.x + childBox.width > box.x &&
            childBox.y < box.y + box.height &&
            childBox.y + childBox.height > box.y
          )
        })
        .map((child) => child.dataset.nodeId)
        .filter((id): id is string => Boolean(id))
      onSelectionChange(selected.length > 0 ? selected : [node.id])
    }
    const cancel = () => {
      cleanup()
      setMarquee(null)
    }
    const onCancel = (event: PointerEvent) => {
      if (event.pointerId === pointerId) cancel()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') cancel()
    }
    function cleanup() {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', onCancel)
      window.removeEventListener('blur', cancel)
      window.removeEventListener('keydown', onKeyDown)
      activeMarqueeCleanupRef.current = null
    }
    activeMarqueeCleanupRef.current = cleanup
    window.addEventListener('pointermove', onMove, { passive: false })
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', onCancel)
    window.addEventListener('blur', cancel)
    window.addEventListener('keydown', onKeyDown)
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
  const showReorderActions = parentChildLayout !== 'canvas'

  // Resets a canvas-mode block's stored x/y to the nearest position fully
  // inside its parent's box -- the on-demand version of the boundary clamp
  // snapPosition used to always enforce (see canvas-snap.ts's doc comment).
  // Only meaningful once dragging is free to leave that box.
  function bringIntoView() {
    const el = elementRef.current
    const parentEl = el?.parentElement
    if (!el || !parentEl) return
    const width = el.getBoundingClientRect().width / zoom
    const height = el.getBoundingClientRect().height / zoom
    const maxX = Math.max(0, parentEl.clientWidth - width)
    const maxY = Math.max(0, parentEl.clientHeight - height)
    const x = Math.min(Math.max(0, node.x ?? 0), maxX)
    const y = Math.min(Math.max(0, node.y ?? 0), maxY)
    onRepositionNode(node.id, { x, y })
  }

  function enterTextEditing(e: React.MouseEvent) {
    e.stopPropagation()
    onSelect(node.id, false)
    onSetEditing(node.id)
  }

  function handleLeafClick(e: React.MouseEvent) {
    e.stopPropagation()
    onSelect(node.id, e.shiftKey)

    // PointerEvent.detail is consistently 0 for pointerdown in browsers, so
    // it cannot identify the second press of a double-click. The bubbling
    // click is attached to this stable leaf instead: even when a theme
    // re-highlight replaces token spans between presses, click.detail still
    // reaches 2 here and enters edit mode before a target-sensitive dblclick
    // can be lost.
    if (needsEditGate && e.detail >= 2) onSetEditing(node.id)
  }

  // A CSS transform creates a containing block for position:fixed children.
  // Since the entire canvas is transformed for zoom, these must be portaled
  // to body or their viewport coordinates get offset/scaled a second time.
  const guideOverlay =
    guides &&
    dragParentGeometry &&
    createPortal(
      <>
        {guides.x.map((gx, i) => (
          <div
            key={`gx-${i}`}
            className="scripture-canvas-guide scripture-canvas-guide-v"
            style={{
              left: dragParentGeometry.rect.left + (gx - dragParentGeometry.scrollLeft) * zoom,
              top: dragParentGeometry.rect.top,
              height: dragParentGeometry.rect.height,
            }}
          />
        ))}
        {guides.y.map((gy, i) => (
          <div
            key={`gy-${i}`}
            className="scripture-canvas-guide scripture-canvas-guide-h"
            style={{
              top: dragParentGeometry.rect.top + (gy - dragParentGeometry.scrollTop) * zoom,
              left: dragParentGeometry.rect.left,
              width: dragParentGeometry.rect.width,
            }}
          />
        ))}
      </>,
      document.body
    )

  // Where an OS file dropped on THIS node's own box should land -- itself,
  // if it's a frame, otherwise its containing frame (dropping a file onto
  // an existing text/code/image block still inserts into that block's
  // parent, not "into" the block).
  const dropTargetFrameId = node.kind === 'frame' ? node.id : parentId ?? ROOT_ID

  const dragTargetHandlers = {
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
      if (draggedId && !isRoot) {
        onReorder(draggedId, node.id)
        return
      }
      const files = Array.from(e.dataTransfer.files ?? [])
      if (files.length > 0) onDropFiles(dropTargetFrameId, files)
    },
  }

  if (node.kind === 'frame') {
    const children = node.children ?? []
    const childLayout = node.childLayout ?? 'flex'
    const frameElement = (
      <div
        ref={elementRef}
        data-node-id={node.id}
        className={classNames(
          'scripture-frame',
          isRoot && 'scripture-card',
          childLayout === 'canvas' && 'scripture-frame-canvas',
          isAutoWidth && 'scripture-auto-width',
          isAutoHeight && 'scripture-auto-height',
          isSelected && 'scripture-selected',
          isDragOver && 'is-drag-over'
        )}
        style={{ ...frameOuterStyle(renderedNode), ...canvasPositionStyle }}
        onClick={(e) => {
          e.stopPropagation()
          onSelect(node.id, e.shiftKey)
        }}
        onPointerDown={!isRoot && parentChildLayout === 'canvas' ? beginMoveDrag : undefined}
        {...dragTargetHandlers}
      >
        {!isRoot && (
          <>
            <NodeControls
              id={node.id}
              anchorRef={elementRef}
              visible={showSelectionControls}
              zoom={zoom}
              onMove={onMove}
              onDuplicate={onDuplicate}
              onRemove={onRemove}
              gripHandlers={gripHandlers}
              showGrip={showGrip}
              showReorderActions={showReorderActions}
              onBringIntoView={isCanvasChild ? bringIntoView : undefined}
            />
            <SelectionOutline
              anchorRef={elementRef}
              visible={isSelected}
              zoom={zoom}
              onStartDrag={isCanvasChild ? beginMoveDrag : undefined}
            />
          </>
        )}
        {/* Flex layout + scroll/clip live on this INNER wrapper, not the
            outer box above -- see frameInnerStyle's doc comment for why:
            NodeControls/resizeHandles/callouts below must never be clipped
            by this frame's own overflow once it has an explicit size. */}
        <div
          ref={contentRef}
          className={classNames(
            'scripture-frame-content',
            isRoot && 'scripture-page-number-host'
          )}
          style={frameInnerStyle(renderedNode)}
          onPointerDown={beginMarquee}
        >
          {children.length === 0 && (
            <div className="scripture-empty-frame">
              <span>{isRoot ? 'Start your document with a code block.' : 'This frame is empty.'}</span>
              <Button
                size="sm"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation()
                  onAddBlockToFrame(node.id, 'code')
                }}
              >
                Add code block
              </Button>
            </div>
          )}
          {children.map((child) => (
            <FrameNode
              key={child.id}
              node={child}
              docId={docId}
              selectedIds={selectedIds}
              onSelect={onSelect}
              onSelectionChange={onSelectionChange}
              onMove={onMove}
              onDuplicate={onDuplicate}
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
              parentId={node.id}
              onAddBlockToFrame={onAddBlockToFrame}
              onRequestPdfPicker={onRequestPdfPicker}
              onDropFiles={onDropFiles}
              imageEffectPreview={imageEffectPreview}
            />
          ))}
          {marquee && (
            <div
              className="scripture-selection-marquee"
              style={{
                left: marquee.x,
                top: marquee.y,
                width: marquee.width,
                height: marquee.height,
              }}
            />
          )}
          {isRoot && pageNumber && (
            <CanvasPageNumber number={pageNumber.number} settings={pageNumber.settings} />
          )}
        </div>
        {(node.callouts ?? []).map((callout) => (
          <Callout
            key={callout.id}
            docId={docId}
            frameId={node.id}
            callout={callout}
            onChange={(patch) => updateCallout(getYDoc(docId).doc, node.id, callout.id, patch)}
            onRemove={() => removeCallout(getYDoc(docId).doc, node.id, callout.id)}
            zoom={zoom}
          />
        ))}
        {resizeHandles}
        {guideOverlay}
      </div>
    )
    if (isRoot) return frameElement
    return (
      <NodeContextActions
        enabled={editingId !== node.id}
        onOpen={() => onSelect(node.id, false)}
        onDuplicate={() => onDuplicate(node.id)}
        onRemove={() => onRemove(node.id)}
      >
        {frameElement}
      </NodeContextActions>
    )
  }

  const leafElement = (
    <div
      ref={elementRef}
      data-node-id={node.id}
      className={classNames(
        'scripture-leaf',
        node.kind === 'code' && 'scripture-code-leaf',
        isEditing && 'scripture-editing',
        isAutoWidth && 'scripture-auto-width',
        isAutoHeight && 'scripture-auto-height',
        isSelected && 'scripture-selected',
        isDragOver && 'is-drag-over'
      )}
      style={{
        ...outerBoxStyle(renderedNode),
        ...(resolvedCodeBackground && { background: resolvedCodeBackground }),
        ...canvasPositionStyle,
      }}
      onClick={handleLeafClick}
      onDoubleClick={needsEditGate ? enterTextEditing : undefined}
      onPointerDown={canDragViaBody ? beginMoveDrag : undefined}
      {...dragTargetHandlers}
    >
      <NodeControls
        id={node.id}
        anchorRef={elementRef}
        visible={showSelectionControls}
        zoom={zoom}
        onMove={onMove}
        onDuplicate={onDuplicate}
        onRemove={onRemove}
        gripHandlers={gripHandlers}
        showGrip={showGrip}
        showReorderActions={showReorderActions}
        onBringIntoView={isCanvasChild ? bringIntoView : undefined}
      />
      <SelectionOutline
        anchorRef={elementRef}
        visible={isSelected}
        zoom={zoom}
        onStartDrag={isCanvasChild ? beginMoveDrag : undefined}
      />
      {/* Scroll/clip lives on this INNER wrapper, not the outer box above --
          see contentOverflowStyle's doc comment: NodeControls/resizeHandles
          below must never be clipped by this block's own overflow once it
          has an explicit size. */}
      <div ref={contentRef} className="scripture-leaf-content" style={contentOverflowStyle(renderedNode)}>
        {node.kind === 'image' ? (
          <ImageBlock
            src={node.src ?? ''}
            alt={node.alt ?? ''}
            radius={node.radius ?? 0}
            clipShape={node.clipShape ?? 'none'}
            cropX={node.cropX ?? 0}
            cropY={node.cropY ?? 0}
            cropWidth={node.cropWidth ?? 1}
            cropHeight={node.cropHeight ?? 1}
            intrinsicWidth={node.intrinsicWidth ?? 0}
            intrinsicHeight={node.intrinsicHeight ?? 0}
            frameWidth={renderedNode.width}
            frameHeight={renderedNode.height}
            aspectRatioLocked={node.aspectRatioLocked ?? true}
            opacity={previewedImageEffects?.opacity ?? node.opacity ?? 100}
            brightness={previewedImageEffects?.brightness ?? node.brightness ?? 100}
            contrast={previewedImageEffects?.contrast ?? node.contrast ?? 100}
            saturation={previewedImageEffects?.saturation ?? node.saturation ?? 100}
            hue={previewedImageEffects?.hue ?? node.hue ?? 0}
            grayscale={previewedImageEffects?.grayscale ?? node.grayscale ?? 0}
            blur={previewedImageEffects?.blur ?? node.blur ?? 0}
            onUploaded={(url, fileName) => {
              const name = baseFileName(fileName)
              updateImageProps(getYDoc(docId).doc, node.id, {
                src: url,
                alt: name,
                ...(!node.label?.trim() && { label: name }),
                cropX: 0,
                cropY: 0,
                cropWidth: 1,
                cropHeight: 1,
                intrinsicWidth: 0,
                intrinsicHeight: 0,
              })
            }}
            onPdfSelected={(file) => onRequestPdfPicker(parentId ?? ROOT_ID, node.id, file)}
          />
        ) : (
          <BlockEditor
            docId={docId}
            blockId={node.id}
            kind={node.kind}
            editable={isEditing}
            activeForFormatting={node.kind === 'text' && isSelected}
            focusOnMount={needsEditGate && isEditing}
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
            onLineClick={handleCodeLineClick}
            textFontFamily={node.textFontFamily}
            textFontSource={node.textFontSource}
            textFontWeight={node.textFontWeight}
            textFontStyle={node.textFontStyle}
            textFontSize={node.textFontSize}
            textLineHeight={node.textLineHeight}
            textLetterSpacing={node.textLetterSpacing}
            textColor={node.textColor}
          />
        )}
      </div>
      {resizeHandles}
      {guideOverlay}
    </div>
  )
  return (
    <NodeContextActions
      enabled={!isTextual || (needsEditGate && editingId !== node.id)}
      onOpen={() => onSelect(node.id, false)}
      onDuplicate={() => onDuplicate(node.id)}
      onRemove={() => onRemove(node.id)}
    >
      {leafElement}
    </NodeContextActions>
  )
}
