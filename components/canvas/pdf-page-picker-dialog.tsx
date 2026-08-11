'use client'

import { useEffect, useState } from 'react'
import { FileText, Check } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { PdfDocument } from '@/lib/pdf/mupdf-client'
import { deleteUploadedImage, uploadImageFile } from '@/lib/images/client'

export interface PdfPickerRequest {
  file: File
  pageId: string
  // A picker opened from an existing empty image block reuses that block for
  // the first page. A canvas-level PDF drop has no node yet; the caller only
  // creates one after the user confirms the selection.
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
    svgUrls: string[]
  }) => void
}

/** Opened when a PDF is picked/dropped where an image would normally go --
 * shows every page as a thumbnail, lets the user choose one or more (first
 * page selected by default), and on Insert converts each chosen page to
 * real vector SVG client-side (see lib/pdf/mupdf-client.ts) before handing
 * the resulting URLs back to the caller. Styled after CustomizeDialog
 * (components/customize/customize-dialog.tsx) for consistency. */
export function PdfPagePickerDialog({ request, onCancel, onInsertPages }: PdfPagePickerDialogProps) {
  const [doc, setDoc] = useState<PdfDocument | null>(null)
  const [thumbnails, setThumbnails] = useState<string[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set([0]))
  const [loading, setLoading] = useState(false)
  const [inserting, setInserting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setDoc(null)
    setThumbnails([])
    setSelected(new Set([0]))
    PdfDocument.open(request.file)
      .then((pdfDoc) => {
        if (cancelled) {
          pdfDoc.destroy()
          return
        }
        const urls: string[] = []
        try {
          for (let index = 0; index < pdfDoc.pageCount; index += 1) {
            urls.push(pdfDoc.renderThumbnail(index))
          }
          setDoc(pdfDoc)
          setThumbnails(urls)
        } catch (cause) {
          urls.forEach((url) => URL.revokeObjectURL(url))
          pdfDoc.destroy()
          throw cause
        }
      })
      .catch((err) => {
        console.error('Failed to open PDF', err)
        if (!cancelled) setError('Could not read this PDF.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [request])

  // Blob-URL thumbnails and the opened WASM document both need explicit
  // cleanup -- otherwise every opened PDF leaks its thumbnails and WASM
  // memory for the rest of the tab's life.
  useEffect(() => {
    return () => {
      thumbnails.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [thumbnails])
  useEffect(() => {
    return () => doc?.destroy()
  }, [doc])

  function toggle(index: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  async function handleInsert() {
    if (!doc || selected.size === 0) return
    setInserting(true)
    setError(null)
    const svgUrls: string[] = []
    try {
      const pages = Array.from(selected).sort((a, b) => a - b)
      for (const pageIndex of pages) {
        const svg = doc.renderPageSvg(pageIndex)
        const blob = new Blob([svg], { type: 'image/svg+xml' })
        svgUrls.push(await uploadImageFile(blob, `pdf-page-${pageIndex + 1}.svg`))
      }
      onInsertPages({
        pageId: request.pageId,
        frameId: request.frameId,
        nodeId: request.nodeId,
        svgUrls,
      })
    } catch (err) {
      console.error('Failed to insert PDF pages', err)
      await Promise.allSettled(svgUrls.map((url) => deleteUploadedImage(url)))
      setError('Could not insert the selected pages.')
    } finally {
      setInserting(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !inserting && onCancel()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Insert from PDF</DialogTitle>
          <DialogDescription>
            Choose one or more pages to insert as vector image blocks. The first page is selected by default.
          </DialogDescription>
        </DialogHeader>

        {loading && <p className="scripture-inspector-hint">Reading PDF…</p>}
        {error && <p className="scripture-error-text">{error}</p>}

        {!loading && thumbnails.length > 0 && (
          <div className="scripture-pdf-picker-grid">
            {thumbnails.map((url, index) => (
              <button
                key={index}
                type="button"
                className={classNames('scripture-pdf-picker-page', selected.has(index) && 'is-selected')}
                onClick={() => toggle(index)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- local blob URL thumbnail, not a next/image candidate */}
                <img src={url} alt={`Page ${index + 1}`} />
                <span className="scripture-pdf-picker-page-number">{index + 1}</span>
                {selected.has(index) && (
                  <span className="scripture-pdf-picker-page-check">
                    <Check size={14} />
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" disabled={inserting} onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={handleInsert} disabled={selected.size === 0 || inserting || loading}>
            <FileText />
            {inserting ? 'Inserting…' : `Insert ${selected.size > 1 ? `${selected.size} pages` : 'page'}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function classNames(...parts: Array<string | false | undefined>) {
  return parts.filter(Boolean).join(' ')
}
