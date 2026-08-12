import type { JSONContent } from '@tiptap/core'
import { yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap'
import { getYDoc, blockFragmentName } from '@/lib/yjs/doc-store'
import { toPlainTree } from '@/lib/yjs/layout-store'
import { collectByKind } from '@/lib/layout/tree-utils'
import { getPageIds } from './manifest'

// There's no live ProseMirror doc here (this runs outside the editor), so
// walk the plain JSON content tree directly instead.
function extractPlainText(node: JSONContent): string {
  if (node.text) return node.text
  if (node.content) return node.content.map(extractPlainText).join('')
  return ''
}

/**
 * Concatenated, lowercased plain text of every code/text block (plus code
 * block filenames) across every page of a document. Document content lives
 * in per-page Y.Docs, not the lightweight localStorage manifest, so this
 * loads each page from IndexedDB (already cached after the first open) to
 * build a searchable string for the dashboard's search box.
 */
export async function extractDocumentText(docId: string): Promise<string> {
  const parts: string[] = []
  for (const pageId of getPageIds(docId)) {
    const { doc, synced } = getYDoc(pageId)
    await synced
    const tree = toPlainTree(doc)
    if (!tree) continue
    for (const node of [...collectByKind(tree, 'code'), ...collectByKind(tree, 'text')]) {
      if (node.kind === 'code' && node.filename) parts.push(node.filename)
      const fragment = doc.getXmlFragment(blockFragmentName(node.id))
      parts.push(extractPlainText(yXmlFragmentToProsemirrorJSON(fragment)))
    }
  }
  return parts.join(' ').toLowerCase()
}
