'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { FileCode } from 'lucide-react'
import {
  type DocumentMeta,
  listDocuments,
  createDocument,
  renameDocument,
  deleteDocumentMeta,
} from '@/lib/documents/manifest'
import { deleteYDoc, getYDoc } from '@/lib/yjs/doc-store'
import { seedRootFrame } from '@/lib/yjs/layout-store'
import { TEMPLATES, type Template } from '@/lib/templates'
import { PageToolbar } from '@/components/layout/page-toolbar'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
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

  useEffect(() => {
    // One-time bootstrap from localStorage, which isn't available during SSR
    // render -- an effect is the correct place to read it, not a lint dodge.
    setDocs(listDocuments())
    const onStorage = () => setDocs(listDocuments())
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

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

  async function handleConfirmDelete() {
    const id = pendingDeleteId
    if (!id) return
    setPendingDeleteId(null)
    deleteDocumentMeta(id)
    setDocs(listDocuments())
    await deleteYDoc(id)
    fetch(`/api/documents/${id}`, { method: 'DELETE' }).catch(() => {})
  }

  return (
    <div className="scripture-page">
      <main className="flex flex-col items-center w-full max-w-[1100px]">
        <PageToolbar>
          <h1 className="scripture-dashboard-title">scripture</h1>
          <Button className="ml-auto" onClick={() => setShowTemplatePicker(true)}>
            + New document
          </Button>
        </PageToolbar>

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
          </div>
        ) : (
          <ul className="scripture-doc-grid">
            {docs.map((doc) => (
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
        )}
      </main>

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
