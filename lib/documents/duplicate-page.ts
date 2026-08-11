'use client'

import * as Y from 'yjs'
import { insertDuplicatedPage } from '@/lib/documents/manifest'
import { collectByKind } from '@/lib/layout/tree-utils'
import { deleteUploadedImage, duplicateUploadedImage } from '@/lib/images/client'
import { deleteYDoc, getYDoc, LAYOUT_MUTATION_ORIGIN } from '@/lib/yjs/doc-store'
import { ensureRootFrame, toPlainTree, updateImageProps } from '@/lib/yjs/layout-store'

/** Copies a page into a new, independent Y.Doc and only then makes it visible
 * in the document manifest. This includes every Tiptap fragment in the Yjs
 * update, not only the layout tree. */
export async function duplicatePage(docId: string, sourcePageId: string): Promise<string> {
  const duplicatePageId = crypto.randomUUID()
  const duplicatedImageUrls: string[] = []

  try {
    const source = getYDoc(sourcePageId)
    await source.synced
    ensureRootFrame(source.doc)
    const sourceTree = toPlainTree(source.doc)
    if (!sourceTree) throw new Error('The page could not be loaded for duplication.')

    const duplicate = getYDoc(duplicatePageId)
    await duplicate.synced
    Y.applyUpdate(duplicate.doc, Y.encodeStateAsUpdate(source.doc), LAYOUT_MUTATION_ORIGIN)

    // Clone each unique backing file once, then point every matching image
    // node in the new page at that independently-owned URL.
    const duplicatedBySource = new Map<string, string>()
    for (const imageNode of collectByKind(sourceTree, 'image')) {
      const sourceSrc = imageNode.src
      if (!sourceSrc) continue
      let duplicatedSrc = duplicatedBySource.get(sourceSrc)
      if (!duplicatedSrc) {
        duplicatedSrc = await duplicateUploadedImage(sourceSrc)
        duplicatedBySource.set(sourceSrc, duplicatedSrc)
        duplicatedImageUrls.push(duplicatedSrc)
      }
      updateImageProps(duplicate.doc, imageNode.id, { src: duplicatedSrc, retainedSources: [] })
    }

    insertDuplicatedPage(docId, sourcePageId, duplicatePageId)
    return duplicatePageId
  } catch (cause) {
    await Promise.allSettled(duplicatedImageUrls.map((src) => deleteUploadedImage(src)))
    await deleteYDoc(duplicatePageId).catch(() => undefined)
    throw cause
  }
}
