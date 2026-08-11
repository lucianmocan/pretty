'use client'

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { LoaderCircle, Plus } from 'lucide-react'
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
  seedRootFrame,
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
import { deleteUploadedImage } from '@/lib/images/client'
import { TEMPLATES, type Template } from '@/lib/templates'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { NotificationChip } from '@/components/ui/notification-chip'

const ZOOM_MIN = 0.1
const ZOOM_MAX = 2
const ZOOM_STEP = 1.05

function clampZoom(z: number) {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z))
}

export default function DocumentEditorPage() {
  const { docId } = useParams<{ docId: string }>()
  const router = useRouter()
  const [pageIds, setPageIds] = useState<string[]>([])
  const [pageNames, setPageNames] = useState<Record<string, string>>({})
  const [pageNumberSettings, setPageNumberSettings] = useState<PageNumberSettings>(DEFAULT_PAGE_NUMBER_SETTINGS)
  const [activePageId, setActivePageId] = useState<string | null>(null)
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
  const [zoom, setZoom] = useState(1)
  const zoomRef = useRef(1)
  const previousZoomRef = useRef(1)
  const [customizeOpen, setCustomizeOpen] = useState(false)
  const [showStarterPicker, setShowStarterPicker] = useState(false)
  const [applyingTemplate, setApplyingTemplate] = useState(false)
  const [starterError, setStarterError] = useState<string | null>(null)
  // Which Customize tab to land on -- the Inspector's theme-picker "+" and
  // window-chrome-section "+" (components/canvas/inspector-panel.tsx) both
  // open this same dialog instance, to different tabs.
  const [customizeTab, setCustomizeTab] = useState<'syntax' | 'chrome'>('syntax')
  // The natural (unscaled) content size of .scripture-canvas-viewport --
  // used to size .scripture-canvas-scale-box to the SCALED dimensions, so
  // the scrollable canvas area's scroll bounds actually grow/shrink with
  // zoom (a `transform: scale()` alone doesn't affect layout/scroll size).
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null)
  const naturalSizeRef = useRef<{ width: number; height: number } | null>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const canvasAreaRef = useRef<HTMLDivElement>(null)
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
  // the whole Y.Doc regardless of which shared type changed. Only one
  // page's components are ever mounted/edited at a time, so watching just
  // that page's doc is sufficient.
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

  useEffect(() => {
    if (tree && selectedIds.length === 0) setSelectedIds([ROOT_ID])
  }, [tree, selectedIds])

  // Track the canvas content's natural (unscaled) size -- read from the
  // inner .scripture-canvas-viewport, which is never itself transformed by
  // its own scale, so offsetWidth/offsetHeight are always true content
  // units regardless of the current zoom.
  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const observer = new ResizeObserver(() => {
      const size = { width: el.offsetWidth, height: el.offsetHeight }
      naturalSizeRef.current = size
      setNaturalSize(size)
    })
    observer.observe(el)
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

  // React's JSX onWheel prop attaches wheel listeners as passive (the DOM's
  // own recommended default, for scroll-perf reasons) -- calling
  // preventDefault() from inside one is silently ignored, which would let
  // Ctrl/Cmd+scroll ALSO trigger the browser's native page-zoom alongside
  // our own canvas zoom. A manually-attached, explicitly non-passive
  // listener is the only way to actually suppress that.
  useEffect(() => {
    const el = canvasAreaRef.current
    if (!el) return
    let accumulatedZoomDelta = 0
    let zoomFrame: number | null = null
    let scrollFrame: number | null = null
    let pointerX = 0
    let pointerY = 0
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) {
        if (e.deltaX !== 0 || e.deltaY !== 0) setPanHintVisible(false)
        return
      }
      e.preventDefault()
      fitModeRef.current = false
      pointerX = e.clientX
      pointerY = e.clientY
      // d3-zoom's battle-tested wheel normalization: account for the unit
      // the browser reports, boost synthetic ctrl-wheel trackpad pinches,
      // then apply the result as an exponent of two below.
      accumulatedZoomDelta +=
        -e.deltaY *
        (e.deltaMode === WheelEvent.DOM_DELTA_LINE ? 0.05 : e.deltaMode ? 1 : 0.002) *
        (e.ctrlKey || e.metaKey ? 10 : 1)
      if (zoomFrame != null) return
      zoomFrame = requestAnimationFrame(() => {
        const delta = accumulatedZoomDelta
        accumulatedZoomDelta = 0
        zoomFrame = null
        // Exponential scaling makes equal trackpad movement feel equal at
        // every zoom level. Small pinch deltas stay small instead of every
        // wheel event causing the old fixed 20% jump.
        const current = zoomRef.current
        const next = clampZoom(current * 2 ** delta)
        const scaleBox = viewportRef.current?.parentElement
        const boxRect = scaleBox?.getBoundingClientRect()
        const anchorX = boxRect ? (pointerX - boxRect.left) / current : 0
        const anchorY = boxRect ? (pointerY - boxRect.top) / current : 0
        zoomRef.current = next
        setZoom(next)

        // Preserve the canvas-space point under the gesture. This is the
        // part that makes pinch zoom feel like Figma instead of making the
        // document jump toward its transform origin on every update.
        if (scaleBox && boxRect && next !== current) {
          if (scrollFrame != null) cancelAnimationFrame(scrollFrame)
          scrollFrame = requestAnimationFrame(() => {
            scrollFrame = null
            const nextRect = scaleBox.getBoundingClientRect()
            el.scrollLeft += nextRect.left + anchorX * next - pointerX
            el.scrollTop += nextRect.top + anchorY * next - pointerY
          })
        }
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      el.removeEventListener('wheel', onWheel)
      if (zoomFrame != null) cancelAnimationFrame(zoomFrame)
      if (scrollFrame != null) cancelAnimationFrame(scrollFrame)
    }
  }, [activePageId, treeMounted])

  // The hint is useful only once the scaled canvas is larger than its
  // viewport. Observe both boxes because either zoom/layout changes or a
  // sidebar/window resize can cross that boundary.
  useEffect(() => {
    const area = canvasAreaRef.current
    const scaleBox = area?.querySelector<HTMLElement>('.scripture-canvas-scale-box')
    if (!area || !scaleBox) return
    const updateOverflow = () => {
      const next = area.scrollWidth > area.clientWidth + 1 || area.scrollHeight > area.clientHeight + 1
      if (next === canvasOverflowsRef.current) return
      canvasOverflowsRef.current = next
      setCanvasOverflows(next)
      setPanHintVisible(next)
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
    if (zoom <= previousZoom) return
    const frame = requestAnimationFrame(() => {
      const area = canvasAreaRef.current
      if (!area) return
      const overflows = area.scrollWidth > area.clientWidth + 1 || area.scrollHeight > area.clientHeight + 1
      if (overflows) setPanHintVisible(true)
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

  // Switching pages: the new page's tree hasn't loaded yet, so clear
  // selection now -- the effect above re-selects ROOT_ID once it has.
  function handleSwitchPage(pageId: string) {
    if (pageId === activePageId) return
    void preloadLayoutTree(pageId)
    activePanCleanupRef.current?.()
    autoFitDoneRef.current = false
    fitModeRef.current = true
    naturalSizeRef.current = null
    setNaturalSize(null)
    setActivePageId(pageId)
    setSelectedIds([])
    setEditingId(null)
  }

  function handleAddPage() {
    const pageId = addPage(docId)
    setPageIds((prev) => [...prev, pageId])
    handleSwitchPage(pageId)
  }

  async function handleRemovePage(pageId: string) {
    await deletePage(docId, pageId)
    const next = pageIds.filter((id) => id !== pageId)
    setPageIds(next)
    setPageNames((current) => {
      const nextNames = { ...current }
      delete nextNames[pageId]
      return nextNames
    })
    setPageNumberSettings(getPageNumberSettings(docId))
    if (activePageId === pageId) handleSwitchPage(next[Math.max(0, pageIds.indexOf(pageId) - 1)])
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

  function queueImageDelete(src: string) {
    if (pendingImageDeleteTimersRef.current.has(src)) return
    const timeout = window.setTimeout(() => {
      pendingImageDeleteTimersRef.current.delete(src)
      void deleteUploadedImage(src).catch((cause) => {
        setOperationError(cause instanceof Error ? cause.message : 'The uploaded image could not be removed.')
      })
    }, 5500)
    pendingImageDeleteTimersRef.current.set(src, timeout)
  }

  function imageSources(node: ReturnType<typeof findNode>): string[] {
    if (!node) return []
    return [
      ...(node.kind === 'image' && node.src ? [node.src] : []),
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
    for (const src of queuedImageSources) queueImageDelete(src)
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

  function handleZoomIn() {
    fitModeRef.current = false
    setZoom((z) => clampZoom(z * ZOOM_STEP))
  }
  function handleZoomOut() {
    fitModeRef.current = false
    setZoom((z) => clampZoom(z / ZOOM_STEP))
  }
  function handleZoomReset() {
    fitModeRef.current = false
    setZoom(1)
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
    if (!area || !size || size.width === 0 || size.height === 0) return
    const style = getComputedStyle(area)
    const horizontalPadding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight)
    const verticalPadding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom)
    const availableWidth = area.clientWidth - horizontalPadding
    const availableHeight = area.clientHeight - verticalPadding
    if (availableWidth <= 0 || availableHeight <= 0) return
    // "Fit" may shrink an oversized canvas, but it must never silently turn
    // into magnification. Authored dimensions should be shown at 100% on a
    // roomy viewport; zooming above that is always an explicit user action.
    setZoom(clampZoom(Math.min(1, availableWidth / size.width, availableHeight / size.height)))
    // Scroll centering needs the NEW zoom's layout to have actually
    // committed first (scrollWidth/Height below depend on it) -- a
    // requestAnimationFrame callback runs after React's render/commit but
    // before the next paint, so by then the DOM reflects the new zoom.
    requestAnimationFrame(() => {
      const el = canvasAreaRef.current
      if (!el) return
      el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2
      el.scrollTop = (el.scrollHeight - el.clientHeight) / 2
    })
  }

  function handleRecenter() {
    fitModeRef.current = true
    fitCanvasToViewport()
  }

  // Auto-fit once per page, the first time its natural size becomes known.
  // Large canvases shrink to remain visible; smaller ones stay at their
  // authored 100% size rather than being unexpectedly magnified.
  useEffect(() => {
    autoFitDoneRef.current = false
    fitModeRef.current = true
    naturalSizeRef.current = null
  }, [activePageId])

  useEffect(() => {
    if (autoFitDoneRef.current || !naturalSizeRef.current) return
    autoFitDoneRef.current = true
    fitModeRef.current = true
    fitCanvasToViewport()
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
            {tree ? (
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
                            '--scripture-canvas-stroke': `${1 / Math.max(zoom, 0.01)}px`,
                          } as CSSProperties
                        }
                      >
                        <CanvasRoot>
                          <FrameNode
                            key={activePageId}
                            node={tree}
                            docId={activePageId as string}
                            selectedIds={selectedIds}
                            onSelect={handleSelect}
                            onSelectionChange={handleSelectionChange}
                            onMove={handleMove}
                            onDuplicate={handleDuplicate}
                            onRemove={handleRemove}
                            onReorder={handleReorder}
                            onResizeNode={handleResizeNode}
                            onRepositionNode={handleRepositionNode}
                            parentChildLayout="flex"
                            gutterClickMode={gutterClickMode}
                            onGutterClick={handleGutterClick}
                            zoom={zoom}
                            editingId={editingId}
                            onSetEditing={setEditingId}
                            parentId={null}
                            onAddBlockToFrame={handleAddBlockToFrame}
                            pageNumber={activePageNumber
                              ? { number: activePageNumber.number, settings: pageNumberSettings }
                              : undefined}
                          />
                        </CanvasRoot>
                      </div>
                    </div>
                  </div>
                  <ZoomControls
                    zoom={zoom}
                    onZoomIn={handleZoomIn}
                    onZoomOut={handleZoomOut}
                    onReset={handleZoomReset}
                    onRecenter={handleRecenter}
                  />
                  <CanvasToolbar
                    docId={activePageId as string}
                    tree={tree}
                    selectedIds={selectedIds}
                    onSelectionChange={handleSelectionChange}
                    onSetEditing={setEditingId}
                  />
                  <div id="scripture-notification-host" className="scripture-canvas-notices">
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
                <InspectorPanel
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
                  onSetEditing={setEditingId}
                  pageNumberSettings={pageNumberSettings}
                  onPageNumberSettingsChange={handlePageNumberSettingsChange}
                  pageIds={pageIds}
                  pageNames={pageNames}
                />
              </>
            ) : (
              <RouteLoadingScreen label="Opening page…" />
            )}
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
