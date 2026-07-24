'use client'

import { useEffect, useState } from 'react'
import { FileCode } from 'lucide-react'
import type { DocumentMeta } from '@/lib/documents/manifest'
import { loadDocumentPreview } from '@/lib/documents/preview'

export function DocumentPreview({ documentMeta }: { documentMeta: DocumentMeta }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void loadDocumentPreview(documentMeta).then((preview) => {
      if (!cancelled) setDataUrl(preview)
    })
    return () => {
      cancelled = true
    }
  }, [documentMeta])

  if (dataUrl) {
    return (
      // Generated locally from this document's own first page; decorative
      // because the surrounding button already names the document.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        className="scripture-doc-card-preview-image"
        src={dataUrl}
        alt=""
        draggable={false}
      />
    )
  }

  return (
    <span className="scripture-doc-card-preview-fallback" aria-hidden="true">
      <span className="scripture-doc-card-preview-icon">
        <FileCode />
      </span>
      <span className="scripture-doc-card-code">
        <i />
        <i />
        <i />
        <i />
      </span>
    </span>
  )
}
