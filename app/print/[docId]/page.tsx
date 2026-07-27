import * as Y from 'yjs'
import { notFound } from 'next/navigation'
import { ExportDocument } from '@/components/export/export-document'
import { readDocumentBytes } from '@/lib/documents/store'
import { toPlainTree } from '@/lib/yjs/layout-store'

export const dynamic = 'force-dynamic'

export default async function PrintPage({ params }: { params: Promise<{ docId: string }> }) {
  const { docId } = await params
  const bytes = await readDocumentBytes(docId)
  if (!bytes) notFound()

  const ydoc = new Y.Doc()
  try {
    Y.applyUpdate(ydoc, bytes)
  } catch (err) {
    console.error(`Failed to decode document ${docId}`, err)
    notFound()
  }

  const tree = toPlainTree(ydoc)
  if (!tree) notFound()
  return <ExportDocument tree={tree} ydoc={ydoc} />
}
