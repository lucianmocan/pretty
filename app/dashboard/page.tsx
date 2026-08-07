'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  FileCode,
  Files,
  HardDrive,
  Pin,
  PinOff,
  Pencil,
  Plus,
  Search,
  Settings2,
  Trash2,
  X,
} from 'lucide-react'
import {
  type DocumentMeta,
  listDocuments,
  createDocument,
  renameDocument,
  togglePin,
} from '@/lib/documents/manifest'
import { extractDocumentText } from '@/lib/documents/search-index'
import { getYDoc } from '@/lib/yjs/doc-store'
import { seedRootFrame } from '@/lib/yjs/layout-store'
import { deleteDocument } from '@/lib/documents/delete-service'
import { TEMPLATES, type Template } from '@/lib/templates'
import { DocumentPreview } from '@/components/dashboard/document-preview'
import { PageToolbar } from '@/components/layout/page-toolbar'
import { SettingsDialog } from '@/components/settings/settings-dialog'
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

function documentPageCount(doc: DocumentMeta): number {
  return doc.pageIds?.length || 1
}

function plural(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? '' : 's'}`
}

export default function DocumentsDashboardPage() {
  const router = useRouter()
  const [docs, setDocs] = useState<DocumentMeta[] | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [showTemplatePicker, setShowTemplatePicker] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
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
    setCreateError(null)
    try {
      const meta = createDocument()
      const { doc, synced } = getYDoc(meta.id)
      await synced
      seedRootFrame(doc, { rootProps: template.rootProps, children: template.children() })
      setShowTemplatePicker(false)
      router.push(`/doc/${meta.id}`)
    } catch (cause) {
      setCreateError(cause instanceof Error ? cause.message : 'Could not create the document.')
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
    setDeleting(true)
    setDeleteError(null)
    try {
      await deleteDocument(id)
      setPendingDeleteId(null)
      setDocs(listDocuments())
    } catch (cause) {
      setDeleteError(cause instanceof Error ? cause.message : 'Could not delete the document.')
    } finally {
      setDeleting(false)
    }
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
  const totalPages = docs?.reduce((total, doc) => total + documentPageCount(doc), 0) ?? 0

  return (
    <div className="scripture-dashboard-shell">
      <PageToolbar>
        <h1 className="scripture-dashboard-title">
          <Link href="/">pretty</Link>
        </h1>
        <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setSettingsOpen(true)}>
          <Settings2 />
          Settings
        </Button>
      </PageToolbar>

      <div className="scripture-page">
        <main className="scripture-dashboard-main">
          {docs === null ? (
            <div className="scripture-dashboard-loading" aria-label="Loading documents">
              <div />
              <div />
              <div />
            </div>
          ) : (
            <>
              <section className="scripture-dashboard-overview" aria-labelledby="documents-heading">
                <div className="scripture-dashboard-heading">
                  <h2 id="documents-heading">Documents</h2>
                </div>
                {docs.length > 0 && (
                  <Button onClick={() => setShowTemplatePicker(true)}>
                    <Plus />
                    New document
                  </Button>
                )}
                <div className="scripture-dashboard-stats" aria-label="Workspace summary">
                  <span>
                    <Files />
                    {plural(docs.length, 'document')}
                  </span>
                  <span>{plural(totalPages, 'page')}</span>
                  <span>
                    <HardDrive />
                    Stored locally
                  </span>
                </div>
              </section>

              {docs.length === 0 ? (
                <div className="scripture-dashboard-empty">
                  <div className="scripture-empty-preview" aria-hidden="true">
                    <span className="scripture-empty-preview-icon">
                      <FileCode />
                    </span>
                    <span className="scripture-empty-preview-lines">
                      <i />
                      <i />
                      <i />
                      <i />
                    </span>
                  </div>
                  <h3>Create your first document</h3>
                  <p>Start blank or use a layout for a comparison, walkthrough, or single code figure.</p>
                  <Button onClick={() => setShowTemplatePicker(true)}>
                    <Plus />
                    New document
                  </Button>
                  <span className="scripture-dashboard-local-note">
                    <HardDrive />
                    Your work stays in this browser
                  </span>
                </div>
              ) : (
                <div className="scripture-dashboard-content">
                  {pinnedDocs.length > 0 && (
                    <section className="scripture-doc-section" aria-labelledby="pinned-heading">
                      <div className="scripture-doc-section-heading">
                        <h2 id="pinned-heading" className="scripture-doc-section-title">Pinned</h2>
                        <span>{pinnedDocs.length}</span>
                      </div>
                      <ul className="scripture-doc-grid">
                        {pinnedDocs.map((doc) => (
                          <li key={doc.id}>
                            <Card className="scripture-doc-card" size="sm">
                              <div className="scripture-doc-card-preview">
                                <DocumentPreview documentMeta={doc} />
                                <button
                                  type="button"
                                  className="scripture-doc-card-preview-open"
                                  onClick={() => router.push(`/doc/${doc.id}`)}
                                  aria-label={`Open ${doc.name}`}
                                />
                              </div>
                              <CardContent className="scripture-doc-card-content">
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
                                    className="scripture-doc-card-name"
                                    onClick={() => router.push(`/doc/${doc.id}`)}
                                  >
                                    {doc.name}
                                  </button>
                                )}

                                <div className="scripture-doc-card-meta">
                                  <span>{plural(documentPageCount(doc), 'page')}</span>
                                  <span>Updated {relativeTime(doc.updatedAt)}</span>
                                </div>

                                <div className="scripture-doc-card-actions">
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
                              </CardContent>
                            </Card>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}

                  <section className="scripture-doc-section" aria-labelledby="all-documents-heading">
                    <div className="scripture-doc-browser-heading">
                      <div className="scripture-doc-section-heading">
                        <h2 id="all-documents-heading" className="scripture-doc-section-title">
                          {pinnedDocs.length > 0 ? 'Other documents' : 'All documents'}
                        </h2>
                        <span>{docs.length - pinnedDocs.length}</span>
                      </div>
                      <div className="scripture-doc-search">
                        <Search />
                        <Input
                          type="text"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="Search names and content…"
                          aria-label="Search documents"
                        />
                        {searchQuery && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => setSearchQuery('')}
                            aria-label="Clear search"
                          >
                            <X />
                          </Button>
                        )}
                      </div>
                    </div>
                    {indexing && <span className="scripture-doc-indexing">Indexing document content…</span>}

                    {isSearching && otherDocs.length === 0 ? (
                      <div className="scripture-doc-no-results">
                        <Search />
                        <p>No documents match &ldquo;{searchQuery.trim()}&rdquo;</p>
                        <Button variant="ghost" size="sm" onClick={() => setSearchQuery('')}>
                          Clear search
                        </Button>
                      </div>
                    ) : otherDocs.length === 0 ? (
                      <div className="scripture-doc-no-results">
                        <Pin />
                        <p>Every document is pinned above.</p>
                      </div>
                    ) : (
                      <ul className="scripture-doc-list">
                        {otherDocs.map((doc) => (
                          <li key={doc.id} className="scripture-doc-list-item">
                            <div className="scripture-doc-list-icon">
                              <FileCode />
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

                            <span className="scripture-doc-list-pages">
                              {plural(documentPageCount(doc), 'page')}
                            </span>
                            <span className="scripture-doc-list-time">Updated {relativeTime(doc.updatedAt)}</span>

                            <div className="scripture-doc-list-actions">
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
                  </section>
                </div>
              )}
            </>
          )}
        </main>
      </div>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />

      <Dialog open={showTemplatePicker} onOpenChange={setShowTemplatePicker}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New document</DialogTitle>
            <DialogDescription>Start blank or from a starter layout.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2">
            {TEMPLATES.map((template) => {
              const previewBlocks = template.id === 'three-up' ? 3 : template.id === 'before-after' ? 2 : template.id === 'single' ? 1 : 0
              return (
                <button
                  key={template.id}
                  type="button"
                  disabled={creating}
                  className="scripture-template-card"
                  onClick={() => handleCreateWithTemplate(template)}
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
          {createError && <p className="scripture-error-text" role="alert">{createError}</p>}
        </DialogContent>
      </Dialog>

      <AlertDialog open={pendingDeleteId != null} onOpenChange={(open) => !open && setPendingDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this document?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes every page, uploaded image, local history, and saved export. It cannot be undone.
            </AlertDialogDescription>
            {deleteError && <p className="scripture-error-text" role="alert">{deleteError}</p>}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting} onClick={() => setPendingDeleteId(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleting}
              onClick={(event) => {
                event.preventDefault()
                void handleConfirmDelete()
              }}
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
