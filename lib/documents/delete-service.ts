'use client'

import { getPageIds, deleteDocumentMeta, removePage } from '@/lib/documents/manifest'
import { deleteUploadedImage } from '@/lib/images/client'
import { deleteYDoc, getYDoc } from '@/lib/yjs/doc-store'
import { toPlainTree } from '@/lib/yjs/layout-store'
import { clearDocumentPreview, clearPagePreview } from '@/lib/documents/preview'
import { clearLayoutTreeCache } from '@/lib/use-layout-tree'
import {
  deletePageResources,
  type PageDeletionDependencies,
} from '@/lib/documents/delete-resources'

export { deletePageResources } from '@/lib/documents/delete-resources'

const browserDeletionDependencies: PageDeletionDependencies = {
  async loadTree(pageId) {
    const { doc, synced } = getYDoc(pageId)
    await synced
    return toPlainTree(doc)
  },
  deleteImage: deleteUploadedImage,
  async deleteServerPage(pageId) {
    const response = await fetch(`/api/documents/${pageId}`, { method: 'DELETE' })
    if (!response.ok) throw new Error(`Could not remove saved page (${response.status})`)
  },
  deleteLocalPage: deleteYDoc,
}

export async function deletePage(docId: string, pageId: string): Promise<void> {
  const pageIds = getPageIds(docId)
  if (pageIds.length <= 1) throw new Error('A document must keep at least one page.')
  if (!pageIds.includes(pageId)) throw new Error('Page not found.')
  await deletePageResources(pageId, browserDeletionDependencies)
  clearLayoutTreeCache(pageId)
  await clearPagePreview(pageId)
  removePage(docId, pageId)
}

export async function deleteDocument(docId: string): Promise<void> {
  const pageIds = getPageIds(docId)
  for (const pageId of pageIds) {
    await deletePageResources(pageId, browserDeletionDependencies)
    clearLayoutTreeCache(pageId)
  }
  await clearDocumentPreview(docId, pageIds)
  deleteDocumentMeta(docId)
}
