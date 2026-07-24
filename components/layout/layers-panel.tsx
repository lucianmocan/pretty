'use client'

import { useEffect, useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  FileCode,
  Frame,
  Image as ImageIcon,
  Layers3,
  Plus,
  Search,
  Trash2,
  Type,
} from 'lucide-react'
import type { LayoutNode } from '@/lib/layout/types'
import { updateNodeLabel } from '@/lib/yjs/layout-store'
import { getYDoc } from '@/lib/yjs/doc-store'
import { useEditorRegistry } from '@/components/editor/editor-registry'
import { Button } from '@/components/ui/button'
import { SearchReplacePanel } from '@/components/editor/search-replace-panel'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

const PANEL_COLLAPSED_KEY = 'scripture:layers-panel-collapsed'
const PANEL_WIDTH_KEY = 'scripture:layers-panel-width'
const TREE_EXPANSION_KEY = 'scripture:layers-tree-expanded'
const LAYER_DRAG_TYPE = 'application/x-scripture-layer-id'
const PAGE_DRAG_TYPE = 'application/x-scripture-page-id'

function fallbackLabel(node: LayoutNode, editorText?: string): string {
  if (node.label?.trim()) return node.label.trim()
  if (node.kind === 'code') return node.filename?.trim() || `${node.language || 'Code'} block`
  if (node.kind === 'text') {
    const snippet = editorText?.replace(/\s+/g, ' ').trim()
    return snippet ? snippet.slice(0, 36) : 'Text block'
  }
  if (node.kind === 'image') return node.alt?.trim() || 'Image'
  return node.id === 'root' ? 'Canvas' : 'Frame'
}

function LayerIcon({ kind }: { kind: LayoutNode['kind'] }) {
  if (kind === 'frame') return <Frame />
  if (kind === 'code') return <FileCode />
  if (kind === 'image') return <ImageIcon />
  return <Type />
}

function LayerRow({
  node,
  depth,
  docId,
  selectedIds,
  expanded,
  onToggle,
  onSelect,
  onReorder,
}: {
  node: LayoutNode
  depth: number
  docId: string
  selectedIds: string[]
  expanded: Set<string>
  onToggle: (id: string) => void
  onSelect: (id: string, additive: boolean) => void
  onReorder: (draggedId: string, targetId: string) => void
}) {
  const registry = useEditorRegistry()
  const [editing, setEditing] = useState(false)
  const children = node.children ?? []
  const isExpanded = expanded.has(node.id)
  const label = fallbackLabel(node, registry.getAll().get(node.id)?.getText())

  function commit(value: string) {
    updateNodeLabel(getYDoc(docId).doc, node.id, value)
    setEditing(false)
  }

  return (
    <li role="treeitem" aria-selected={selectedIds.includes(node.id)} aria-expanded={children.length ? isExpanded : undefined}>
      <div
        className={selectedIds.includes(node.id) ? 'scripture-layer-row is-selected' : 'scripture-layer-row'}
        style={{ paddingLeft: 6 + depth * 14 }}
        draggable={node.id !== 'root'}
        onDragStart={(event) => {
          event.dataTransfer.setData(LAYER_DRAG_TYPE, node.id)
          event.dataTransfer.effectAllowed = 'move'
        }}
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes(LAYER_DRAG_TYPE)) event.preventDefault()
        }}
        onDrop={(event) => {
          const draggedId = event.dataTransfer.getData(LAYER_DRAG_TYPE)
          if (draggedId) {
            event.preventDefault()
            onReorder(draggedId, node.id)
          }
        }}
      >
        {children.length > 0 ? (
          <button
            type="button"
            className="scripture-layer-disclosure"
            onClick={() => onToggle(node.id)}
            aria-label={isExpanded ? `Collapse ${label}` : `Expand ${label}`}
          >
            {isExpanded ? <ChevronDown /> : <ChevronRight />}
          </button>
        ) : (
          <span className="scripture-layer-disclosure" />
        )}
        <LayerIcon kind={node.kind} />
        {editing ? (
          <input
            autoFocus
            className="scripture-layer-label-input"
            defaultValue={node.label ?? label}
            onBlur={(event) => commit(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur()
              if (event.key === 'Escape') setEditing(false)
            }}
          />
        ) : (
          <button
            type="button"
            className="scripture-layer-label"
            onClick={(event) => onSelect(node.id, event.shiftKey || event.metaKey || event.ctrlKey)}
            onDoubleClick={() => setEditing(true)}
            title={label}
          >
            {label}
          </button>
        )}
      </div>
      {children.length > 0 && isExpanded && (
        <ul role="group">
          {children.map((child) => (
            <LayerRow
              key={child.id}
              node={child}
              depth={depth + 1}
              docId={docId}
              selectedIds={selectedIds}
              expanded={expanded}
              onToggle={onToggle}
              onSelect={onSelect}
              onReorder={onReorder}
            />
          ))}
        </ul>
      )}
    </li>
  )
}

export function LayersPanel({
  tree,
  pageIds,
  activePageId,
  selectedIds,
  onAddPage,
  onSelectPage,
  onDeletePage,
  onReorderPages,
  onSelectNode,
  onReorderNode,
}: {
  tree: LayoutNode
  pageIds: string[]
  activePageId: string
  selectedIds: string[]
  onAddPage: () => void
  onSelectPage: (pageId: string) => void
  onDeletePage: (pageId: string) => Promise<void>
  onReorderPages: (pageIds: string[]) => void
  onSelectNode: (id: string, additive: boolean) => void
  onReorderNode: (draggedId: string, targetId: string) => void
}) {
  const [collapsed, setCollapsed] = useState(false)
  const [panelWidth, setPanelWidth] = useState(240)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(['root']))
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)

  useEffect(() => {
    setCollapsed(localStorage.getItem(PANEL_COLLAPSED_KEY) === 'true')
    const storedWidth = Number(localStorage.getItem(PANEL_WIDTH_KEY))
    if (Number.isFinite(storedWidth) && storedWidth >= 200 && storedWidth <= 360) setPanelWidth(storedWidth)
    try {
      const stored = JSON.parse(localStorage.getItem(TREE_EXPANSION_KEY) || '[]')
      if (Array.isArray(stored)) setExpanded(new Set(['root', ...stored]))
    } catch {
      // Ignore malformed local UI preferences.
    }
  }, [])

  function togglePanel() {
    setCollapsed((value) => {
      localStorage.setItem(PANEL_COLLAPSED_KEY, String(!value))
      return !value
    })
  }

  function toggleExpanded(id: string) {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      next.add('root')
      localStorage.setItem(TREE_EXPANSION_KEY, JSON.stringify(Array.from(next)))
      return next
    })
  }

  function beginResize(event: React.PointerEvent) {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = panelWidth
    const onMove = (moveEvent: PointerEvent) => {
      const next = Math.min(360, Math.max(200, startWidth + moveEvent.clientX - startX))
      setPanelWidth(next)
    }
    const onUp = (upEvent: PointerEvent) => {
      const next = Math.min(360, Math.max(200, startWidth + upEvent.clientX - startX))
      localStorage.setItem(PANEL_WIDTH_KEY, String(next))
      cleanup()
    }
    function cleanup() {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    setDeleting(true)
    setError(null)
    try {
      await onDeletePage(pendingDelete)
      setPendingDelete(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not delete the page.')
    } finally {
      setDeleting(false)
    }
  }

  if (collapsed) {
    return (
      <aside className="scripture-layers-panel is-collapsed" aria-label="Pages and layers">
        <Button variant="ghost" size="icon-sm" onClick={togglePanel} aria-label="Expand Pages and Layers">
          <ChevronsRight />
        </Button>
      </aside>
    )
  }

  return (
    <aside
      className="scripture-layers-panel"
      aria-label="Pages and layers"
      style={{ width: panelWidth, minWidth: panelWidth }}
    >
      <div className="scripture-panel-heading">
        <span>Pages & Layers</span>
        <Button variant="ghost" size="icon-xs" onClick={togglePanel} aria-label="Collapse Pages and Layers">
          <ChevronsLeft />
        </Button>
      </div>

      <section className="scripture-layers-section" aria-labelledby="pages-heading">
        <div className="scripture-section-heading">
          <h2 id="pages-heading">Pages</h2>
          <Button variant="ghost" size="icon-xs" onClick={onAddPage} aria-label="Add page">
            <Plus />
          </Button>
        </div>
        <ol className="scripture-pages-list">
          {pageIds.map((pageId, index) => (
            <li
              key={pageId}
              className={pageId === activePageId ? 'scripture-page-row is-active' : 'scripture-page-row'}
              draggable
              onDragStart={(event) => event.dataTransfer.setData(PAGE_DRAG_TYPE, pageId)}
              onDragOver={(event) => {
                if (event.dataTransfer.types.includes(PAGE_DRAG_TYPE)) event.preventDefault()
              }}
              onDrop={(event) => {
                const draggedId = event.dataTransfer.getData(PAGE_DRAG_TYPE)
                if (!draggedId || draggedId === pageId) return
                event.preventDefault()
                const next = pageIds.filter((id) => id !== draggedId)
                next.splice(next.indexOf(pageId), 0, draggedId)
                onReorderPages(next)
              }}
            >
              <button type="button" className="scripture-page-row-label" onClick={() => onSelectPage(pageId)}>
                <FileCode />
                Page {index + 1}
              </button>
              <Button
                variant="ghost"
                size="icon-xs"
                disabled={pageIds.length <= 1}
                onClick={() => setPendingDelete(pageId)}
                aria-label={`Delete page ${index + 1}`}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ol>
        {error && <p className="scripture-panel-error" role="alert">{error}</p>}
      </section>

      <section className="scripture-layers-section is-tree" aria-labelledby="layers-heading">
        <div className="scripture-section-heading">
          <h2 id="layers-heading">Layers</h2>
          <div className="scripture-section-heading-actions">
            <Button
              variant={searchOpen ? 'secondary' : 'ghost'}
              size="icon-xs"
              onClick={() => setSearchOpen((value) => !value)}
              aria-label="Find and replace"
              aria-expanded={searchOpen}
            >
              <Search />
            </Button>
            <Layers3 />
          </div>
        </div>
        {searchOpen && (
          <SearchReplacePanel
            sidebar
            onClose={() => setSearchOpen(false)}
            onSelectMatch={(blockId) => onSelectNode(blockId, false)}
          />
        )}
        <ul className="scripture-layers-tree" role="tree" aria-label="Document layers">
          <LayerRow
            node={tree}
            depth={0}
            docId={activePageId}
            selectedIds={selectedIds}
            expanded={expanded}
            onToggle={toggleExpanded}
            onSelect={onSelectNode}
            onReorder={onReorderNode}
          />
        </ul>
      </section>

      <AlertDialog open={pendingDelete != null} onOpenChange={(open) => !open && !deleting && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this page?</AlertDialogTitle>
            <AlertDialogDescription>
              Its blocks, local history, saved export data, and uploaded images will be removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={deleting} onClick={(event) => {
              event.preventDefault()
              void confirmDelete()
            }}>
              {deleting ? 'Deleting…' : 'Delete page'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <div
        className="scripture-panel-resize-handle"
        onPointerDown={beginResize}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize Pages and Layers panel"
      />
    </aside>
  )
}
