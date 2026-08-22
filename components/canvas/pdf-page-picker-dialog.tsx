'use client'

import { useEffect, useRef, useState } from 'react'
import { FileText, Check, AlertCircle } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { PdfDocument } from '@/lib/pdf/mupdf-client'
import { deleteUploadedImage, uploadImageFile, baseFileName } from '@/lib/images/client'

export interface PdfPickerRequest {
  files: File[]
  pageId: string
  // A picker opened from an existing empty image block reuses that block for
  // the very first inserted page. A canvas-level PDF drop has no node yet;
  // the caller only creates one after the user confirms the selection.
  frameId: string
  nodeId: string | null
}

interface PdfPagePickerDialogProps {
  request: PdfPickerRequest
  onCancel: () => void
  onInsertPages: (args: {
    pageId: string
    frameId: string
    nodeId: string | null
    // One entry per inserted page, in insertion order -- `alt` carries the
    // source PDF's own filename through to the block (numbered when that
    // PDF contributes more than one page) instead of a generic label.
    pages: Array<{ url: string; alt: string }>
  }) => void
}

interface PdfEntry {
  doc: PdfDocument | null
  thumbnails: string[]
  selected: Set<number>
  loading: boolean
  error: string | null
}

function emptyEntry(): PdfEntry {
  return { doc: null, thumbnails: [], selected: new Set([0]), loading: true, error: null }
}

/** Opened when one or more PDFs are picked/dropped where an image would
 * normally go -- shows every page of the active PDF as a thumbnail, lets the
 * user choose one or more (first page selected by default), and on Insert
 * converts every chosen page across every PDF to real vector SVG client-side
 * (see lib/pdf/mupdf-client.ts) before handing the resulting URLs back to
 * the caller. Dropping several PDFs at once queues all of them here instead
 * of only picking the first -- a vertical filename nav (same pattern as the
 * Shortcuts group list in components/settings/settings-dialog.tsx) lets the
 * user switch between them and adjust each one's selection before a single
 * combined Insert, whose label spells out that it covers every PDF, not just
 * the one currently in view. */
export function PdfPagePickerDialog({ request, onCancel, onInsertPages }: PdfPagePickerDialogProps) {
  const [entries, setEntries] = useState<PdfEntry[]>(() => request.files.map(() => emptyEntry()))
  const [activeIndex, setActiveIndex] = useState(0)
  const [inserting, setInserting] = useState(false)
  const [insertError, setInsertError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setEntries(request.files.map(() => emptyEntry()))
    setActiveIndex(0)
    setInsertError(null)

    request.files.forEach((file, index) => {
      PdfDocument.open(file)
        .then((pdfDoc) => {
          if (cancelled) {
            pdfDoc.destroy()
            return
          }
          const urls: string[] = []
          try {
            for (let page = 0; page < pdfDoc.pageCount; page += 1) {
              urls.push(pdfDoc.renderThumbnail(page))
            }
          } catch (cause) {
            urls.forEach((url) => URL.revokeObjectURL(url))
            pdfDoc.destroy()
            throw cause
          }
          setEntries((prev) => {
            const next = [...prev]
            next[index] = { ...next[index], doc: pdfDoc, thumbnails: urls, loading: false }
            return next
          })
        })
        .catch((err) => {
          console.error('Failed to open PDF', err)
          if (cancelled) return
          setEntries((prev) => {
            const next = [...prev]
            next[index] = { ...next[index], loading: false, error: 'Could not read this PDF.' }
            return next
          })
        })
    })

    return () => {
      cancelled = true
    }
  }, [request])

  // Blob-URL thumbnails and every opened WASM document need explicit cleanup
  // -- otherwise each opened PDF leaks its thumbnails and WASM memory for the
  // rest of the tab's life. Read the latest entries via a ref rather than
  // depending on `entries` directly: `entries` gets a new array identity on
  // every file's load/error (one at a time, as each PDF finishes opening),
  // and an effect keyed on it would re-run its cleanup after each one --
  // destroying every doc in the PREVIOUS snapshot, including ones still
  // referenced unchanged in the new array. That silently freed already-open
  // PdfDocuments while other files were still loading, so clicking Insert
  // later called renderPageSvg on a destroyed WASM doc ("invalid page
  // number"). Keying on `request` instead means this only tears down once,
  // when the dialog is reused for a new drop or actually unmounts.
  const entriesRef = useRef(entries)
  entriesRef.current = entries
  useEffect(() => {
    return () => {
      for (const entry of entriesRef.current) {
        entry.thumbnails.forEach((url) => URL.revokeObjectURL(url))
        entry.doc?.destroy()
      }
    }
  }, [request])

  function toggle(index: number) {
    setEntries((prev) => {
      const next = [...prev]
      const entry = next[activeIndex]
      const selected = new Set(entry.selected)
      if (selected.has(index)) selected.delete(index)
      else selected.add(index)
      next[activeIndex] = { ...entry, selected }
      return next
    })
  }

  const totalSelected = entries.reduce((sum, entry) => sum + entry.selected.size, 0)
  const anyLoading = entries.some((entry) => entry.loading)
  const active = entries[activeIndex]
  const allActiveSelected = Boolean(active) && active.selected.size === active.thumbnails.length

  function toggleAll() {
    setEntries((prev) => {
      const next = [...prev]
      const entry = next[activeIndex]
      next[activeIndex] = {
        ...entry,
        selected: entry.selected.size === entry.thumbnails.length
          ? new Set()
          : new Set(entry.thumbnails.map((_, index) => index)),
      }
      return next
    })
  }

  async function handleInsert() {
    if (totalSelected === 0) return
    setInserting(true)
    setInsertError(null)
    const pages: Array<{ url: string; alt: string }> = []
    try {
      for (let fileIndex = 0; fileIndex < entries.length; fileIndex += 1) {
        const entry = entries[fileIndex]
        if (!entry.doc) continue
        const baseName = baseFileName(request.files[fileIndex].name)
        const selectedPages = Array.from(entry.selected).sort((a, b) => a - b)
        for (let i = 0; i < selectedPages.length; i += 1) {
          const pageIndex = selectedPages[i]
          const svg = entry.doc.renderPageSvg(pageIndex)
          const blob = new Blob([svg], { type: 'image/svg+xml' })
          const url = await uploadImageFile(blob, `pdf-page-${pageIndex + 1}.svg`)
          const alt = selectedPages.length > 1 ? `${baseName} (${i + 1})` : baseName
          pages.push({ url, alt })
        }
      }
      onInsertPages({
        pageId: request.pageId,
        frameId: request.frameId,
        nodeId: request.nodeId,
        pages,
      })
    } catch (err) {
      console.error('Failed to insert PDF pages', err)
      await Promise.allSettled(pages.map(({ url }) => deleteUploadedImage(url)))
      setInsertError('Could not insert the selected pages.')
    } finally {
      setInserting(false)
    }
  }

  const multi = request.files.length > 1
  const insertLabel = inserting
    ? 'Inserting…'
    : multi
      ? `Insert ${totalSelected} page${totalSelected === 1 ? '' : 's'} from ${request.files.length} PDFs`
      : `Insert ${totalSelected > 1 ? `${totalSelected} pages` : 'page'}`

  return (
    <Dialog open onOpenChange={(open) => !open && !inserting && onCancel()}>
      <DialogContent
        className={classNames(
          // Fixed, viewport-scaled height (same pattern as SettingsDialog)
          // instead of sizing to content -- otherwise the dialog visibly
          // grows/shrinks as you switch to a PDF with more or fewer pages,
          // or as thumbnails stream in while still loading.
          'flex h-[calc(100dvh-2rem)] flex-col overflow-hidden sm:h-[36rem] sm:max-h-[calc(100dvh-2rem)]',
          multi ? 'sm:max-w-3xl' : 'sm:max-w-2xl'
        )}
      >
        <DialogHeader>
          <DialogTitle>Insert from PDF</DialogTitle>
          <DialogDescription>
            {multi
              ? 'Choose one or more pages from each PDF to insert as vector image blocks. The first page of each is selected by default.'
              : 'Choose one or more pages to insert as vector image blocks. The first page is selected by default.'}
          </DialogDescription>
        </DialogHeader>

        <div className={multi ? 'grid min-h-0 flex-1 gap-4 sm:grid-cols-[11rem_minmax(0,1fr)]' : 'flex min-h-0 flex-1 flex-col'}>
          {multi && (
            <nav
              className="flex gap-1 overflow-x-auto pb-3 sm:flex-col sm:overflow-x-visible sm:border-r sm:border-b-0 sm:pr-3 sm:pb-0"
              aria-label="PDFs to insert from"
            >
              {request.files.map((file, index) => {
                const entry = entries[index]
                return (
                  <Button
                    key={index}
                    type="button"
                    variant={index === activeIndex ? 'secondary' : 'ghost'}
                    size="sm"
                    className="shrink-0 justify-start gap-1.5"
                    aria-pressed={index === activeIndex}
                    onClick={() => setActiveIndex(index)}
                    title={file.name}
                  >
                    {entry?.error ? (
                      <AlertCircle size={13} className="shrink-0 text-destructive" />
                    ) : entry?.selected.size ? (
                      <span className="scripture-pdf-picker-tab-count">{entry.selected.size}</span>
                    ) : null}
                    <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-left">
                      {file.name}
                    </span>
                  </Button>
                )
              })}
            </nav>
          )}

          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
            {active?.loading && <p className="scripture-inspector-hint">Reading PDF…</p>}
            {active?.error && <p className="scripture-error-text">{active.error}</p>}
            {insertError && <p className="scripture-error-text">{insertError}</p>}

            {active && !active.loading && !active.error && active.thumbnails.length > 0 && (
              <>
                <div className="flex items-center justify-between pb-2">
                  <span className="scripture-inspector-hint m-0">
                    {active.thumbnails.length} page{active.thumbnails.length === 1 ? '' : 's'}
                  </span>
                  <Button type="button" variant="ghost" size="sm" onClick={toggleAll}>
                    {allActiveSelected ? 'Deselect all' : 'Select all'}
                  </Button>
                </div>
                <div className="scripture-pdf-picker-grid">
                {active.thumbnails.map((url, index) => (
                  <button
                    key={index}
                    type="button"
                    className={classNames('scripture-pdf-picker-page', active.selected.has(index) && 'is-selected')}
                    onClick={() => toggle(index)}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- local blob URL thumbnail, not a next/image candidate */}
                    <img src={url} alt={`Page ${index + 1}`} />
                    <span className="scripture-pdf-picker-page-number">{index + 1}</span>
                    {active.selected.has(index) && (
                      <span className="scripture-pdf-picker-page-check">
                        <Check size={14} />
                      </span>
                    )}
                  </button>
                ))}
                </div>
              </>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" disabled={inserting} onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={handleInsert} disabled={totalSelected === 0 || inserting || anyLoading}>
            <FileText />
            {insertLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function classNames(...parts: Array<string | false | undefined>) {
  return parts.filter(Boolean).join(' ')
}
