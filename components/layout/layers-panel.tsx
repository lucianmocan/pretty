'use client'

import { memo, useEffect, useRef, useState, type ReactElement } from 'react'
import type { Transaction } from 'yjs'
import { ContextMenu as ContextMenuPrimitive, DropdownMenu as DropdownMenuPrimitive } from 'radix-ui'
import {
  ChevronDown,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  FileCode,
  Frame,
  Image as ImageIcon,
  Layers3,
  LayoutGrid,
  MoreHorizontal,
  Pencil,
  Plus,
  Copy,
  Search,
  Trash2,
  Type,
} from 'lucide-react'
import type { LayoutNode } from '@/lib/layout/types'
import type { PageNumberSettings } from '@/lib/documents/manifest'
import { resolvePageNumber } from '@/lib/documents/page-numbers'
import { updateNodeLabel } from '@/lib/yjs/layout-store'
import { getYDoc, LAYOUT_MAP } from '@/lib/yjs/doc-store'
import { preloadLayoutTree } from '@/lib/use-layout-tree'
import { PagePreviewSurface } from '@/components/export/page-preview-surface'
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
const PAGES_VIEW_MODE_KEY = 'scripture:pages-view-mode'
const PAGES_HEIGHT_KEY = 'scripture:pages-height'
const LAYER_DRAG_TYPE = 'application/x-scripture-layer-id'
const PAGE_DRAG_TYPE = 'application/x-scripture-page-id'
const DEFAULT_PAGES_HEIGHT = 216
const MIN_PAGES_HEIGHT = 96
const MIN_LAYERS_HEIGHT = 140
const MIN_PANEL_WIDTH = 200
const MAX_PANEL_WIDTH = 360
const RESIZE_KEY_STEP = 8

type PageDropPosition = {
  pageId: string
  edge: 'before' | 'after'
}

function readPreference(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writePreference(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // UI preferences are disposable and must never break editor controls.
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function rootUiScale(): number {
  return (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16) / 16
}

function maximumPagesHeight(panel: HTMLElement): number {
  const heading = panel.querySelector<HTMLElement>('.scripture-panel-heading')
  const scale = rootUiScale()
  const panelHeight = panel.getBoundingClientRect().height / scale
  const headingHeight = (heading?.getBoundingClientRect().height ?? 38) / scale
  return Math.max(MIN_PAGES_HEIGHT, panelHeight - headingHeight - MIN_LAYERS_HEIGHT)
}

function useStablePageMountOrder(pageIds: string[]): string[] {
  const mountOrderRef = useRef<string[]>([])
  const livePageIds = new Set(pageIds)
  const nextMountOrder = mountOrderRef.current.filter((pageId) => livePageIds.has(pageId))
  for (const pageId of pageIds) {
    if (!nextMountOrder.includes(pageId)) nextMountOrder.push(pageId)
  }
  mountOrderRef.current = nextMountOrder
  return nextMountOrder
}

const PageThumbnail = memo(function PageThumbnail({
  pageId,
  activePageId,
  pageNumber,
  pageNumberSettings,
}: {
  pageId: string
  activePageId: string
  pageNumber?: number
  pageNumberSettings: PageNumberSettings
}) {
  const [revision, setRevision] = useState(0)
  const wasActive = useRef(pageId === activePageId)
  const dirty = useRef(false)
  const pendingRefreshFrame = useRef<number | null>(null)

  useEffect(() => () => {
    if (pendingRefreshFrame.current != null) cancelAnimationFrame(pendingRefreshFrame.current)
  }, [])

  // Layout changes flow through the preview's shared layout-tree subscription.
  // Canvas moves/resizes only commit on pointer release, so this still avoids
  // work during pointer movement. Text lives outside that tree and gets one
  // short trailing revision without remounting the preview renderer.
  useEffect(() => {
    if (pageId !== activePageId) return
    const { doc } = getYDoc(pageId)
    const layoutRoot = doc.getMap(LAYOUT_MAP)
    let refreshTimeout: ReturnType<typeof setTimeout> | null = null
    const onTransaction = (transaction: Transaction) => {
      if (transaction.changedParentTypes.has(layoutRoot as unknown as Parameters<typeof transaction.changedParentTypes.has>[0])) return
      dirty.current = true
      if (refreshTimeout) clearTimeout(refreshTimeout)
      refreshTimeout = setTimeout(() => {
        refreshTimeout = null
        dirty.current = false
        setRevision((value) => value + 1)
      }, 100)
    }
    doc.on('afterTransaction', onTransaction)
    return () => {
      doc.off('afterTransaction', onTransaction)
      if (refreshTimeout) clearTimeout(refreshTimeout)
    }
  }, [pageId, activePageId])

  useEffect(() => {
    const isActive = pageId === activePageId
    // If navigation interrupts the tiny debounce above, refresh on the very
    // next frame. This lets the newly selected canvas commit first without an
    // arbitrary idle timeout that makes the old slide look stale.
    if (wasActive.current && !isActive && dirty.current) {
      dirty.current = false
      if (pendingRefreshFrame.current != null) cancelAnimationFrame(pendingRefreshFrame.current)
      pendingRefreshFrame.current = requestAnimationFrame(() => {
        pendingRefreshFrame.current = null
        setRevision((value) => value + 1)
      })
    }
    wasActive.current = isActive
  }, [activePageId, pageId])

  return (
    <PagePreviewSurface
      pageId={pageId}
      revision={revision}
      pageNumber={pageNumber}
      pageNumberSettings={pageNumberSettings}
      priority={pageId === activePageId ? 'foreground' : 'background'}
    />
  )
})

function PageActionsMenu({
  pageNumber,
  canDelete,
  onRename,
  onDuplicate,
  onDelete,
}: {
  pageNumber: number
  canDelete: boolean
  onRename: () => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  return (
    <DropdownMenuPrimitive.Root>
      <DropdownMenuPrimitive.Trigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          data-page-no-drag
          aria-label={`Page ${pageNumber} actions`}
          title="Page actions"
        >
          <MoreHorizontal />
        </Button>
      </DropdownMenuPrimitive.Trigger>
      <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.Content
          className="scripture-node-menu is-compact"
          align="end"
          sideOffset={5}
          collisionPadding={8}
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
          <DropdownMenuPrimitive.Item className="scripture-node-menu-item" onSelect={onRename}>
            <Pencil />
            Rename
          </DropdownMenuPrimitive.Item>
          <DropdownMenuPrimitive.Item className="scripture-node-menu-item" onSelect={onDuplicate}>
            <Copy />
            Duplicate page
          </DropdownMenuPrimitive.Item>
          <DropdownMenuPrimitive.Separator className="scripture-node-menu-separator" />
          <DropdownMenuPrimitive.Item
            className="scripture-node-menu-item is-destructive"
            disabled={!canDelete}
            onSelect={onDelete}
          >
            <Trash2 />
            Delete page
          </DropdownMenuPrimitive.Item>
        </DropdownMenuPrimitive.Content>
      </DropdownMenuPrimitive.Portal>
    </DropdownMenuPrimitive.Root>
  )
}

function PageContextMenu({
  children,
  canDelete,
  onRename,
  onDuplicate,
  onDelete,
}: {
  children: ReactElement
  canDelete: boolean
  onRename: () => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  return (
    <ContextMenuPrimitive.Root>
      <ContextMenuPrimitive.Trigger asChild>{children}</ContextMenuPrimitive.Trigger>
      <ContextMenuPrimitive.Portal>
        <ContextMenuPrimitive.Content
          className="scripture-node-menu"
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
          <ContextMenuPrimitive.Item className="scripture-node-menu-item" onSelect={onRename}>
            <Pencil />
            Rename
          </ContextMenuPrimitive.Item>
          <ContextMenuPrimitive.Item className="scripture-node-menu-item" onSelect={onDuplicate}>
            <Copy />
            Duplicate page
          </ContextMenuPrimitive.Item>
          <ContextMenuPrimitive.Separator className="scripture-node-menu-separator" />
          <ContextMenuPrimitive.Item
            className="scripture-node-menu-item is-destructive"
            disabled={!canDelete}
            onSelect={onDelete}
          >
            <Trash2 />
            Delete page
          </ContextMenuPrimitive.Item>
        </ContextMenuPrimitive.Content>
      </ContextMenuPrimitive.Portal>
    </ContextMenuPrimitive.Root>
  )
}

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
  const label = fallbackLabel(
    node,
    registry.getAll().get(node.id)?.getText() ?? registry.getStatic().get(node.id)?.getText()
  )

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
  pageNames,
  pageNumberSettings,
  activePageId,
  selectedIds,
  onAddPage,
  onSelectPage,
  onDeletePage,
  onDuplicatePage,
  onRenamePage,
  onReorderPages,
  onSelectNode,
  onSetEditing,
  onReorderNode,
}: {
  tree: LayoutNode | null
  pageIds: string[]
  pageNames: Record<string, string>
  pageNumberSettings: PageNumberSettings
  activePageId: string
  selectedIds: string[]
  onAddPage: () => void
  onSelectPage: (pageId: string) => void
  onDeletePage: (pageId: string) => Promise<void>
  onDuplicatePage: (pageId: string) => Promise<void>
  onRenamePage: (pageId: string, name: string) => void
  onReorderPages: (pageIds: string[]) => void
  onSelectNode: (id: string, additive: boolean) => void
  onSetEditing: (id: string | null) => void
  onReorderNode: (draggedId: string, targetId: string) => void
}) {
  const [collapsed, setCollapsed] = useState(false)
  const [panelWidth, setPanelWidth] = useState(240)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(['root']))
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [renamingPageId, setRenamingPageId] = useState<string | null>(null)
  const [pageNameDraft, setPageNameDraft] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [pagesViewMode, setPagesViewMode] = useState<'list' | 'grid'>('list')
  const [pagesHeight, setPagesHeight] = useState(DEFAULT_PAGES_HEIGHT)
  const [pagesMaxHeight, setPagesMaxHeight] = useState(DEFAULT_PAGES_HEIGHT)
  const [pageDropPosition, setPageDropPosition] = useState<PageDropPosition | null>(null)
  // Page order is visual. Existing cards stay in their original DOM slots so
  // Chromium can retain each scaled preview's compositing layer instead of
  // repainting a large export subtree whenever pages are reordered.
  const pageMountOrder = useStablePageMountOrder(pageIds)
  const panelRef = useRef<HTMLElement>(null)
  const draggedPageIdRef = useRef<string | null>(null)
  const activeResizeCleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    setCollapsed(readPreference(PANEL_COLLAPSED_KEY) === 'true')
    const storedWidthValue = readPreference(PANEL_WIDTH_KEY)
    const storedWidth = Number(storedWidthValue)
    if (storedWidthValue != null && Number.isFinite(storedWidth)) {
      setPanelWidth(clamp(storedWidth, MIN_PANEL_WIDTH, MAX_PANEL_WIDTH))
    }
    const storedViewMode = readPreference(PAGES_VIEW_MODE_KEY)
    if (storedViewMode === 'grid' || storedViewMode === 'list') setPagesViewMode(storedViewMode)
    const storedHeight = Number(readPreference(PAGES_HEIGHT_KEY))
    if (Number.isFinite(storedHeight) && storedHeight >= MIN_PAGES_HEIGHT) setPagesHeight(storedHeight)
    try {
      const stored = JSON.parse(readPreference(TREE_EXPANSION_KEY) || '[]')
      if (Array.isArray(stored)) setExpanded(new Set(['root', ...stored]))
    } catch {
      // Ignore malformed local UI preferences.
    }
  }, [])

  useEffect(() => {
    return () => activeResizeCleanupRef.current?.()
  }, [])

  useEffect(() => {
    if (collapsed) return
    const panel = panelRef.current
    if (!panel) return
    const updateBounds = () => {
      const maximum = maximumPagesHeight(panel)
      setPagesMaxHeight(maximum)
      setPagesHeight((current) => clamp(current, MIN_PAGES_HEIGHT, maximum))
    }
    updateBounds()
    const observer = new ResizeObserver(updateBounds)
    observer.observe(panel)
    window.addEventListener('resize', updateBounds)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', updateBounds)
    }
  }, [collapsed])

  function togglePagesViewMode() {
    setPagesViewMode((mode) => {
      const next = mode === 'grid' ? 'list' : 'grid'
      writePreference(PAGES_VIEW_MODE_KEY, next)
      return next
    })
  }

  function togglePanel() {
    setCollapsed((value) => {
      writePreference(PANEL_COLLAPSED_KEY, String(!value))
      return !value
    })
  }

  function toggleExpanded(id: string) {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      next.add('root')
      writePreference(TREE_EXPANSION_KEY, JSON.stringify(Array.from(next)))
      return next
    })
  }

  function beginResize(event: React.PointerEvent) {
    event.preventDefault()
    activeResizeCleanupRef.current?.()
    const startX = event.clientX
    const startWidth = panelWidth
    const uiScale = rootUiScale()
    const onMove = (moveEvent: PointerEvent) => {
      const next = clamp(startWidth + (moveEvent.clientX - startX) / uiScale, MIN_PANEL_WIDTH, MAX_PANEL_WIDTH)
      setPanelWidth(next)
    }
    const onUp = (upEvent: PointerEvent) => {
      const next = clamp(startWidth + (upEvent.clientX - startX) / uiScale, MIN_PANEL_WIDTH, MAX_PANEL_WIDTH)
      setPanelWidth(next)
      writePreference(PANEL_WIDTH_KEY, String(next))
      cleanup()
    }
    function cleanup() {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      activeResizeCleanupRef.current = null
    }
    activeResizeCleanupRef.current = cleanup
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  function beginPagesResize(event: React.PointerEvent) {
    event.preventDefault()
    activeResizeCleanupRef.current?.()
    const startY = event.clientY
    const startHeight = pagesHeight
    const container = panelRef.current
    const maxHeight = container ? maximumPagesHeight(container) : pagesMaxHeight
    const uiScale = rootUiScale()
    const onMove = (moveEvent: PointerEvent) => {
      const next = clamp(startHeight + (moveEvent.clientY - startY) / uiScale, MIN_PAGES_HEIGHT, maxHeight)
      setPagesHeight(next)
    }
    const onUp = (upEvent: PointerEvent) => {
      const next = clamp(startHeight + (upEvent.clientY - startY) / uiScale, MIN_PAGES_HEIGHT, maxHeight)
      setPagesHeight(next)
      writePreference(PAGES_HEIGHT_KEY, String(next))
      cleanup()
    }
    function cleanup() {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      activeResizeCleanupRef.current = null
    }
    activeResizeCleanupRef.current = cleanup
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  function resizePanelFromKeyboard(event: React.KeyboardEvent) {
    const amount = event.shiftKey ? RESIZE_KEY_STEP * 3 : RESIZE_KEY_STEP
    let next = panelWidth
    if (event.key === 'ArrowLeft') next -= amount
    else if (event.key === 'ArrowRight') next += amount
    else if (event.key === 'Home') next = MIN_PANEL_WIDTH
    else if (event.key === 'End') next = MAX_PANEL_WIDTH
    else return
    event.preventDefault()
    next = clamp(next, MIN_PANEL_WIDTH, MAX_PANEL_WIDTH)
    setPanelWidth(next)
    writePreference(PANEL_WIDTH_KEY, String(next))
  }

  function resizePagesFromKeyboard(event: React.KeyboardEvent) {
    const amount = event.shiftKey ? RESIZE_KEY_STEP * 3 : RESIZE_KEY_STEP
    let next = pagesHeight
    if (event.key === 'ArrowUp') next -= amount
    else if (event.key === 'ArrowDown') next += amount
    else if (event.key === 'Home') next = MIN_PAGES_HEIGHT
    else if (event.key === 'End') next = pagesMaxHeight
    else return
    event.preventDefault()
    next = clamp(next, MIN_PAGES_HEIGHT, pagesMaxHeight)
    setPagesHeight(next)
    writePreference(PAGES_HEIGHT_KEY, String(next))
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

  function beginPageRename(pageId: string) {
    setPageNameDraft(pageNames[pageId] ?? '')
    setRenamingPageId(pageId)
  }

  function commitPageRename(pageId: string) {
    onRenamePage(pageId, pageNameDraft)
    setRenamingPageId(null)
  }

  function pageNameEditor(pageId: string, pageNumber: number) {
    return (
      <input
        autoFocus
        data-page-no-drag
        className="scripture-page-name-input"
        value={pageNameDraft}
        placeholder="Untitled page"
        aria-label={`Rename page ${pageNumber}`}
        onChange={(event) => setPageNameDraft(event.target.value)}
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        onBlur={() => commitPageRename(pageId)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
          if (event.key === 'Escape') {
            event.preventDefault()
            setRenamingPageId(null)
          }
        }}
      />
    )
  }

  function movePageBy(pageId: string, delta: -1 | 1) {
    const from = pageIds.indexOf(pageId)
    const to = from + delta
    if (from < 0 || to < 0 || to >= pageIds.length) return
    const next = [...pageIds]
    next.splice(from, 1)
    next.splice(to, 0, pageId)
    onReorderPages(next)
  }

  function pageKeyboardReorderHandlers(pageId: string) {
    const index = pageIds.indexOf(pageId)
    return {
      onKeyDown: (event: React.KeyboardEvent) => {
        if (!event.altKey) return
        if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
          event.preventDefault()
          movePageBy(pageId, -1)
        } else if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
          event.preventDefault()
          movePageBy(pageId, 1)
        }
      },
      'aria-keyshortcuts': 'Alt+ArrowUp Alt+ArrowDown',
      title: pageIds.length > 1 ? `Page ${index + 1} · drag to reorder` : undefined,
    }
  }

  function pageOrderForDrop(draggedId: string, position: PageDropPosition): string[] | null {
    if (!pageIds.includes(draggedId) || !pageIds.includes(position.pageId)) return null
    if (draggedId === position.pageId) return [...pageIds]
    const next = pageIds.filter((id) => id !== draggedId)
    const insertAt = next.indexOf(position.pageId) + (position.edge === 'after' ? 1 : 0)
    next.splice(insertAt, 0, draggedId)
    return next
  }

  function pageListDropHandlers() {
    const positionFromPointer = (event: React.DragEvent<HTMLOListElement>): PageDropPosition | null => {
      // DOM mount order intentionally stays stable; sort by screen position
      // so gap detection follows the current CSS order the user sees.
      const items = (Array.from(event.currentTarget.children) as HTMLElement[]).sort(
        (left, right) => left.getBoundingClientRect().top - right.getBoundingClientRect().top
      )
      for (const item of items) {
        const pageId = item.dataset.pageId
        if (!pageId) continue
        const bounds = item.getBoundingClientRect()
        if (event.clientY < bounds.top + bounds.height / 2) return { pageId, edge: 'before' }
      }
      const lastPageId = items.at(-1)?.dataset.pageId
      return lastPageId ? { pageId: lastPageId, edge: 'after' } : null
    }

    return {
      onDragOver: (event: React.DragEvent<HTMLOListElement>) => {
        if (!event.dataTransfer.types.includes(PAGE_DRAG_TYPE)) return
        event.preventDefault()
        const position = positionFromPointer(event)
        const draggedId = draggedPageIdRef.current
        const next = position && draggedId ? pageOrderForDrop(draggedId, position) : null
        if (!position || !next || next.every((id, index) => id === pageIds[index])) {
          setPageDropPosition(null)
          return
        }
        setPageDropPosition((current) =>
          current?.pageId === position.pageId && current.edge === position.edge ? current : position
        )
      },
      onDragLeave: (event: React.DragEvent<HTMLOListElement>) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
        setPageDropPosition(null)
      },
      onDrop: (event: React.DragEvent<HTMLOListElement>) => {
        if (!event.dataTransfer.types.includes(PAGE_DRAG_TYPE)) return
        event.preventDefault()
        const draggedId = event.dataTransfer.getData(PAGE_DRAG_TYPE)
        const position = positionFromPointer(event)
        setPageDropPosition(null)
        if (!draggedId || !position) return
        // The target is a gap, not a page replacement. Remove the dragged
        // page first, then insert directly before/after the hovered page in
        // the remaining order.
        const next = pageOrderForDrop(draggedId, position)
        if (next && !next.every((id, index) => id === pageIds[index])) onReorderPages(next)
      },
    }
  }

  function pageDragHandlers(pageId: string) {
    return {
      draggable: pageIds.length > 1,
      onDragStart: (event: React.DragEvent) => {
        if ((event.target as HTMLElement).closest('[data-page-no-drag]')) {
          event.preventDefault()
          return
        }
        draggedPageIdRef.current = pageId
        event.dataTransfer.setData(PAGE_DRAG_TYPE, pageId)
        event.dataTransfer.effectAllowed = 'move'
      },
      onDragEnd: () => {
        draggedPageIdRef.current = null
        setPageDropPosition(null)
      },
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
      ref={panelRef}
      className="scripture-layers-panel"
      aria-label="Pages and layers"
      style={{ width: `${panelWidth / 16}rem`, minWidth: `${panelWidth / 16}rem` }}
    >
      <div className="scripture-panel-heading">
        <span>Pages & Layers</span>
        <Button variant="ghost" size="icon-xs" onClick={togglePanel} aria-label="Collapse Pages and Layers">
          <ChevronsLeft />
        </Button>
      </div>

      <section
        className="scripture-layers-section is-pages"
        aria-labelledby="pages-heading"
        style={{ height: `${pagesHeight / 16}rem` }}
      >
        <div className="scripture-section-heading">
          <h2 id="pages-heading">Pages</h2>
          <div className="scripture-section-heading-actions">
            <Button
              variant={pagesViewMode === 'grid' ? 'secondary' : 'ghost'}
              size="icon-xs"
              onClick={togglePagesViewMode}
              aria-label={pagesViewMode === 'grid' ? 'Switch to list view' : 'Switch to presentation view'}
              aria-pressed={pagesViewMode === 'grid'}
            >
              <LayoutGrid />
            </Button>
            <Button variant="ghost" size="icon-xs" onClick={onAddPage} aria-label="Add page">
              <Plus />
            </Button>
          </div>
        </div>
        <div className="scripture-pages-scroll">
        {pagesViewMode === 'grid' ? (
          <ol className="scripture-pages-grid" {...pageListDropHandlers()}>
            {pageMountOrder.map((pageId) => {
              const index = pageIds.indexOf(pageId)
              const displayedPageNumber = resolvePageNumber(pageIds, pageId, pageNumberSettings)
              return (
              <PageContextMenu
                key={pageId}
                canDelete={pageIds.length > 1}
                onRename={() => beginPageRename(pageId)}
                onDuplicate={() => void onDuplicatePage(pageId)}
                onDelete={() => setPendingDelete(pageId)}
              >
                <li
                  data-page-id={pageId}
                  style={{ order: index }}
                  onPointerEnter={() => void preloadLayoutTree(pageId)}
                  onFocusCapture={() => void preloadLayoutTree(pageId)}
                  aria-posinset={index + 1}
                  aria-setsize={pageIds.length}
                  className={[
                    'scripture-page-card',
                    pageId === activePageId && 'is-active',
                    pageDropPosition?.pageId === pageId && `is-drop-${pageDropPosition.edge}`,
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  {...pageDragHandlers(pageId)}
                >
                  <div className="scripture-page-card-thumb">
                    <PageThumbnail
                      pageId={pageId}
                      activePageId={activePageId}
                      pageNumber={displayedPageNumber?.number}
                      pageNumberSettings={pageNumberSettings}
                    />
                    <button
                      type="button"
                      className="scripture-page-card-open"
                      onClick={() => onSelectPage(pageId)}
                      aria-label={pageNames[pageId] || `Page ${index + 1}`}
                      {...pageKeyboardReorderHandlers(pageId)}
                    />
                  </div>
                  <div className="scripture-page-card-footer">
                    <span className="scripture-page-card-label">
                      <span className="scripture-page-number">{index + 1}</span>
                      {renamingPageId === pageId ? (
                        pageNameEditor(pageId, index + 1)
                      ) : (
                        <button
                          type="button"
                          className="scripture-page-name"
                          onClick={() => onSelectPage(pageId)}
                          onDoubleClick={() => beginPageRename(pageId)}
                          title="Double-click to rename"
                        >
                          {pageNames[pageId] || 'Untitled'}
                        </button>
                      )}
                    </span>
                    <span className="scripture-page-card-actions">
                      <PageActionsMenu
                        pageNumber={index + 1}
                        canDelete={pageIds.length > 1}
                        onRename={() => beginPageRename(pageId)}
                        onDuplicate={() => void onDuplicatePage(pageId)}
                        onDelete={() => setPendingDelete(pageId)}
                      />
                    </span>
                  </div>
                </li>
              </PageContextMenu>
              )
            })}
          </ol>
        ) : (
          <ol className="scripture-pages-list" {...pageListDropHandlers()}>
            {pageMountOrder.map((pageId) => {
              const index = pageIds.indexOf(pageId)
              return (
              <PageContextMenu
                key={pageId}
                canDelete={pageIds.length > 1}
                onRename={() => beginPageRename(pageId)}
                onDuplicate={() => void onDuplicatePage(pageId)}
                onDelete={() => setPendingDelete(pageId)}
              >
                <li
                  data-page-id={pageId}
                  style={{ order: index }}
                  onPointerEnter={() => void preloadLayoutTree(pageId)}
                  onFocusCapture={() => void preloadLayoutTree(pageId)}
                  aria-posinset={index + 1}
                  aria-setsize={pageIds.length}
                  className={[
                    'scripture-page-row',
                    pageId === activePageId && 'is-active',
                    pageDropPosition?.pageId === pageId && `is-drop-${pageDropPosition.edge}`,
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  {...pageDragHandlers(pageId)}
                >
                  {renamingPageId === pageId ? (
                    <div className="scripture-page-row-label">
                      <span className="scripture-page-number">{index + 1}</span>
                      {pageNameEditor(pageId, index + 1)}
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="scripture-page-row-label"
                      onClick={() => onSelectPage(pageId)}
                      onDoubleClick={() => beginPageRename(pageId)}
                      {...pageKeyboardReorderHandlers(pageId)}
                    >
                      <span className="scripture-page-number">{index + 1}</span>
                      <span className="scripture-page-name">{pageNames[pageId] || 'Untitled'}</span>
                    </button>
                  )}
                  <PageActionsMenu
                    pageNumber={index + 1}
                    canDelete={pageIds.length > 1}
                    onRename={() => beginPageRename(pageId)}
                    onDuplicate={() => void onDuplicatePage(pageId)}
                    onDelete={() => setPendingDelete(pageId)}
                  />
                </li>
              </PageContextMenu>
              )
            })}
          </ol>
        )}
        </div>
        {error && <p className="scripture-panel-error" role="alert">{error}</p>}
      </section>

      <div
        className="scripture-panel-hresize-handle"
        onPointerDown={beginPagesResize}
        onKeyDown={resizePagesFromKeyboard}
        role="separator"
        tabIndex={0}
        aria-orientation="horizontal"
        aria-label="Resize Pages and Layers panels"
        aria-valuemin={Math.round(MIN_PAGES_HEIGHT)}
        aria-valuemax={Math.round(pagesMaxHeight)}
        aria-valuenow={Math.round(pagesHeight)}
      />

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
            onSelectMatch={(blockId) => {
              onSelectNode(blockId, false)
              onSetEditing(blockId)
            }}
          />
        )}
        <ul className="scripture-layers-tree" role="tree" aria-label="Document layers">
          {tree && (
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
          )}
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
        onKeyDown={resizePanelFromKeyboard}
        role="separator"
        tabIndex={0}
        aria-orientation="vertical"
        aria-label="Resize Pages and Layers panel"
        aria-valuemin={MIN_PANEL_WIDTH}
        aria-valuemax={MAX_PANEL_WIDTH}
        aria-valuenow={Math.round(panelWidth)}
      />
    </aside>
  )
}
