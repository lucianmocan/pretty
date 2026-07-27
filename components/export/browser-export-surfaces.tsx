'use client'

import type { RefObject } from 'react'
import { ExportDocument } from '@/components/export/export-document'
import { useLayoutTree } from '@/lib/use-layout-tree'
import { getYDoc } from '@/lib/yjs/doc-store'

function BrowserExportPage({ pageId }: { pageId: string }) {
  const tree = useLayoutTree(pageId)
  return (
    <div className="scripture-browser-export-page" data-export-page-id={pageId} data-export-ready={Boolean(tree)}>
      {tree && <ExportDocument tree={tree} ydoc={getYDoc(pageId).doc} />}
    </div>
  )
}

export function BrowserExportSurfaces({
  pageIds,
  rootRef,
}: {
  pageIds: string[]
  rootRef: RefObject<HTMLDivElement | null>
}) {
  return (
    <div ref={rootRef} className="scripture-browser-export-surfaces" aria-hidden="true">
      {pageIds.map((pageId) => <BrowserExportPage key={pageId} pageId={pageId} />)}
    </div>
  )
}
