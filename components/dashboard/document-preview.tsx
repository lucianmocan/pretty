'use client'

import { useEffect } from 'react'
import type { DocumentMeta } from '@/lib/documents/manifest'
import { PagePreviewSurface } from '@/components/export/page-preview-surface'
import { clearLegacyDocumentPreview } from '@/lib/documents/preview'
import { getPageNumberSettings } from '@/lib/documents/manifest'
import { resolvePageNumber } from '@/lib/documents/page-numbers'

export function DocumentPreview({ documentMeta }: { documentMeta: DocumentMeta }) {
  const pageId = documentMeta.pageIds?.[0] ?? documentMeta.id
  const pageIds = documentMeta.pageIds?.length ? documentMeta.pageIds : [documentMeta.id]
  const pageNumberSettings = getPageNumberSettings(documentMeta.id)
  const pageNumber = resolvePageNumber(pageIds, pageId, pageNumberSettings)

  useEffect(() => {
    clearLegacyDocumentPreview(documentMeta.id)
  }, [documentMeta.id])

  return (
    <PagePreviewSurface
      key={`${pageId}:${documentMeta.updatedAt}`}
      pageId={pageId}
      pageNumber={pageNumber?.number}
      pageNumberSettings={pageNumberSettings}
    />
  )
}
