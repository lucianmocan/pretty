'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { FileCode, Pin, PinOff, Pencil, Trash2, Search, X } from 'lucide-react'
import {
  type DocumentMeta,
  listDocuments,
  createDocument,
  renameDocument,
  deleteDocumentMeta,
  getPageIds,
  togglePin,
} from '@/lib/documents/manifest'
import { extractDocumentText } from '@/lib/documents/search-index'
import { cn } from '@/lib/utils'
import { deleteYDoc, getYDoc } from '@/lib/yjs/doc-store'
import { seedRootFrame, toPlainTree } from '@/lib/yjs/layout-store'
import { collectByKind } from '@/lib/layout/tree-utils'
import { deleteUploadedImage } from '@/lib/images/client'
import { TEMPLATES, type Template } from '@/lib/templates'
import { PageToolbar } from '@/components/layout/page-toolbar'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'

function relativeTime(timestamp: number): string {
  const diffSeconds = Math.round((timestamp - Date.now()) / 1000)
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
  const divisions: Array<[number, Intl.RelativeTimeFormatUnit]> = [
    [60, 'second'],
    [60, 'minute'],
    [24, 'hour'],
    [7, 'day'],
    [4.34524, 'week'],
    [12, 'month'],
    [Number.POSITIVE_INFINITY, 'year'],
  ]
  let duration = diffSeconds
  for (const [amount, unit] of divisions) {
    if (Math.abs(duration) < amount) return rtf.format(Math.round(duration), unit)
    duration /= amount
  }
  return rtf.format(Math.round(duration), 'year')
}

export default function DocumentsDashboard() {
  const router = useRouter()
  const [docs, setDocs] = useState<DocumentMeta[] | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [showTemplatePicker, setShowTemplatePicker] = useState(false)
  const [creating, setCreating] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [contentIndex, setContentIndex] = useState<Record<string, string>>({})

  useEffect(() => {
    // One-time bootstrap from localStorage, which isn't available during SSR
    // render -- an effect is the correct place to read it, not a lint dodge.
    setDocs(listDocuments())
    const onStorage = () => setDocs(listDocuments())
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  useEffect(() => {
    // Content search needs each page's Yjs doc loaded from IndexedDB, which
    // the lightweight manifest above doesn't have -- build it once per doc
    // id (not on every docs refresh) so renames/pins don't re-extract text.
    if (!docs) return
    const missing = docs.filter((doc) => !(doc.id in contentIndex))
    if (missing.length === 0) return
    let cancelled = false
    Promise.all(missing.map(async (doc) => [doc.id, await extractDocumentText(doc.id)] as const)).then((entries) => {
      if (cancelled) return
      setContentIndex((prev) => ({ ...prev, ...Object.fromEntries(entries) }))
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed off doc ids, not the whole contentIndex object
  }, [docs])

  async function handleCreateWithTemplate(template: Template) {
    setCreating(true)
    try {
      const meta = createDocument()
      const { doc, synced } = getYDoc(meta.id)
      await synced
      seedRootFrame(doc, { rootProps: template.rootProps, children: template.children() })
      setShowTemplatePicker(false)
      router.push(`/doc/${meta.id}`)
    } finally {
      setCreating(false)
    }
  }

  function handleRename(id: string, name: string) {
    renameDocument(id, name || 'Untitled')
    setDocs(listDocuments())
  }

  function handleTogglePin(id: string) {
    togglePin(id)
    setDocs(listDocuments())
  }

  async function handleConfirmDelete() {
    const id = pendingDeleteId
    if (!id) return
    setPendingDeleteId(null)
    // Read every page id BEFORE deleting the manifest entry -- that entry is
    // the only place pageIds lives; deleting it first (as this used to) means
    // every page after the first is never looked up again and leaks forever,
    // both in IndexedDB and the server-side .data/documents files.
    const pageIds = getPageIds(id)
    deleteDocumentMeta(id)
    setDocs(listDocuments())
    await Promise.all(
      pageIds.map(async (pageId) => {
        // Read the tree BEFORE deleteYDoc wipes its IndexedDB state -- any
        // image block it contains references an uploaded file that nothing
        // else will ever clean up otherwise (no other code path calls
        // DELETE /api/images/{id} at all).
        const { doc, synced } = getYDoc(pageId)
        await synced
        const tree = toPlainTree(doc)
        if (tree) {
          for (const imageNode of collectByKind(tree, 'image')) {
            deleteUploadedImage(imageNode.src)
          }
        }
        await deleteYDoc(pageId)
        await fetch(`/api/documents/${pageId}`, { method: 'DELETE' }).catch(() => {})
      })
    )
  }

  const query = searchQuery.trim().toLowerCase()
  // Pinned docs are always shown regardless of the search box -- pinning is
  // a deliberate "keep this visible" choice, so a search shouldn't be able
  // to hide it. Only the unpinned list gets filtered.
  const pinnedDocs = docs?.filter((doc) => doc.pinned) ?? []
  const otherDocs = useMemo(() => {
    const unpinned = docs?.filter((doc) => !doc.pinned) ?? []
    if (!query) return unpinned
    return unpinned.filter(
      (doc) => doc.name.toLowerCase().includes(query) || (contentIndex[doc.id] ?? '').includes(query)
    )
  }, [docs, query, contentIndex])
  const isSearching = query.length > 0
  const indexing = docs !== null && docs.some((doc) => !(doc.id in contentIndex))

  return (
    <div className="scripture-dashboard-shell">
      <PageToolbar>
        <h1 className="scripture-dashboard-title">scripture</h1>
      </PageToolbar>

      <div className="scripture-page">
        <main className="flex flex-col items-center w-full max-w-[1100px]">
          {docs === null ? (
            <div className="scripture-editor-loading">Loading…</div>
          ) : docs.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-20 text-center">
              <div className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <FileCode size={22} />
              </div>
              <p className="text-sm font-medium">No documents yet</p>
              <p className="max-w-xs text-sm text-muted-foreground">
                Create your first document to start pasting and annotating code.
              </p>
              <Button className="mt-1" onClick={() => setShowTemplatePicker(true)}>
                + New document
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-8 w-full">
              {pinnedDocs.length > 0 && (
                <div className="scripture-doc-section">
                  <h2 className="scripture-doc-section-title">Pinned</h2>
                  <ul className="scripture-doc-grid">
                    {pinnedDocs.map((doc) => (
                      <li key={doc.id}>
                        <Card>
                          <CardContent className="flex flex-col gap-2">
                            <div className="flex size-8 items-center justify-center rounded-md bg-muted text-muted-foreground">
                              <FileCode size={16} />
                            </div>

                            {editingId === doc.id ? (
                              <Input
                                autoFocus
                                defaultValue={doc.name}
                                onBlur={(e) => {
                                  handleRename(doc.id, e.target.value)
                                  setEditingId(null)
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') e.currentTarget.blur()
                                  if (e.key === 'Escape') setEditingId(null)
                                }}
                              />
                            ) : (
                              <button
                                type="button"
                                className="truncate text-left text-sm font-medium hover:underline"
                                onClick={() => router.push(`/doc/${doc.id}`)}
                              >
                                {doc.name}
                              </button>
                            )}

                            <span className="text-xs text-muted-foreground">Updated {relativeTime(doc.updatedAt)}</span>

                            <div className="flex gap-1.5 pt-1">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon-xs"
                                    onClick={() => handleTogglePin(doc.id)}
                                    aria-label="Unpin"
                                  >
                                    <PinOff />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Unpin</TooltipContent>
                              </Tooltip>
                              <Button variant="ghost" size="sm" onClick={() => setEditingId(doc.id)} aria-label="Rename">
                                Rename
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => setPendingDeleteId(doc.id)}
                                aria-label="Delete"
                              >
                                Delete
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="scripture-doc-section">
                <div className="flex items-center gap-2">
                  {pinnedDocs.length > 0 && <h2 className="scripture-doc-section-title">All documents</h2>}
                  <div className={cn('relative w-64', pinnedDocs.length > 0 && 'ml-auto')}>
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search documents…"
                      className="h-8 pl-8 pr-7"
                    />
                    {searchQuery && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        className="absolute right-1 top-1/2 -translate-y-1/2"
                        onClick={() => setSearchQuery('')}
                        aria-label="Clear search"
                      >
                        <X className="size-3" />
                      </Button>
                    )}
                  </div>
                  {indexing && <span className="text-xs text-muted-foreground">Indexing content…</span>}
                  <Button
                    className={pinnedDocs.length === 0 ? 'ml-auto' : undefined}
                    onClick={() => setShowTemplatePicker(true)}
                  >
                    + New document
                  </Button>
                </div>

                {isSearching && otherDocs.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    No documents match &ldquo;{searchQuery.trim()}&rdquo;
                  </p>
                ) : (
                  <ul className="scripture-doc-list">
                    {otherDocs.map((doc) => (
                      <li key={doc.id} className="scripture-doc-list-item">
                        <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                          <FileCode size={14} />
                        </div>

                        {editingId === doc.id ? (
                          <Input
                            autoFocus
                            defaultValue={doc.name}
                            className="h-7 flex-1"
                            onBlur={(e) => {
                              handleRename(doc.id, e.target.value)
                              setEditingId(null)
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') e.currentTarget.blur()
                              if (e.key === 'Escape') setEditingId(null)
                            }}
                          />
                        ) : (
                          <button
                            type="button"
                            className="scripture-doc-list-name"
                            onClick={() => router.push(`/doc/${doc.id}`)}
                          >
                            {doc.name}
                          </button>
                        )}

                        <span className="scripture-doc-list-time">Updated {relativeTime(doc.updatedAt)}</span>

                        <div className="flex items-center gap-0.5">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                onClick={() => handleTogglePin(doc.id)}
                                aria-label="Pin"
                              >
                                <Pin />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Pin</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                onClick={() => setEditingId(doc.id)}
                                aria-label="Rename"
                              >
                                <Pencil />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Rename</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                onClick={() => setPendingDeleteId(doc.id)}
                                aria-label="Delete"
                              >
                                <Trash2 />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Delete</TooltipContent>
                          </Tooltip>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      <Dialog open={showTemplatePicker} onOpenChange={setShowTemplatePicker}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New document</DialogTitle>
            <DialogDescription>Start blank or from a starter layout.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2">
            {TEMPLATES.map((template) => (
              <button
                key={template.id}
                type="button"
                disabled={creating}
                className="scripture-template-card"
                onClick={() => handleCreateWithTemplate(template)}
              >
                <span className="scripture-template-card-name">{template.name}</span>
                <span className="scripture-template-card-description">{template.description}</span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={pendingDeleteId != null} onOpenChange={(open) => !open && setPendingDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this document?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingDeleteId(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleConfirmDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
