'use client'

import { useEffect, useState, type RefObject } from 'react'
import { yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap'
import {
  ExportDocument,
  type ExportSyntaxSnapshots,
} from '@/components/export/export-document'
import { useLayoutTree } from '@/lib/use-layout-tree'
import { blockFragmentName, getYDoc } from '@/lib/yjs/doc-store'
import { useExportMargin } from '@/lib/app-preferences'
import type { LayoutNode } from '@/lib/layout/types'
import { plainTextFromDocument } from '@/lib/tiptap/syntax-document'
import { tokenizeCodeInWorker } from '@/lib/shiki/client-tokenizer'
import { resolveThemeArg } from '@/lib/presets/custom-syntax-themes'

function collectCodeNodes(node: LayoutNode, result: LayoutNode[] = []): LayoutNode[] {
  if (node.kind === 'code') result.push(node)
  node.children?.forEach((child) => collectCodeNodes(child, result))
  return result
}

function BrowserExportPage({ pageId, margin }: { pageId: string; margin: number }) {
  const tree = useLayoutTree(pageId)
  const [prepared, setPrepared] = useState<{
    tree: LayoutNode
    syntaxSnapshots: ExportSyntaxSnapshots | null
    error: string | null
  } | null>(null)

  useEffect(() => {
    if (!tree) return

    const controller = new AbortController()
    const ydoc = getYDoc(pageId).doc

    void Promise.all(
      collectCodeNodes(tree).map(async (node) => {
        const document = yXmlFragmentToProsemirrorJSON(
          ydoc.getXmlFragment(blockFragmentName(node.id))
        )
        const result = await tokenizeCodeInWorker(
          plainTextFromDocument(document),
          node.language ?? 'plaintext',
          resolveThemeArg(node.theme),
          { signal: controller.signal, priority: 'focused' }
        )
        return [node.id, result.ranges] as const
      })
    )
      .then((entries) => {
        if (!controller.signal.aborted) {
          setPrepared({
            tree,
            syntaxSnapshots: Object.fromEntries(entries),
            error: null,
          })
        }
      })
      .catch((error) => {
        if (controller.signal.aborted) return
        setPrepared({
          tree,
          syntaxSnapshots: null,
          error: error instanceof Error ? error.message : 'Syntax highlighting failed',
        })
      })

    return () => controller.abort()
  }, [pageId, tree])

  const syntaxSnapshots = prepared?.tree === tree ? prepared.syntaxSnapshots : null
  const syntaxError = prepared?.tree === tree ? prepared.error : null

  return (
    <div
      className="scripture-browser-export-page"
      data-export-page-id={pageId}
      data-export-ready={Boolean(tree && syntaxSnapshots)}
      data-export-error={syntaxError ?? undefined}
    >
      {tree && syntaxSnapshots && (
        <ExportDocument
          tree={tree}
          ydoc={getYDoc(pageId).doc}
          margin={margin}
          syntaxSnapshots={syntaxSnapshots}
        />
      )}
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
  const margin = useExportMargin()

  return (
    <div ref={rootRef} className="scripture-browser-export-surfaces" aria-hidden="true">
      {pageIds.map((pageId) => <BrowserExportPage key={pageId} pageId={pageId} margin={margin} />)}
    </div>
  )
}
