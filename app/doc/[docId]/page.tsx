'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Plus, X } from 'lucide-react'
import { FrameNode } from '@/components/canvas/frame-node'
import { CanvasRoot } from '@/components/canvas/canvas-root'
import { InspectorPanel } from '@/components/canvas/inspector-panel'
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
import { PageToolbar } from '@/components/layout/page-toolbar'
import { EditorRegistryProvider } from '@/components/editor/editor-registry'
import { SearchReplacePanel } from '@/components/editor/search-replace-panel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function DocumentEditorPage() {
  const { docId } = useParams<{ docId: string }>()
  const router = useRouter()
  const [pageIds, setPageIds] = useState<string[]>([])
  const [activePageId, setActivePageId] = useState<string | null>(null)
  const tree = useLayoutTree(activePageId)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const [docName, setDocName] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [gutterClickMode, setGutterClickMode] = useState<GutterClickMode>('highlight')

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

  // Switching pages: the new page's tree hasn't loaded yet, so clear
  // selection now -- the effect above re-selects ROOT_ID once it has.
  function handleSwitchPage(pageId: string) {
    setActivePageId(pageId)
    setSelectedIds([])
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

  function handleSelect(id: string, additive: boolean) {
    setSelectedIds((prev) => {
      if (!additive) return [id]
      return prev.includes(id) ? prev.filter((existing) => existing !== id) : [...prev, id]
    })
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
    <div className="scripture-page">
      <main className="flex flex-col items-center w-full max-w-[1100px]">
        <EditorRegistryProvider>
          <PageToolbar>
            <Link
              href="/"
              className="flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft size={15} />
              Documents
            </Link>
            <Input
              className="max-w-56 border-transparent bg-transparent text-base font-medium shadow-none focus-visible:border-input"
              value={docName ?? ''}
              onChange={(e) => handleRename(e.target.value)}
              placeholder="Untitled"
            />
            <div className="ml-auto flex items-center gap-2">
              <SearchReplacePanel />
              <Button variant="outline" onClick={() => handleExport('png')} disabled={exporting}>
                PNG
              </Button>
              <Button onClick={() => handleExport('pdf')} disabled={exporting}>
                {exporting ? 'Exporting…' : 'Export PDF'}
              </Button>
            </div>
            {exportError && <span className="scripture-error-text">{exportError}</span>}
          </PageToolbar>

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
            <div className="scripture-app-layout" key={activePageId}>
              <div className="scripture-canvas-area" onClick={() => setSelectedIds([ROOT_ID])}>
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
                  />
                </CanvasRoot>
              </div>
              <InspectorPanel
                docId={activePageId as string}
                tree={tree}
                selectedIds={selectedIds}
                onSelectionChange={setSelectedIds}
                gutterClickMode={gutterClickMode}
                onGutterClickModeChange={setGutterClickMode}
              />
            </div>
          ) : (
            <div className="scripture-editor-loading">Loading…</div>
          )}
        </EditorRegistryProvider>
      </main>
    </div>
  )
}
