'use client'

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { FrameNode } from '@/components/canvas/frame-node'
import { CanvasRoot } from '@/components/canvas/canvas-root'
import { InspectorPanel } from '@/components/canvas/inspector-panel'
import { ZoomControls } from '@/components/canvas/zoom-controls'
import { CanvasToolbar } from '@/components/canvas/canvas-toolbar'
import { useLayoutTree } from '@/lib/use-layout-tree'
import { getYDoc, encodeDocState, getUndoManager } from '@/lib/yjs/doc-store'
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
  addPage,
  reorderPages,
} from '@/lib/documents/manifest'
import { AppMenubar } from '@/components/layout/app-menubar'
import { EditorRegistryProvider } from '@/components/editor/editor-registry'
import { CustomizeDialog } from '@/components/customize/customize-dialog'
import { LayersPanel } from '@/components/layout/layers-panel'
import { GeometryRegistryProvider } from '@/components/canvas/geometry-registry'
import { deletePage } from '@/lib/documents/delete-service'
import { findNode, findParent } from '@/lib/layout/tree-utils'
import { deleteUploadedImage } from '@/lib/images/client'
import { refreshDocumentPreview } from '@/lib/documents/preview'
import { TEMPLATES, type Template } from '@/lib/templates'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

const ZOOM_MIN = 0.1
const ZOOM_MAX = 4
const ZOOM_STEP = 1.2

function clampZoom(z: number) {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z))
}

export default function DocumentEditorPage() {
  const { docId } = useParams<{ docId: string }>()
  const router = useRouter()
  const [pageIds, setPageIds] = useState<string[]>([])
  const [activePageId, setActivePageId] = useState<string | null>(null)
  const tree = useLayoutTree(activePageId)
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
  const [saveState, setSaveState] = useState<'saving' | 'saved'>('saved')
  const [docName, setDocName] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [gutterClickMode, setGutterClickMode] = useState<GutterClickMode>('highlight')
  const [zoom, setZoom] = useState(1)
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
  const viewportRef = useRef<HTMLDivElement>(null)
  const canvasAreaRef = useRef<HTMLDivElement>(null)
  // Whether this page has already been auto-fit once -- without this guard,
  // the auto-fit effect below (keyed on naturalSize) would refight the
  // user's own manual zoom every time naturalSize changes (e.g. after
  // adding/resizing a block), not just on first load. Reset per page switch.
  const autoFitDoneRef = useRef(false)
  const spacePressedRef = useRef(false)
  const [spacePressed, setSpacePressed] = useState(false)
  const activePanCleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    const meta = getDocumentMeta(docId)
    if (!meta) {
      setNotFound(true)
      return
    }
    setDocName(meta.name)
    const ids = getPageIds(docId)
    setPageIds(ids)
    setActivePageId(ids[0])
  }, [docId])

  useEffect(() => {
    if (notFound) router.replace('/dashboard')
  }, [notFound, router])

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
    void synced.then(() => {
      if (!cancelled) setSaveState('saved')
    })
    const handler = () => {
      setSaveState('saving')
      if (timeout) clearTimeout(timeout)
      timeout = setTimeout(() => {
        touchDocument(docId)
        setSaveState('saved')
        void refreshDocumentPreview(docId)
      }, 800)
    }
    doc.on('update', handler)
    return () => {
      doc.off('update', handler)
      if (timeout) clearTimeout(timeout)
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
      setNaturalSize({ width: el.offsetWidth, height: el.offsetHeight })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [activePageId, tree])

  // React's JSX onWheel prop attaches wheel listeners as passive (the DOM's
  // own recommended default, for scroll-perf reasons) -- calling
  // preventDefault() from inside one is silently ignored, which would let
  // Ctrl/Cmd+scroll ALSO trigger the browser's native page-zoom alongside
  // our own canvas zoom. A manually-attached, explicitly non-passive
  // listener is the only way to actually suppress that.
  useEffect(() => {
    const el = canvasAreaRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      setZoom((z) => clampZoom(e.deltaY > 0 ? z / ZOOM_STEP : z * ZOOM_STEP))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [activePageId, tree])

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
        for (const id of selectedIds) handleRemove(id)
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
    if (activePageId === pageId) handleSwitchPage(next[Math.max(0, pageIds.indexOf(pageId) - 1)])
  }

  function handleReorderPages(next: string[]) {
    reorderPages(docId, next)
    setPageIds(next)
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

  function handleRemove(id: string) {
    if (!activePageId) return
    const node = tree ? findNode(tree, id) : null
    if (node?.kind === 'image' && node.src) {
      void deleteUploadedImage(node.src).catch((cause) => {
        setOperationError(cause instanceof Error ? cause.message : 'The uploaded image could not be removed.')
      })
    }
    removeNode(getYDoc(activePageId).doc, id)
    setSelectedIds((prev) => {
      const next = prev.filter((existing) => existing !== id)
      return next.length > 0 ? next : [ROOT_ID]
    })
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
    area.dataset.panning = 'true'
    const onMove = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return
      event.preventDefault()
      area.scrollLeft = startLeft - (event.clientX - startX)
      area.scrollTop = startTop - (event.clientY - startY)
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
    setZoom((z) => clampZoom(z * ZOOM_STEP))
  }
  function handleZoomOut() {
    setZoom((z) => clampZoom(z / ZOOM_STEP))
  }
  function handleZoomReset() {
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

  // Fits the card to the available canvas area (leaving room for its own
  // CSS padding, so the fitted card doesn't touch the very edge) and
  // centers the scroll position on it. A flat 100% can look tiny on a large
  // or high-DPI screen for an otherwise modest-sized card -- fitting scales
  // to the actual viewport instead of a fixed percentage.
  function handleRecenter() {
    const area = canvasAreaRef.current
    if (!area || !naturalSize || naturalSize.width === 0 || naturalSize.height === 0) return
    const CANVAS_PADDING = 56 // matches .scripture-canvas-area's own CSS padding
    const availableWidth = area.clientWidth - CANVAS_PADDING * 2
    const availableHeight = area.clientHeight - CANVAS_PADDING * 2
    if (availableWidth <= 0 || availableHeight <= 0) return
    // Capped at 1 -- a small or still-empty document (e.g. right after
    // creation) shouldn't get blown up to fill the viewport, only large
    // content should ever get scaled DOWN to fit.
    setZoom(clampZoom(Math.min(1, availableWidth / naturalSize.width, availableHeight / naturalSize.height)))
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

  // Auto-fit once per page, the first time its natural size becomes known --
  // replaces a flat, possibly-tiny-looking 100% default with a size that
  // actually fills the available canvas area on load.
  useEffect(() => {
    autoFitDoneRef.current = false
  }, [activePageId])

  useEffect(() => {
    if (autoFitDoneRef.current || !naturalSize) return
    autoFitDoneRef.current = true
    handleRecenter()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [naturalSize])

  async function handleExport(format: 'pdf' | 'png') {
    setExporting(format)
    setExportError(null)
    try {
      // Every page is saved before export, in order -- the export route
      // stitches them into one multi-page PDF (or, for PNG, renders just
      // the first page -- a flat image can't be "multi-page") via
      // app/api/export/route.ts.
      for (const pageId of pageIds) {
        const { doc } = getYDoc(pageId)
        const data = encodeDocState(doc)
        const saveRes = await fetch(`/api/documents/${pageId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data }),
        })
        if (!saveRes.ok) throw new Error(`Failed to save page (${saveRes.status})`)
      }

      const exportRes = await fetch(`/api/export?pages=${pageIds.join(',')}&format=${format}`)
      if (!exportRes.ok) {
        const message = await exportRes.text().catch(() => '')
        throw new Error(message || `Failed to export (${exportRes.status})`)
      }

      const blob = await exportRes.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${docName || 'scripture'}.${format}`
      a.click()
      URL.revokeObjectURL(url)
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

        {tree ? (
          <div className="scripture-workspace" key={activePageId}>
            <LayersPanel
              tree={tree}
              pageIds={pageIds}
              activePageId={activePageId as string}
              selectedIds={selectedIds}
              onAddPage={handleAddPage}
              onSelectPage={handleSwitchPage}
              onDeletePage={handleRemovePage}
              onReorderPages={handleReorderPages}
              onSelectNode={handleSelect}
              onReorderNode={handleReorder}
            />
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
                    />
                  </CanvasRoot>
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
            />
          </div>
        ) : (
          <div className="scripture-editor-loading">Loading…</div>
        )}
        </GeometryRegistryProvider>
      </EditorRegistryProvider>
    </div>
  )
}
