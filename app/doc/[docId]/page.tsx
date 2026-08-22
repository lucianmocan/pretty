'use client'

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
  type CSSProperties,
} from 'react'
import { useParams, useRouter } from 'next/navigation'
import { LoaderCircle, Plus } from 'lucide-react'
import { select } from 'd3-selection'
import { zoom as createZoom, zoomIdentity } from 'd3-zoom'
import { FrameNode } from '@/components/canvas/frame-node'
import { CanvasRoot } from '@/components/canvas/canvas-root'
import { InspectorPanel } from '@/components/canvas/inspector-panel'
import { ZoomControls } from '@/components/canvas/zoom-controls'
import { CanvasToolbar } from '@/components/canvas/canvas-toolbar'
import { preloadLayoutTree, useLayoutTree } from '@/lib/use-layout-tree'
import { getYDoc, getUndoManager } from '@/lib/yjs/doc-store'
import { BrowserExportSurfaces } from '@/components/export/browser-export-surfaces'
import { createBrowserExport, waitForExportSurfaces } from '@/lib/browser-export'
import { getExportPreferences } from '@/lib/app-preferences'
import {
  moveNode,
  duplicateNode,
  removeNode,
  moveNodeBeforeSibling,
  updateNodeGeometry,
  updateNodePosition,
  cycleGutterLine,
  addBlock,
  updateImageProps,
  seedRootFrame,
  toPlainTree,
  ROOT_ID,
  type GutterClickMode,
} from '@/lib/yjs/layout-store'
import type { PositionPatch, SizePatch } from '@/lib/layout/resize-geometry'
import {
  getDocumentMeta,
  renameDocument,
  touchDocument,
  getPageIds,
  getPageNames,
  getPageNumberSettings,
  setPageNumberSettings as persistPageNumberSettings,
  DEFAULT_PAGE_NUMBER_SETTINGS,
  type PageNumberSettings,
  addPage,
  renamePage,
  reorderPages,
} from '@/lib/documents/manifest'
import { AppMenubar } from '@/components/layout/app-menubar'
import { RouteLoadingScreen } from '@/components/layout/route-loading'
import { EditorRegistryProvider } from '@/components/editor/editor-registry'
import { CustomizeDialog } from '@/components/customize/customize-dialog'
import { LayersPanel } from '@/components/layout/layers-panel'
import { GeometryRegistryProvider } from '@/components/canvas/geometry-registry'
import { deletePage } from '@/lib/documents/delete-service'
import { duplicatePage } from '@/lib/documents/duplicate-page'
import { resolvePageNumber } from '@/lib/documents/page-numbers'
import { findNode, findParent } from '@/lib/layout/tree-utils'
import { deleteUploadedImage, uploadImageFile, isPdfFile, baseFileName } from '@/lib/images/client'
import { PdfPagePickerDialog, type PdfPickerRequest } from '@/components/canvas/pdf-page-picker-dialog'
import { TEMPLATES, type Template } from '@/lib/templates'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { NotificationChip } from '@/components/ui/notification-chip'
import {
  clearBackgroundRemovalState,
  useBackgroundRemovalOperations,
} from '@/lib/images/background-removal-state'
import type { ImageEffectPreview } from '@/lib/layout/image-effects'
import { calculateCanvasCentering } from '@/lib/layout/canvas-centering'
import { clampCanvasZoom, MAX_CANVAS_ZOOM, MIN_CANVAS_ZOOM } from '@/lib/layout/canvas-zoom'
import {
  pagePreviewVariant,
  peekPagePreview,
  readPagePreview,
  type PagePreviewSnapshot,
} from '@/lib/documents/preview'
import { removePageCanvas, retainPageCanvas } from '@/lib/page-canvas-cache'

const ZOOM_STEP = 1.05

// Whether the scaled card is actually bigger than the area's padded content
// box. Deliberately geometry-based (rects/padding) rather than
// area.scrollWidth/Height: with `safe center` on a flex item that fits,
// browsers report scrollWidth as clientWidth + 2*scrollLeft, mirroring
// whatever scroll offset happens to be applied instead of measuring real
// overflow.
function canvasCentering(area: HTMLElement, scaleBox: HTMLElement) {
  const style = getComputedStyle(area)
  const horizontalPadding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight)
  const verticalPadding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom)
  const availableWidth = area.clientWidth - horizontalPadding
  const availableHeight = area.clientHeight - verticalPadding
  const boxRect = scaleBox.getBoundingClientRect()
  return calculateCanvasCentering({
    renderedWidth: boxRect.width,
    renderedHeight: boxRect.height,
    availableWidth,
    availableHeight,
  })
}

function elementOverflows(area: HTMLElement, scaleBox: HTMLElement) {
  return canvasCentering(area, scaleBox).overflows
}

function centerElementInArea(area: HTMLElement, scaleBox: HTMLElement) {
  const centering = canvasCentering(area, scaleBox)
  // A fitting flex item is centered by `safe center` at scroll offset zero.
  // When minimum zoom leaves an item overflowing, `safe center` deliberately
  // falls back to start alignment, so center the residual overflow ourselves.
  area.scrollLeft = centering.scrollLeft
  area.scrollTop = centering.scrollTop
}

function applyCanvasOffset(scaleBox: HTMLElement, offset: { x: number; y: number }) {
  if (Math.abs(offset.x) < 0.001) offset.x = 0
  if (Math.abs(offset.y) < 0.001) offset.y = 0
  scaleBox.style.translate = offset.x === 0 && offset.y === 0 ? '' : `${offset.x}px ${offset.y}px`
}

type SharedFrameNodeProps = Omit<
  ComponentProps<typeof FrameNode>,
  'node' | 'docId' | 'selectedIds' | 'editingId' | 'pageNumber' | 'imageEffectPreview' | 'pageActive'
>

function CachedCanvasPage({
  pageId,
  active,
  selectedIds,
  editingId,
  pageNumber,
  imageEffectPreview,
  frameNodeProps,
}: {
  pageId: string
  active: boolean
  selectedIds: string[]
  editingId: string | null
  pageNumber?: ComponentProps<typeof FrameNode>['pageNumber']
  imageEffectPreview: ImageEffectPreview | null
  frameNodeProps: SharedFrameNodeProps
}) {
  const tree = useLayoutTree(pageId)

  return (
    <div
      className="scripture-cached-canvas-page"
      hidden={!active}
      aria-hidden={!active}
      inert={!active}
    >
      {tree ? (
        <FrameNode
          {...frameNodeProps}
          node={tree}
          docId={pageId}
          selectedIds={active ? selectedIds : []}
          editingId={active ? editingId : null}
          pageNumber={pageNumber}
          imageEffectPreview={active ? imageEffectPreview : null}
          pageActive={active}
        />
      ) : null}
    </div>
  )
}

function CanvasPreviewHandoff({
  pageId,
  variant,
  visible,
}: {
  pageId: string
  variant: string
  visible: boolean
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const previewKey = `${pageId}\u0000${variant}`
  const [loadedPreview, setLoadedPreview] = useState<{
    key: string
    snapshot: PagePreviewSnapshot | null
  } | null>(() => ({ key: previewKey, snapshot: peekPagePreview(pageId, variant) }))
  const snapshot = loadedPreview?.key === previewKey
    ? loadedPreview.snapshot
    : peekPagePreview(pageId, variant)
  const [scale, setScale] = useState(1)

  useEffect(() => {
    if (snapshot) return
    let cancelled = false
    void readPagePreview(pageId, variant).then((next) => {
      if (!cancelled) setLoadedPreview({ key: previewKey, snapshot: next })
    })
    return () => {
      cancelled = true
    }
  }, [pageId, previewKey, snapshot, variant])

  useLayoutEffect(() => {
    const root = rootRef.current
    if (!visible || !snapshot || !root) return
    const update = () => {
      const style = getComputedStyle(root)
      const availableWidth = root.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
      const availableHeight = root.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)
      setScale(Math.min(1, availableWidth / snapshot.pageWidth, availableHeight / snapshot.pageHeight))
    }
    const observer = new ResizeObserver(update)
    observer.observe(root)
    update()
    return () => observer.disconnect()
  }, [snapshot, visible])

  if (!visible) return null

  return (
    <div
      ref={rootRef}
      className="scripture-canvas-switch-preview"
      aria-hidden={snapshot ? true : undefined}
      aria-live={snapshot ? undefined : 'polite'}
      aria-busy={snapshot ? undefined : true}
      role={snapshot ? undefined : 'status'}
      inert={Boolean(snapshot)}
    >
      {/* Serialized from the app's own escaped export DOM, shared with page thumbnails. */}
      {snapshot ? (
        <div
          className="scripture-canvas-switch-preview-document"
          style={{ '--scripture-canvas-switch-scale': scale } as CSSProperties}
          dangerouslySetInnerHTML={{ __html: snapshot.html }}
        />
      ) : (
        <span className="scripture-canvas-switch-loading">
          <LoaderCircle aria-hidden="true" />
          Opening page…
        </span>
      )}
    </div>
  )
}

export default function DocumentEditorPage() {
  const { docId } = useParams<{ docId: string }>()
  const router = useRouter()
  const backgroundRemovalOperations = useBackgroundRemovalOperations()
  const [pageIds, setPageIds] = useState<string[]>([])
  const [pageNames, setPageNames] = useState<Record<string, string>>({})
  const [pageNumberSettings, setPageNumberSettings] = useState<PageNumberSettings>(DEFAULT_PAGE_NUMBER_SETTINGS)
  const [activePageId, setActivePageId] = useState<string | null>(null)
  const [cachedPageIds, setCachedPageIds] = useState<string[]>([])
  const activePageNumber = activePageId
    ? resolvePageNumber(pageIds, activePageId, pageNumberSettings)
    : null
  const tree = useLayoutTree(activePageId)
  const treeMounted = Boolean(tree)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  // Figma-style selection model, canvas-mode blocks only (flex-mode blocks
  // stay always-editable, as before -- there's no competing "drag the whole
  // block by clicking it" gesture there to disambiguate from). A single
  // click selects without focusing the editor (editable:false); this tracks
  // which ONE block (if any) is actually in text-edit mode, entered via
  // double-click. null means "nothing is being text-edited right now".
  const [editingId, setEditingId] = useState<string | null>(null)
  const [exporting, setExporting] = useState<'pdf' | 'png' | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)
  const [operationError, setOperationError] = useState<string | null>(null)
  const [deleteNotice, setDeleteNotice] = useState<{
    count: number
    deletedIds: string[]
    imageSources: string[]
  } | null>(null)
  const pendingImageDeleteTimersRef = useRef(new Map<string, number>())
  const [saveState, setSaveState] = useState<'saving' | 'saved'>('saved')
  const [docName, setDocName] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [gutterClickMode, setGutterClickMode] = useState<GutterClickMode>('highlight')
  const [imageEffectPreview, setImageEffectPreview] = useState<ImageEffectPreview | null>(null)
  const [zoom, setZoom] = useState(1)
  const zoomRef = useRef(1)
  const previousZoomRef = useRef(1)
  // Set right before a setZoom call that isn't the user directly zooming in
  // (page-switch restore, auto-fit, recenter) -- lets the zoom-increase
  // effect below tell "the user zoomed in" apart from "the zoom level just
  // changed because we switched/fit pages" so the pan hint doesn't pop on
  // every switch back to a page the user had zoomed in on.
  const programmaticZoomRef = useRef(false)
  const pendingZoomAnchorRef = useRef<{ x: number; y: number; canvasX: number; canvasY: number } | null>(null)
  const [customizeOpen, setCustomizeOpen] = useState(false)
  const [showStarterPicker, setShowStarterPicker] = useState(false)
  const [applyingTemplate, setApplyingTemplate] = useState(false)
  const [starterError, setStarterError] = useState<string | null>(null)
  // Which Customize tab to land on -- the Inspector's theme-picker "+" and
  // window-chrome-section "+" (components/canvas/inspector-panel.tsx) both
  // open this same dialog instance, to different tabs.
  const [customizeTab, setCustomizeTab] = useState<'syntax' | 'chrome'>('syntax')
  // A PDF was picked (via the image block's file input) or dropped onto the
  // canvas -- opens PdfPagePickerDialog for page selection before anything
  // is uploaded. Null means the dialog is closed.
  const [pdfPicker, setPdfPicker] = useState<PdfPickerRequest | null>(null)
  // The natural (unscaled) content size of .scripture-canvas-viewport --
  // used to size .scripture-canvas-scale-box to the SCALED dimensions, so
  // the scrollable canvas area's scroll bounds actually grow/shrink with
  // zoom (a `transform: scale()` alone doesn't affect layout/scroll size).
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null)
  const naturalSizeRef = useRef<{ width: number; height: number } | null>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const canvasAreaRef = useRef<HTMLDivElement>(null)
  const canvasOffsetRef = useRef({ x: 0, y: 0 })
  const exportSurfaceRootRef = useRef<HTMLDivElement>(null)
  // Whether this page has already been auto-fit once -- without this guard,
  // the auto-fit effect below (keyed on naturalSize) would refight the
  // user's own manual zoom every time naturalSize changes (e.g. after
  // adding/resizing a block), not just on first load. Reset per page switch.
  const autoFitDoneRef = useRef(false)
  // Fit mode follows changes to the available canvas area (window/browser
  // scaling and sidebar resizing). Any explicit zoom action turns it off so
  // the viewport never fights a scale the user chose manually.
  const fitModeRef = useRef(true)
  const spacePressedRef = useRef(false)
  const [spacePressed, setSpacePressed] = useState(false)
  const activePanCleanupRef = useRef<(() => void) | null>(null)
  const canvasOverflowsRef = useRef(false)
  const [canvasOverflows, setCanvasOverflows] = useState(false)
  const [panHintVisible, setPanHintVisible] = useState(false)
  // Per-page camera memory -- each page remembers the zoom/fit-mode/scroll/pan
  // it was left at, so switching back to a page restores exactly how it
  // looked instead of replaying the fit-to-viewport animation every time.
  // Never trimmed: bounded by the document's own page count.
  const pageViewRef = useRef(
    new Map<string, { zoom: number; fitMode: boolean; scrollLeft: number; scrollTop: number; offset: { x: number; y: number } }>()
  )
  const pendingRestoreViewRef = useRef<{ scrollLeft: number; scrollTop: number; offset: { x: number; y: number } } | null>(null)

  useEffect(() => {
    zoomRef.current = zoom
  }, [zoom])

  useEffect(() => {
    const meta = getDocumentMeta(docId)
    if (!meta) {
      setNotFound(true)
      return
    }
    setDocName(meta.name)
    const ids = getPageIds(docId)
    setPageIds(ids)
    setPageNames(getPageNames(docId))
    setPageNumberSettings(getPageNumberSettings(docId))
    setActivePageId(ids[0])
    setCachedPageIds(ids[0] ? [ids[0]] : [])
    setSelectedIds(ids[0] ? [ROOT_ID] : [])
  }, [docId])

  useEffect(() => {
    if (notFound) router.replace('/dashboard')
  }, [notFound, router])

  useEffect(() => {
    const remainingPageIds = pageIds.slice(1)
    if (remainingPageIds.length === 0) return
    let cancelled = false
    let idleHandle: number
    let usesIdleCallback = false
    let nextPageIndex = 0
    const idleWindow = window as unknown as {
      requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number
      cancelIdleCallback?: (handle: number) => void
    }
    function scheduleNext(): void {
      if (cancelled || nextPageIndex >= remainingPageIds.length) return
      if (idleWindow.requestIdleCallback) {
        usesIdleCallback = true
        idleHandle = idleWindow.requestIdleCallback(warmNext, { timeout: 1200 })
      } else {
        usesIdleCallback = false
        idleHandle = window.setTimeout(warmNext, 150)
      }
    }
    function warmNext(): void {
      if (cancelled) return
      const pageId = remainingPageIds[nextPageIndex]
      nextPageIndex += 1
      void preloadLayoutTree(pageId).then(scheduleNext, scheduleNext)
    }
    scheduleNext()
    return () => {
      cancelled = true
      if (usesIdleCallback) idleWindow.cancelIdleCallback?.(idleHandle)
      else window.clearTimeout(idleHandle)
    }
  }, [pageIds])

  useEffect(() => {
    const search = new URLSearchParams(window.location.search)
    if (search.get('new') === '1') setShowStarterPicker(true)
  }, [])

  // Bump "last updated" and expose local persistence feedback on any change
  // to the active page -- layout tree or any block's content.
  // any block's content -- doc.on('update') fires for every transaction on
  // the whole Y.Doc regardless of which shared type changed. Recent page DOM
  // stays warm, but only the visible page drives document-level save state,
  // so watching that page's doc is sufficient.
  useEffect(() => {
    if (!activePageId) return
    const { doc, synced } = getYDoc(activePageId)
    let timeout: ReturnType<typeof setTimeout> | null = null
    let cancelled = false
    let pendingTouch = false
    void synced.then(() => {
      if (!cancelled) setSaveState('saved')
    })
    const handler = () => {
      setSaveState('saving')
      pendingTouch = true
      if (timeout) clearTimeout(timeout)
      timeout = setTimeout(() => {
        touchDocument(docId)
        pendingTouch = false
        timeout = null
        setSaveState('saved')
      }, 800)
    }
    doc.on('update', handler)
    return () => {
      doc.off('update', handler)
      if (timeout) clearTimeout(timeout)
      // A page switch or route change can happen inside the debounce window.
      // Persist the metadata revision so dashboard preview caches cannot remain
      // valid after the underlying Yjs document has already changed.
      if (pendingTouch) touchDocument(docId)
      cancelled = true
    }
  }, [docId, activePageId])

  // Track the canvas content's natural (unscaled) size -- read from the
  // inner .scripture-canvas-viewport, which is never itself transformed by
  // its own scale, so offsetWidth/offsetHeight are always true content
  // units regardless of the current zoom.
  useEffect(() => {
    if (!treeMounted) return
    const el = viewportRef.current
    if (!el) return
    const update = () => {
      const size = { width: el.offsetWidth, height: el.offsetHeight }
      if (size.width <= 0 || size.height <= 0) return
      naturalSizeRef.current = size
      setNaturalSize(size)
    }
    const observer = new ResizeObserver(update)
    observer.observe(el)
    update()
    return () => observer.disconnect()
  }, [activePageId, treeMounted])

  // Browser zoom and display outscaling both change the canvas area's CSS
  // pixel dimensions. Keep a fitted canvas fitted when that happens, while
  // leaving manually selected zoom levels untouched.
  useEffect(() => {
    const area = canvasAreaRef.current
    if (!area || !tree) return
    let frame: number | null = null
    const observer = new ResizeObserver(() => {
      if (!fitModeRef.current || !naturalSizeRef.current) return
      if (frame != null) cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        frame = null
        if (fitModeRef.current) fitCanvasToViewport()
      })
    })
    observer.observe(area)
    return () => {
      observer.disconnect()
      if (frame != null) cancelAnimationFrame(frame)
    }
    // `tree` is intentionally reduced to a mounted/not-mounted signal: doc
    // edits replace the tree object but must not retrigger viewport fitting.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePageId, Boolean(tree)])

  // d3-zoom owns trackpad gesture recognition and wheel normalization. The
  // canvas still owns rendering and scroll-based panning, so each d3 scale
  // update is bridged into React using one immutable cursor/canvas point for
  // the full gesture. This prevents rounded DOM geometry from feeding back
  // into the next wheel event while keeping button zoom independent.
  useEffect(() => {
    const el = canvasAreaRef.current
    if (!el) return
    const selection = select(el)
    let gestureActive = false
    let gestureAnchor: { x: number; y: number; canvasX: number; canvasY: number } | null = null
    let queuedZoom = zoomRef.current
    let zoomFrame: number | null = null

    // This capture listener runs before d3's wheel listener. Synchronize its
    // internal scale with zooms made by the controls, then capture the point
    // under the cursor before any layout has changed.
    const prepareWheelGesture = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) {
        if (event.deltaX !== 0 || event.deltaY !== 0) setPanHintVisible(false)
        return
      }
      event.preventDefault()
      fitModeRef.current = false
      if (gestureActive) return
      gestureActive = true
      selection.property('__zoom', zoomIdentity.scale(zoomRef.current))
      const scaleBox = viewportRef.current?.parentElement
      const boxRect = scaleBox?.getBoundingClientRect()
      if (scaleBox && boxRect) {
        const current = zoomRef.current
        gestureAnchor = {
          x: event.clientX,
          y: event.clientY,
          canvasX: (event.clientX - boxRect.left) / current,
          canvasY: (event.clientY - boxRect.top) / current,
        }
      }
    }

    const zoomBehavior = createZoom<HTMLDivElement, unknown>()
      .filter((event) => {
        const wheelEvent = event as WheelEvent
        return wheelEvent.type === 'wheel' && (wheelEvent.ctrlKey || wheelEvent.metaKey)
      })
      .touchable(() => false)
      .scaleExtent([MIN_CANVAS_ZOOM, MAX_CANVAS_ZOOM])
      .wheelDelta((event) =>
        -event.deltaY *
        (event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 0.05 : event.deltaMode ? 1 : 0.002) *
        (event.ctrlKey || event.metaKey ? 10 : 1)
      )
      .on('zoom.scripture', (event) => {
        queuedZoom = clampCanvasZoom(event.transform.k)
        if (zoomFrame != null) return
        zoomFrame = requestAnimationFrame(() => {
          zoomFrame = null
          const next = queuedZoom
          if (gestureAnchor && next !== zoomRef.current) pendingZoomAnchorRef.current = gestureAnchor
          zoomRef.current = next
          setZoom(next)
        })
      })
      .on('end.scripture', () => {
        gestureActive = false
        gestureAnchor = null
      })

    el.addEventListener('wheel', prepareWheelGesture, { capture: true, passive: false })
    selection.call(zoomBehavior)
    return () => {
      el.removeEventListener('wheel', prepareWheelGesture, { capture: true })
      selection.on('.zoom', null)
      if (zoomFrame != null) cancelAnimationFrame(zoomFrame)
    }
  }, [activePageId, treeMounted])

  // Apply anchoring after React has committed the new transform and scale-box
  // dimensions. Scroll absorbs the correction on overflowing axes. A fitting
  // axis cannot scroll, so preserve its remainder as a subpixel visual offset
  // instead of silently falling back to center-anchored zoom. As scroll range
  // becomes available, fold that offset back into scroll without moving the
  // canvas on screen.
  useLayoutEffect(() => {
    const anchor = pendingZoomAnchorRef.current
    if (!anchor) return
    pendingZoomAnchorRef.current = null
    const area = canvasAreaRef.current
    const scaleBox = area?.querySelector<HTMLElement>('.scripture-canvas-scale-box')
    if (!area || !scaleBox) return

    const offset = canvasOffsetRef.current
    const scrollLeftBeforeRebase = area.scrollLeft
    const scrollTopBeforeRebase = area.scrollTop
    area.scrollLeft = scrollLeftBeforeRebase - offset.x
    area.scrollTop = scrollTopBeforeRebase - offset.y
    offset.x += area.scrollLeft - scrollLeftBeforeRebase
    offset.y += area.scrollTop - scrollTopBeforeRebase
    applyCanvasOffset(scaleBox, offset)

    const nextRect = scaleBox.getBoundingClientRect()
    const errorX = nextRect.left + anchor.canvasX * zoom - anchor.x
    const errorY = nextRect.top + anchor.canvasY * zoom - anchor.y
    const scrollLeftBeforeCorrection = area.scrollLeft
    const scrollTopBeforeCorrection = area.scrollTop
    area.scrollLeft += errorX
    area.scrollTop += errorY
    offset.x -= errorX - (area.scrollLeft - scrollLeftBeforeCorrection)
    offset.y -= errorY - (area.scrollTop - scrollTopBeforeCorrection)
    applyCanvasOffset(scaleBox, offset)
  }, [zoom])

  // The hint is useful only once the scaled canvas is larger than its
  // viewport. Observe both boxes because either zoom/layout changes or a
  // sidebar/window resize can cross that boundary. Compared against the
  // scaled card's own rect rather than area.scrollWidth/Height: with
  // `safe center` on a non-overflowing flex item, browsers report
  // scrollWidth as clientWidth + 2*scrollLeft, mirroring whatever scroll
  // offset happens to be applied rather than measuring real overflow --
  // which falsely flagged "overflowing" (and popped this hint) on every
  // open even when the card fit perfectly.
  useEffect(() => {
    const area = canvasAreaRef.current
    const scaleBox = area?.querySelector<HTMLElement>('.scripture-canvas-scale-box')
    if (!area || !scaleBox) return
    const updateOverflow = () => {
      const next = elementOverflows(area, scaleBox)
      if (next === canvasOverflowsRef.current) return
      canvasOverflowsRef.current = next
      setCanvasOverflows(next)
      // Only auto-*hide* the hint here. Showing it is the zoom-increase
      // effect's job -- this effect also fires on every page switch (a
      // restored zoom/pan can legitimately overflow), and popping the hint
      // there would read as "why is this showing, I didn't do anything".
      if (!next) setPanHintVisible(false)
    }
    updateOverflow()
    const observer = new ResizeObserver(updateOverflow)
    observer.observe(area)
    observer.observe(scaleBox)
    return () => observer.disconnect()
  }, [activePageId, treeMounted])

  useEffect(() => {
    if (!panHintVisible) return
    const timeout = window.setTimeout(() => setPanHintVisible(false), 5000)
    return () => window.clearTimeout(timeout)
  }, [panHintVisible])

  // Overflow can already be true when the first hint times out. A later
  // zoom-in therefore cannot rely on the overflow observer's false -> true
  // transition to show it again; check the post-zoom layout explicitly.
  useEffect(() => {
    const previousZoom = previousZoomRef.current
    previousZoomRef.current = zoom
    if (programmaticZoomRef.current) {
      programmaticZoomRef.current = false
      return
    }
    if (zoom <= previousZoom) return
    const frame = requestAnimationFrame(() => {
      const area = canvasAreaRef.current
      const scaleBox = area?.querySelector<HTMLElement>('.scripture-canvas-scale-box')
      if (!area || !scaleBox) return
      if (elementOverflows(area, scaleBox)) setPanHintVisible(true)
    })
    return () => cancelAnimationFrame(frame)
  }, [zoom])

  useEffect(() => {
    if (!deleteNotice) return
    const timeout = window.setTimeout(() => setDeleteNotice(null), 5000)
    return () => window.clearTimeout(timeout)
  }, [deleteNotice])

  useEffect(() => {
    return () => activePanCleanupRef.current?.()
  }, [])

  // One guarded keyboard dispatcher owns canvas-level shortcuts. Editors,
  // form fields, and dialogs keep their native key handling.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const active = document.activeElement
      const tag = active?.tagName
      const isTyping =
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        active?.getAttribute('contenteditable') === 'true'
      const dialogOpen = Boolean(document.querySelector('[data-slot="dialog-content"], [data-slot="alert-dialog-content"]'))

      if (e.code === 'Space' && !isTyping && !dialogOpen) {
        spacePressedRef.current = true
        setSpacePressed(true)
        e.preventDefault()
      }
      if (dialogOpen) return
      if (e.key === 'Escape' && editingId) {
        e.preventDefault()
        setEditingId(null)
        ;(active as HTMLElement | null)?.blur?.()
        return
      }
      if (isTyping) return

      const command = e.metaKey || e.ctrlKey
      if (command && e.key.toLowerCase() === 'z') {
        if (!activePageId) return
        e.preventDefault()
        const manager = getUndoManager(activePageId)
        if (e.shiftKey) manager.redo()
        else manager.undo()
        return
      }
      if (command && e.key.toLowerCase() === 'd') {
        if (!activePageId) return
        e.preventDefault()
        const next = selectedIds
          .filter((id) => id !== ROOT_ID)
          .map((id) => duplicateNode(getYDoc(activePageId).doc, id))
          .filter((id): id is string => Boolean(id))
        if (next.length > 0) handleSelectionChange(next)
        return
      }
      if (command && e.key.toLowerCase() === 'a') {
        if (!tree) return
        e.preventDefault()
        const selected = findNode(tree, selectedIds[0] ?? ROOT_ID)
        const parent = selected?.id === ROOT_ID ? selected : selected ? findParent(tree, selected.id) : null
        handleSelectionChange((parent?.children ?? []).map((child) => child.id))
        return
      }
      if (command && (e.key === '=' || e.key === '+')) {
        e.preventDefault()
        handleZoomIn()
        return
      }
      if (command && e.key === '-') {
        e.preventDefault()
        handleZoomOut()
        return
      }
      if (command && e.key === '0') {
        e.preventDefault()
        handleZoomReset()
        return
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && !selectedIds.includes(ROOT_ID)) {
        e.preventDefault()
        handleRemoveMany(selectedIds)
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        handleSelectionChange([ROOT_ID])
        return
      }
      if (e.key === 'Enter' && selectedIds.length === 1 && tree) {
        const node = findNode(tree, selectedIds[0])
        if (node?.kind === 'code' || node?.kind === 'text') {
          e.preventDefault()
          setEditingId(node.id)
        }
        return
      }
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key) && activePageId && tree) {
        const delta = e.shiftKey ? 10 : 1
        let changed = false
        for (const id of selectedIds) {
          const node = findNode(tree, id)
          const parent = node ? findParent(tree, id) : null
          if (!node || parent?.childLayout !== 'canvas') continue
          changed = true
          updateNodePosition(getYDoc(activePageId).doc, id, {
            x: Math.max(0, (node.x ?? 0) + (e.key === 'ArrowLeft' ? -delta : e.key === 'ArrowRight' ? delta : 0)),
            y: Math.max(0, (node.y ?? 0) + (e.key === 'ArrowUp' ? -delta : e.key === 'ArrowDown' ? delta : 0)),
          })
        }
        if (changed) e.preventDefault()
      }
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.code !== 'Space') return
      spacePressedRef.current = false
      setSpacePressed(false)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds, activePageId, tree, editingId])

  // Switching pages promotes the target canvas into a bounded MRU cache.
  // Inactive canvases use a CSS keep-alive so their DOM and editor instances
  // survive, while the oldest entry is still evicted to bound memory use.
  function handleSwitchPage(pageId: string) {
    if (pageId === activePageId) return
    void preloadLayoutTree(pageId)
    activePanCleanupRef.current?.()

    // Remember exactly how the page we're leaving was framed, so coming back
    // to it later restores that view instead of re-running auto-fit.
    if (activePageId) {
      const area = canvasAreaRef.current
      pageViewRef.current.set(activePageId, {
        zoom: zoomRef.current,
        fitMode: fitModeRef.current,
        scrollLeft: area?.scrollLeft ?? 0,
        scrollTop: area?.scrollTop ?? 0,
        offset: { ...canvasOffsetRef.current },
      })
    }

    const savedView = pageViewRef.current.get(pageId)
    pendingZoomAnchorRef.current = null
    naturalSizeRef.current = null
    setNaturalSize(null)

    if (savedView) {
      autoFitDoneRef.current = true
      fitModeRef.current = savedView.fitMode
      zoomRef.current = savedView.zoom
      programmaticZoomRef.current = true
      setZoom(savedView.zoom)
      pendingRestoreViewRef.current = {
        scrollLeft: savedView.scrollLeft,
        scrollTop: savedView.scrollTop,
        offset: savedView.offset,
      }
    } else {
      autoFitDoneRef.current = false
      fitModeRef.current = true
      pendingRestoreViewRef.current = null
      resetCanvasOffset()
    }

    setCachedPageIds((current) => retainPageCanvas(current, pageId))
    setActivePageId(pageId)
    setSelectedIds([ROOT_ID])
    setEditingId(null)
  }

  function handleAddPage() {
    const pageId = addPage(docId)
    setPageIds((prev) => [...prev, pageId])
    handleSwitchPage(pageId)
  }

  async function handleRemovePage(pageId: string) {
    await deletePage(docId, pageId)
    setCachedPageIds((current) => removePageCanvas(current, pageId))
    const next = pageIds.filter((id) => id !== pageId)
    setPageIds(next)
    setPageNames((current) => {
      const nextNames = { ...current }
      delete nextNames[pageId]
      return nextNames
    })
    setPageNumberSettings(getPageNumberSettings(docId))
    if (activePageId === pageId) handleSwitchPage(next[Math.max(0, pageIds.indexOf(pageId) - 1)])
    pageViewRef.current.delete(pageId)
  }

  async function handleDuplicatePage(pageId: string) {
    setOperationError(null)
    try {
      const duplicatePageId = await duplicatePage(docId, pageId)
      setPageIds(getPageIds(docId))
      setPageNames(getPageNames(docId))
      setPageNumberSettings(getPageNumberSettings(docId))
      handleSwitchPage(duplicatePageId)
    } catch (cause) {
      setOperationError(cause instanceof Error ? cause.message : 'The page could not be duplicated.')
    }
  }

  function handleReorderPages(next: string[]) {
    reorderPages(docId, next)
    setPageIds(next)
  }

  function handleRenamePage(pageId: string, name: string) {
    renamePage(docId, pageId, name)
    setPageNames((current) => {
      const next = { ...current }
      const trimmedName = name.trim()
      if (trimmedName) next[pageId] = trimmedName
      else delete next[pageId]
      return next
    })
  }

  function handlePageNumberSettingsChange(settings: PageNumberSettings) {
    setPageNumberSettings(settings)
    persistPageNumberSettings(docId, settings)
  }

  function handleRename(name: string) {
    setDocName(name)
    renameDocument(docId, name || 'Untitled')
  }

  // Selecting anything other than the block currently being text-edited
  // exits edit mode -- matches "click elsewhere -> back to selected, not
  // editing" from the Figma-style model. Funneled through both this and
  // handleSelectionChange below so every selection-changing path (canvas
  // clicks, the Inspector's group/ungroup/add-block actions) stays consistent.
  function exitEditingUnless(nextIds: string[]) {
    setEditingId((prev) => (prev && nextIds.length === 1 && nextIds[0] === prev ? prev : null))
  }

  function handleSelect(id: string, additive: boolean) {
    setSelectedIds((prev) => {
      const next = additive ? (prev.includes(id) ? prev.filter((existing) => existing !== id) : [...prev, id]) : [id]
      exitEditingUnless(next)
      return next
    })
  }

  function handleSelectionChange(ids: string[]) {
    setSelectedIds(ids)
    exitEditingUnless(ids)
  }

  function handleMove(id: string, direction: 'up' | 'down') {
    if (!activePageId) return
    moveNode(getYDoc(activePageId).doc, id, direction)
  }

  function handleDuplicate(id: string) {
    if (!activePageId) return
    const duplicateId = duplicateNode(getYDoc(activePageId).doc, id)
    if (!duplicateId) return
    setSelectedIds([duplicateId])
    setEditingId(null)
  }

  function queueImageDelete(pageId: string, src: string) {
    if (pendingImageDeleteTimersRef.current.has(src)) return
    const timeout = window.setTimeout(() => {
      pendingImageDeleteTimersRef.current.delete(src)
      // Duplicated image layers can intentionally share a backing URL on the
      // same page. Only delete after confirming no surviving current or
      // undo-retained node still references it.
      const remainingTree = toPlainTree(getYDoc(pageId).doc)
      if (remainingTree && imageSources(remainingTree).includes(src)) return
      void deleteUploadedImage(src).catch((cause) => {
        setOperationError(cause instanceof Error ? cause.message : 'The uploaded image could not be removed.')
      })
    }, 5500)
    pendingImageDeleteTimersRef.current.set(src, timeout)
  }

  function imageSources(node: ReturnType<typeof findNode>): string[] {
    if (!node) return []
    return [
      ...(node.kind === 'image' ? [node.src, ...(node.retainedSources ?? [])].filter((src): src is string => Boolean(src)) : []),
      ...(node.children ?? []).flatMap((child) => imageSources(child)),
    ]
  }

  function handleRemoveMany(ids: string[]) {
    if (!activePageId || !tree) return
    const removable = ids.filter((id) => id !== ROOT_ID && findNode(tree, id))
    if (removable.length === 0) return
    const removed = new Set(removable)
    const first = findNode(tree, removable[0])
    const parent = first ? findParent(tree, first.id) : null
    const siblings = parent?.children ?? []
    const index = siblings.findIndex((sibling) => sibling.id === first?.id)
    const fallback =
      siblings.slice(Math.max(0, index + 1)).find((sibling) => !removed.has(sibling.id)) ??
      siblings.slice(0, Math.max(0, index)).reverse().find((sibling) => !removed.has(sibling.id)) ??
      parent ??
      tree

    const queuedImageSources = removable.flatMap((id) => imageSources(findNode(tree, id)))
    const undoManager = getUndoManager(activePageId)
    undoManager.stopCapturing()
    for (const id of removable) {
      removeNode(getYDoc(activePageId).doc, id)
    }
    for (const src of queuedImageSources) queueImageDelete(activePageId, src)
    undoManager.stopCapturing()
    setSelectedIds([fallback.id])
    setEditingId(null)
    setDeleteNotice({ count: removable.length, deletedIds: removable, imageSources: queuedImageSources })
  }

  function handleRemove(id: string) {
    handleRemoveMany([id])
  }

  function handleUndoDelete() {
    if (!activePageId || !deleteNotice) return
    for (const src of deleteNotice.imageSources) {
      const timeout = pendingImageDeleteTimersRef.current.get(src)
      if (timeout != null) window.clearTimeout(timeout)
      pendingImageDeleteTimersRef.current.delete(src)
    }
    getUndoManager(activePageId).undo()
    setSelectedIds(deleteNotice.deletedIds)
    setEditingId(null)
    setDeleteNotice(null)
  }

  function handleReorder(draggedId: string, targetId: string) {
    if (!activePageId) return
    moveNodeBeforeSibling(getYDoc(activePageId).doc, draggedId, targetId)
  }

  function handleResizeNode(id: string, size: SizePatch, position?: PositionPatch) {
    if (!activePageId) return
    updateNodeGeometry(getYDoc(activePageId).doc, id, size, position)
  }

  function handleRepositionNode(id: string, position: { x?: number; y?: number }) {
    if (!activePageId) return
    updateNodePosition(getYDoc(activePageId).doc, id, position)
  }

  function beginCanvasPan(e: React.PointerEvent<HTMLDivElement>) {
    const shouldPan = e.button === 1 || (e.button === 0 && spacePressedRef.current)
    if (!shouldPan || activePanCleanupRef.current) return
    e.preventDefault()
    e.stopPropagation()
    const area = e.currentTarget
    const pointerId = e.pointerId
    const startX = e.clientX
    const startY = e.clientY
    const startLeft = area.scrollLeft
    const startTop = area.scrollTop
    const startOffset = { ...canvasOffsetRef.current }
    const scaleBox = viewportRef.current?.parentElement
    let moved = false
    area.dataset.panning = 'true'
    document.documentElement.dataset.scripturePanning = 'true'
    const onMove = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return
      event.preventDefault()
      const dx = event.clientX - startX
      const dy = event.clientY - startY
      if (!moved && Math.hypot(dx, dy) >= 2) {
        moved = true
        setPanHintVisible(false)
      }
      area.scrollLeft = startLeft - dx
      area.scrollTop = startTop - dy
      if (scaleBox) {
        const offset = canvasOffsetRef.current
        offset.x = startOffset.x + dx - (startLeft - area.scrollLeft)
        offset.y = startOffset.y + dy - (startTop - area.scrollTop)
        applyCanvasOffset(scaleBox, offset)
      }
    }
    const finishPointer = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return
      cleanup()
    }
    const finish = () => cleanup()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') finish()
    }
    function cleanup() {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', finishPointer)
      window.removeEventListener('pointercancel', finishPointer)
      window.removeEventListener('blur', finish)
      window.removeEventListener('keydown', onKeyDown)
      delete area.dataset.panning
      delete document.documentElement.dataset.scripturePanning
      activePanCleanupRef.current = null
    }
    activePanCleanupRef.current = cleanup
    window.addEventListener('pointermove', onMove, { passive: false })
    window.addEventListener('pointerup', finishPointer)
    window.addEventListener('pointercancel', finishPointer)
    window.addEventListener('blur', finish)
    window.addEventListener('keydown', onKeyDown)
  }

  function handleGutterClick(blockId: string, lineNumber: number) {
    if (!activePageId) return
    cycleGutterLine(getYDoc(activePageId).doc, blockId, lineNumber, gutterClickMode)
  }

  function handleAddBlockToFrame(frameId: string, kind: 'code' | 'text' | 'image') {
    if (!activePageId) return
    const id = addBlock(getYDoc(activePageId).doc, frameId, kind)
    handleSelectionChange([id])
    setEditingId(kind === 'image' ? null : id)
  }

  function handleRequestPdfPicker(frameId: string, nodeId: string, file: File) {
    if (!activePageId) return
    setPdfPicker({ files: [file], pageId: activePageId, frameId, nodeId })
  }

  // Files dropped directly onto the canvas (not from the image block's own
  // file input) -- each image uploads immediately into a fresh image block;
  // every PDF in the drop opens the page picker together (its tab strip lets
  // the user switch between them), not just the first one. A PDF does not
  // create a block until the user confirms at least one page, so cancel/
  // failure leaves the document and undo history untouched.
  async function handleDropFiles(frameId: string, files: File[]) {
    if (!activePageId) return
    const doc = getYDoc(activePageId).doc
    const pdfFiles = files.filter(isPdfFile)
    const imageFiles = files.filter((file) => !isPdfFile(file) && file.type.startsWith('image/'))

    for (const file of imageFiles) {
      const id = addBlock(doc, frameId, 'image')
      try {
        const name = baseFileName(file.name)
        updateImageProps(doc, id, { src: await uploadImageFile(file), alt: name, label: name })
      } catch (err) {
        console.error('Failed to upload dropped image', err)
        removeNode(doc, id)
      }
    }

    if (pdfFiles.length > 0) {
      setPdfPicker({ files: pdfFiles, pageId: activePageId, frameId, nodeId: null })
    }
  }

  function handleInsertPdfPages({
    pageId,
    frameId,
    nodeId,
    pages,
  }: {
    pageId: string
    frameId: string
    nodeId: string | null
    pages: Array<{ url: string; alt: string }>
  }) {
    if (pages.length === 0) return
    const doc = getYDoc(pageId).doc
    const [first, ...rest] = pages
    const firstId = nodeId ?? addBlock(doc, frameId, 'image')
    const currentTree = toPlainTree(doc)
    const currentFirst = currentTree ? findNode(currentTree, firstId) : null
    updateImageProps(doc, firstId, {
      src: first.url,
      alt: first.alt,
      ...(!currentFirst?.label?.trim() && { label: first.alt }),
    })
    const insertedIds = [firstId]
    for (const { url, alt } of rest) {
      const id = addBlock(doc, frameId, 'image')
      updateImageProps(doc, id, { src: url, alt, label: alt })
      insertedIds.push(id)
    }
    setPdfPicker(null)
    if (activePageId === pageId) handleSelectionChange(insertedIds)
  }

  function handleZoomIn() {
    fitModeRef.current = false
    prepareCenterZoomAnchor()
    setZoom((z) => clampCanvasZoom(z * ZOOM_STEP))
  }
  function handleZoomOut() {
    fitModeRef.current = false
    prepareCenterZoomAnchor()
    setZoom((z) => clampCanvasZoom(z / ZOOM_STEP))
  }
  function handleZoomChange(nextZoom: number) {
    fitModeRef.current = false
    prepareCenterZoomAnchor()
    setZoom(clampCanvasZoom(nextZoom))
  }
  function handleZoomReset() {
    fitModeRef.current = false
    prepareCenterZoomAnchor()
    setZoom(1)
  }

  function prepareCenterZoomAnchor() {
    const area = canvasAreaRef.current
    const scaleBox = viewportRef.current?.parentElement
    if (!area || !scaleBox) {
      pendingZoomAnchorRef.current = null
      return
    }
    const areaRect = area.getBoundingClientRect()
    const boxRect = scaleBox.getBoundingClientRect()
    const x = areaRect.left + area.clientLeft + area.clientWidth / 2
    const y = areaRect.top + area.clientTop + area.clientHeight / 2
    const current = zoomRef.current
    pendingZoomAnchorRef.current = {
      x,
      y,
      canvasX: (x - boxRect.left) / current,
      canvasY: (y - boxRect.top) / current,
    }
  }

  function resetCanvasOffset() {
    const offset = canvasOffsetRef.current
    offset.x = 0
    offset.y = 0
    const scaleBox = viewportRef.current?.parentElement
    if (scaleBox) applyCanvasOffset(scaleBox, offset)
  }

  function handleOpenCustomize(tab: 'syntax' | 'chrome') {
    setCustomizeTab(tab)
    setCustomizeOpen(true)
  }

  function clearNewProjectQuery() {
    const url = new URL(window.location.href)
    url.searchParams.delete('new')
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
  }

  function handleStarterPickerChange(open: boolean) {
    if (applyingTemplate) return
    setShowStarterPicker(open)
    if (!open) {
      setStarterError(null)
      clearNewProjectQuery()
    }
  }

  async function handleApplyStarter(template: Template) {
    const pageId = activePageId ?? getPageIds(docId)[0]
    if (!pageId || applyingTemplate) return
    setApplyingTemplate(true)
    setStarterError(null)
    try {
      const { doc, synced } = getYDoc(pageId)
      await synced
      seedRootFrame(doc, { rootProps: template.rootProps, children: template.children() })
      setShowStarterPicker(false)
      clearNewProjectQuery()
    } catch (cause) {
      setStarterError(cause instanceof Error ? cause.message : 'Could not apply this starting layout.')
    } finally {
      setApplyingTemplate(false)
    }
  }

  // Fits the card to the available canvas area and centers it. Read the real
  // computed padding instead of mirroring a CSS constant so responsive
  // spacing remains part of the fit calculation.
  function fitCanvasToViewport() {
    const area = canvasAreaRef.current
    const size = naturalSizeRef.current
    if (!area || !size || size.width === 0 || size.height === 0) return false
    pendingZoomAnchorRef.current = null
    resetCanvasOffset()
    const style = getComputedStyle(area)
    const horizontalPadding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight)
    const verticalPadding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom)
    const availableWidth = area.clientWidth - horizontalPadding
    const availableHeight = area.clientHeight - verticalPadding
    if (availableWidth <= 0 || availableHeight <= 0) return false
    // "Fit" may shrink an oversized canvas, but it must never silently turn
    // into magnification. Authored dimensions should be shown at 100% on a
    // roomy viewport; zooming above that is always an explicit user action.
    programmaticZoomRef.current = true
    setZoom(clampCanvasZoom(Math.min(1, availableWidth / size.width, availableHeight / size.height)))
    // Wait for the new scale-box dimensions before centering. A fitting item
    // uses zero-offset `safe center`; any residual rounding overflow is
    // centered from the measured box geometry instead of using
    // scrollWidth, whose value can mirror a stale offset for fitting items.
    requestAnimationFrame(() => {
      const scaleBox = area.querySelector<HTMLElement>('.scripture-canvas-scale-box')
      if (scaleBox) centerElementInArea(area, scaleBox)
    })
    return true
  }

  function handleRecenter() {
    fitModeRef.current = true
    fitCanvasToViewport()
  }

  // Restore a previously-visited page's exact scroll/pan offset once its
  // scale-box has (re)appeared at the restored zoom -- handleSwitchPage
  // already restored the zoom itself and left the target here.
  useLayoutEffect(() => {
    const pending = pendingRestoreViewRef.current
    if (!pending || !naturalSize) return
    pendingRestoreViewRef.current = null
    const area = canvasAreaRef.current
    const scaleBox = area?.querySelector<HTMLElement>('.scripture-canvas-scale-box')
    if (!area || !scaleBox) return
    canvasOffsetRef.current = { ...pending.offset }
    applyCanvasOffset(scaleBox, canvasOffsetRef.current)
    area.scrollLeft = pending.scrollLeft
    area.scrollTop = pending.scrollTop
  }, [naturalSize])

  // Auto-fit the first time a page (never visited before) has its natural
  // size become known. Large canvases shrink to remain visible; smaller ones
  // stay at their authored 100% size rather than being unexpectedly magnified.
  useEffect(() => {
    if (autoFitDoneRef.current || !naturalSizeRef.current) return
    fitModeRef.current = true
    // The canvas area's own layout (sidebar widths, web fonts, etc.) may not
    // have settled into its final size yet on the very first attempt, in
    // which case fitCanvasToViewport bails out with no effect. Retry across
    // a few frames instead of giving up after one, so the page doesn't load
    // permanently off-center.
    let attempts = 0
    let frame: number | null = null
    const tryFit = () => {
      if (autoFitDoneRef.current) return
      if (fitCanvasToViewport()) {
        autoFitDoneRef.current = true
        return
      }
      attempts += 1
      if (attempts < 10) frame = requestAnimationFrame(tryFit)
    }
    tryFit()
    return () => {
      if (frame != null) cancelAnimationFrame(frame)
    }
    // The fit function reads current DOM/ref values; naturalSize is the
    // deliberate trigger. Depending on the render-created function would
    // restart this retry loop on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [naturalSize])

  async function handleExport(format: 'pdf' | 'png') {
    setExporting(format)
    setExportError(null)
    try {
      // Export clean static page copies directly in this browser. This keeps
      // the local-first document data in the same IndexedDB-backed session
      // and avoids server-only Chromium/filesystem assumptions on hosts.
      const surfaces = await waitForExportSurfaces(exportSurfaceRootRef, pageIds)
      const preferences = getExportPreferences()
      const blob = await createBrowserExport(surfaces, format, {
        quality: preferences.quality,
        transparentBackground: preferences.transparentBackground,
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${docName || 'pretty'}.${format}`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 0)
    } catch (err) {
      console.error(err)
      setExportError(err instanceof Error ? err.message : 'Export failed')
    } finally {
      setExporting(null)
    }
  }

  if (notFound) return null

  const sharedFrameNodeProps = {
    onSelect: handleSelect,
    onSelectionChange: handleSelectionChange,
    onMove: handleMove,
    onDuplicate: handleDuplicate,
    onRemove: handleRemove,
    onReorder: handleReorder,
    onResizeNode: handleResizeNode,
    onRepositionNode: handleRepositionNode,
    parentChildLayout: 'flex' as const,
    gutterClickMode,
    onGutterClick: handleGutterClick,
    zoom,
    onSetEditing: setEditingId,
    parentId: null,
    onAddBlockToFrame: handleAddBlockToFrame,
    onRequestPdfPicker: handleRequestPdfPicker,
    onDropFiles: handleDropFiles,
  } satisfies SharedFrameNodeProps
  const activePreviewVariant = pagePreviewVariant(
    activePageNumber?.number,
    activePageNumber ? pageNumberSettings : undefined
  )

  return (
    <div className="scripture-editor-shell">
      <EditorRegistryProvider>
        <GeometryRegistryProvider>
        <AppMenubar
          docName={docName ?? ''}
          onRename={handleRename}
          saveState={saveState}
        />

        <Dialog open={showStarterPicker} onOpenChange={handleStarterPickerChange}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Choose your starting point</DialogTitle>
              <DialogDescription>
                Your project is ready. Pick a layout now, or close this window to begin with an empty canvas.
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-2">
              {TEMPLATES.map((template) => {
                const previewBlocks =
                  template.id === 'three-up' ? 3 : template.id === 'before-after' ? 2 : template.id === 'single' ? 1 : 0
                return (
                  <button
                    key={template.id}
                    type="button"
                    disabled={applyingTemplate}
                    className="scripture-template-card"
                    onClick={() => void handleApplyStarter(template)}
                  >
                    <span className={`scripture-template-preview is-${template.id}`} aria-hidden="true">
                      {Array.from({ length: previewBlocks }, (_, index) => <i key={index} />)}
                      {previewBlocks === 0 && <Plus />}
                    </span>
                    <span className="scripture-template-card-name">{template.name}</span>
                    <span className="scripture-template-card-description">{template.description}</span>
                  </button>
                )
              })}
            </div>
            {starterError && <p className="scripture-error-text" role="alert">{starterError}</p>}
          </DialogContent>
        </Dialog>

        <CustomizeDialog open={customizeOpen} onOpenChange={setCustomizeOpen} initialTab={customizeTab} />
        {pdfPicker && (
          <PdfPagePickerDialog
            request={pdfPicker}
            onCancel={() => setPdfPicker(null)}
            onInsertPages={handleInsertPdfPages}
          />
        )}
        {operationError && (
          <div className="scripture-operation-error" role="alert">
            <span>{operationError}</span>
            <button type="button" onClick={() => setOperationError(null)} aria-label="Dismiss error">×</button>
          </div>
        )}

        {activePageId ? (
          <div className="scripture-workspace">
            <LayersPanel
              tree={tree}
              pageIds={pageIds}
              pageNames={pageNames}
              pageNumberSettings={pageNumberSettings}
              activePageId={activePageId as string}
              selectedIds={selectedIds}
              onAddPage={handleAddPage}
              onSelectPage={handleSwitchPage}
              onDeletePage={handleRemovePage}
              onDuplicatePage={handleDuplicatePage}
              onRenamePage={handleRenamePage}
              onReorderPages={handleReorderPages}
              onSelectNode={handleSelect}
              onSetEditing={setEditingId}
              onReorderNode={handleReorder}
            />
            <>
                <div className="scripture-canvas-stage">
                  <div
                    ref={canvasAreaRef}
                    className={spacePressed ? 'scripture-canvas-area is-pan-ready' : 'scripture-canvas-area'}
                    onClick={() => handleSelectionChange([ROOT_ID])}
                    onPointerDownCapture={beginCanvasPan}
                    onAuxClick={(event) => event.preventDefault()}
                  >
                    <div
                      className="scripture-canvas-scale-box"
                      style={
                        naturalSize
                          ? { width: naturalSize.width * zoom, height: naturalSize.height * zoom }
                          : undefined
                      }
                    >
                      <div
                        ref={viewportRef}
                        className="scripture-canvas-viewport"
                        style={
                          {
                            transform: `scale(${zoom})`,
                            // Selection/hover strokes live inside this transformed
                            // tree. Counter-scale their local thickness so they
                            // remain one physical screen pixel at every zoom.
                            '--scripture-canvas-stroke': `${1 / Math.max(zoom, MIN_CANVAS_ZOOM)}px`,
                          } as CSSProperties
                        }
                      >
                        <CanvasRoot>
                          {cachedPageIds.map((pageId) => {
                            const pageNumber = resolvePageNumber(pageIds, pageId, pageNumberSettings)
                            return (
                              <CachedCanvasPage
                                key={pageId}
                                pageId={pageId}
                                active={pageId === activePageId}
                                selectedIds={selectedIds}
                                editingId={editingId}
                                pageNumber={pageNumber
                                  ? { number: pageNumber.number, settings: pageNumberSettings }
                                  : undefined}
                                imageEffectPreview={imageEffectPreview}
                                frameNodeProps={sharedFrameNodeProps}
                              />
                            )
                          })}
                        </CanvasRoot>
                      </div>
                    </div>
                  </div>
                  <CanvasPreviewHandoff
                    key={activePageId}
                    pageId={activePageId}
                    variant={activePreviewVariant}
                    visible={!tree || naturalSize === null}
                  />
                  <ZoomControls
                    zoom={zoom}
                    onZoomIn={handleZoomIn}
                    onZoomOut={handleZoomOut}
                    onZoomChange={handleZoomChange}
                    onRecenter={handleRecenter}
                  />
                  {tree && (
                    <CanvasToolbar
                      docId={activePageId as string}
                      tree={tree}
                      selectedIds={selectedIds}
                      onSelectionChange={handleSelectionChange}
                      onSetEditing={setEditingId}
                    />
                  )}
                  <div id="scripture-notification-host" className="scripture-canvas-notices">
                    {backgroundRemovalOperations.map((operation) => (
                      <NotificationChip
                        key={`${operation.docId}:${operation.nodeId}`}
                        busy={operation.status === 'running'}
                        variant={operation.status === 'error'
                          ? 'error'
                          : operation.status === 'success'
                            ? 'success'
                            : 'default'}
                        action={operation.status === 'error' ? (
                          <button
                            type="button"
                            onClick={() => clearBackgroundRemovalState(operation.docId, operation.nodeId)}
                          >
                            Dismiss
                          </button>
                        ) : undefined}
                      >
                        <span className="scripture-notification-operation">
                          <strong>{operation.label}</strong>
                          {operation.status === 'running' && operation.progress != null && (
                            <span
                              className="scripture-notification-progress"
                              role="progressbar"
                              aria-label={operation.label}
                              aria-valuemin={0}
                              aria-valuemax={100}
                              aria-valuenow={operation.progress}
                            >
                              <span style={{ width: `${operation.progress}%` }} />
                            </span>
                          )}
                          {operation.progress != null && <span className="scripture-notification-operation-percent">{operation.progress}%</span>}
                        </span>
                      </NotificationChip>
                    ))}
                    {deleteNotice && (
                      <NotificationChip
                        action={<button type="button" onClick={handleUndoDelete}>Undo</button>}
                      >
                        {deleteNotice.count === 1 ? 'Layer deleted' : `${deleteNotice.count} layers deleted`}
                      </NotificationChip>
                    )}
                    {canvasOverflows && panHintVisible && (
                      <NotificationChip>
                        Hold <kbd className="scripture-keycap">Space</kbd> and drag to pan
                      </NotificationChip>
                    )}
                  </div>
                </div>
                {tree && (
                  <InspectorPanel
                    key={`${activePageId}:${selectedIds.join(',')}`}
                    docId={activePageId as string}
                    tree={tree}
                    selectedIds={selectedIds}
                    onSelectionChange={handleSelectionChange}
                    gutterClickMode={gutterClickMode}
                    onGutterClickModeChange={setGutterClickMode}
                    onOpenCustomize={handleOpenCustomize}
                    onExportPdf={() => handleExport('pdf')}
                    onExportPng={() => handleExport('png')}
                    exporting={exporting}
                    exportError={exportError}
                    pageNumberSettings={pageNumberSettings}
                    onPageNumberSettingsChange={handlePageNumberSettingsChange}
                    pageIds={pageIds}
                    pageNames={pageNames}
                    onImageEffectPreviewChange={setImageEffectPreview}
                  />
                )}
              </>
          </div>
        ) : (
          <RouteLoadingScreen label="Opening project…" />
        )}
        </GeometryRegistryProvider>
      </EditorRegistryProvider>
      {exporting && (
        <>
          <BrowserExportSurfaces
            pageIds={pageIds}
            pageNumberSettings={pageNumberSettings}
            rootRef={exportSurfaceRootRef}
          />
          <div className="scripture-export-overlay" role="status" aria-live="polite" aria-busy="true">
            <div className="scripture-export-progress">
              <LoaderCircle aria-hidden="true" />
              <span>Exporting {exporting.toUpperCase()}…</span>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
