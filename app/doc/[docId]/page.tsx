'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Plus, X } from 'lucide-react'
import { FrameNode } from '@/components/canvas/frame-node'
import { CanvasRoot } from '@/components/canvas/canvas-root'
import { InspectorPanel } from '@/components/canvas/inspector-panel'
import { ZoomControls } from '@/components/canvas/zoom-controls'
import { CanvasToolbar } from '@/components/canvas/canvas-toolbar'
import { useLayoutTree } from '@/lib/use-layout-tree'
import { getYDoc, encodeDocState } from '@/lib/yjs/doc-store'
import {
  moveNode,
  removeNode,
  moveNodeBeforeSibling,
  updateNodeSize,
  updateNodePosition,
  cycleGutterLine,
  ROOT_ID,
  type GutterClickMode,
} from '@/lib/yjs/layout-store'
import {
  getDocumentMeta,
  renameDocument,
  touchDocument,
  getPageIds,
  addPage,
  removePage,
} from '@/lib/documents/manifest'
import { AppMenubar } from '@/components/layout/app-menubar'
import { EditorRegistryProvider } from '@/components/editor/editor-registry'
import { SearchReplacePanel } from '@/components/editor/search-replace-panel'
import { CustomizeDialog } from '@/components/customize/customize-dialog'
import { Button } from '@/components/ui/button'

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
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const [docName, setDocName] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [gutterClickMode, setGutterClickMode] = useState<GutterClickMode>('highlight')
  const [zoom, setZoom] = useState(1)
  const [customizeOpen, setCustomizeOpen] = useState(false)
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
    if (notFound) router.replace('/')
  }, [notFound, router])

  // Bump "last updated" on any change to the ACTIVE page -- layout tree or
  // any block's content -- doc.on('update') fires for every transaction on
  // the whole Y.Doc regardless of which shared type changed. Only one
  // page's components are ever mounted/edited at a time, so watching just
  // that page's doc is sufficient.
  useEffect(() => {
    if (!activePageId) return
    const { doc } = getYDoc(activePageId)
    let timeout: ReturnType<typeof setTimeout> | null = null
    const handler = () => {
      if (timeout) clearTimeout(timeout)
      timeout = setTimeout(() => touchDocument(docId), 800)
    }
    doc.on('update', handler)
    return () => {
      doc.off('update', handler)
      if (timeout) clearTimeout(timeout)
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

  // Delete/Backspace removes the current selection -- the Figma-style
  // direct-manipulation model has no floating Delete button to fall back on
  // for canvas-mode blocks anymore. Guarded on the active element NOT being
  // a real text input/contenteditable, so this never fires while the user
  // is genuinely typing (in a code/text block mid-edit, the Inspector's
  // Filename field, the search/replace box, etc) -- only when a block is
  // merely *selected*.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      const active = document.activeElement
      const tag = active?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || active?.getAttribute('contenteditable') === 'true') return
      if (selectedIds.length === 0 || selectedIds.includes(ROOT_ID)) return
      e.preventDefault()
      for (const id of selectedIds) handleRemove(id)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds, activePageId])

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

  function handleRemovePage(pageId: string) {
    if (pageIds.length <= 1) return
    removePage(docId, pageId)
    const next = pageIds.filter((id) => id !== pageId)
    setPageIds(next)
    if (activePageId === pageId) handleSwitchPage(next[0])
    fetch(`/api/documents/${pageId}`, { method: 'DELETE' }).catch(() => {})
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

  function handleRemove(id: string) {
    if (!activePageId) return
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

  function handleResizeNode(id: string, size: { width: number; height: number }) {
    if (!activePageId) return
    updateNodeSize(getYDoc(activePageId).doc, id, size)
  }

  function handleRepositionNode(id: string, position: { x: number; y: number }) {
    if (!activePageId) return
    updateNodePosition(getYDoc(activePageId).doc, id, position)
  }

  function handleGutterClick(blockId: string, lineNumber: number) {
    if (!activePageId) return
    cycleGutterLine(getYDoc(activePageId).doc, blockId, lineNumber, gutterClickMode)
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
    setZoom(clampZoom(Math.min(availableWidth / naturalSize.width, availableHeight / naturalSize.height)))
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
    setExporting(true)
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
      setExporting(false)
    }
  }

  if (notFound) return null

  return (
    <div className="scripture-editor-shell">
      <EditorRegistryProvider>
        <AppMenubar
          docName={docName ?? ''}
          onRename={handleRename}
          onAddPage={handleAddPage}
          onExportPdf={() => handleExport('pdf')}
          onExportPng={() => handleExport('png')}
          exporting={exporting}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onZoomReset={handleZoomReset}
          onRecenter={handleRecenter}
          onOpenCustomize={() => setCustomizeOpen(true)}
        >
          <SearchReplacePanel />
          {exporting && <span className="text-xs text-muted-foreground">Exporting…</span>}
          {exportError && <span className="scripture-error-text">{exportError}</span>}
        </AppMenubar>

        <CustomizeDialog open={customizeOpen} onOpenChange={setCustomizeOpen} />

        {pageIds.length > 0 && (
          <div className="scripture-page-tabs">
            {pageIds.map((pageId, index) => (
              <button
                key={pageId}
                type="button"
                className={pageId === activePageId ? 'scripture-page-tab is-active' : 'scripture-page-tab'}
                onClick={() => handleSwitchPage(pageId)}
              >
                Page {index + 1}
                {pageIds.length > 1 && (
                  <span
                    className="scripture-page-tab-remove"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleRemovePage(pageId)
                    }}
                    aria-label={`Remove page ${index + 1}`}
                  >
                    <X size={12} />
                  </span>
                )}
              </button>
            ))}
            <Button variant="ghost" size="icon-xs" onClick={handleAddPage} aria-label="Add page">
              <Plus />
            </Button>
          </div>
        )}

        {tree ? (
          <div className="scripture-workspace" key={activePageId}>
            <div
              ref={canvasAreaRef}
              className="scripture-canvas-area"
              onClick={() => handleSelectionChange([ROOT_ID])}
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
                  style={{ transform: `scale(${zoom})` }}
                >
                  <CanvasRoot>
                    <FrameNode
                      node={tree}
                      docId={activePageId as string}
                      selectedIds={selectedIds}
                      onSelect={handleSelect}
                      onMove={handleMove}
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
            />
          </div>
        ) : (
          <div className="scripture-editor-loading">Loading…</div>
        )}
      </EditorRegistryProvider>
    </div>
  )
}
