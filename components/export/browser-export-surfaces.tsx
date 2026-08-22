'use client'

import { memo, useEffect, useState, type RefObject } from 'react'
import { yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap'
import {
  collectExportFontFamilies,
  ExportDocument,
  type ExportSyntaxSnapshots,
} from '@/components/export/export-document'
import { useLayoutTree } from '@/lib/use-layout-tree'
import { blockFragmentName, getYDoc } from '@/lib/yjs/doc-store'
import { useExportMargin } from '@/lib/app-preferences'
import { loadGoogleFontCatalog, type GoogleFontFamily } from '@/lib/google-fonts'
import { embedSystemFontFaces } from '@/lib/system-fonts'
import type { LayoutNode } from '@/lib/layout/types'
import { plainTextFromDocument } from '@/lib/tiptap/syntax-document'
import { tokenizeCodeInWorker } from '@/lib/shiki/client-tokenizer'
import { resolveThemeArg } from '@/lib/presets/custom-syntax-themes'
import type { PageNumberSettings } from '@/lib/documents/manifest'
import { resolvePageNumber } from '@/lib/documents/page-numbers'

function collectCodeNodes(node: LayoutNode, result: LayoutNode[] = []): LayoutNode[] {
  if (node.kind === 'code') result.push(node)
  node.children?.forEach((child) => collectCodeNodes(child, result))
  return result
}

export const BrowserExportPage = memo(function BrowserExportPage({
  pageId,
  margin,
  priority = 'focused',
  allowSyntaxFallback = false,
  revision = 0,
  pageNumber,
}: {
  pageId: string
  margin: number
  priority?: 'focused' | 'background'
  allowSyntaxFallback?: boolean
  revision?: number
  pageNumber?: { number: number; settings: PageNumberSettings }
}) {
  const tree = useLayoutTree(pageId)
  const [prepared, setPrepared] = useState<{
    tree: LayoutNode
    revision: number
    syntaxSnapshots: ExportSyntaxSnapshots | null
    fontCatalog: GoogleFontFamily[] | null
    systemFontFaceCss: string | null
    error: string | null
  } | null>(null)

  useEffect(() => {
    if (!tree) return

    const controller = new AbortController()
    const ydoc = getYDoc(pageId).doc
    const systemFontFamilies = new Set<string>()
    collectExportFontFamilies(tree, ydoc, 'system', systemFontFamilies)

    // Load the weight-axis catalog alongside syntax highlighting, before
    // marking this page export-ready -- GoogleFontStylesheet needs it to
    // request the same bold/italic weights the live canvas already has, or
    // font-synthesis: none leaves those runs on a system fallback font with
    // different metrics, wrapping text differently than the live canvas.
    // Device fonts have the same problem for a different reason: the export
    // capture draws through an SVG-in-<img> pipeline that doesn't resolve
    // OS-installed fonts by name at all, so their real font files are
    // embedded as data-URL @font-face rules instead (see embedSystemFontFaces).
    void Promise.all([
      Promise.all(
        collectCodeNodes(tree).map(async (node) => {
          const document = yXmlFragmentToProsemirrorJSON(
            ydoc.getXmlFragment(blockFragmentName(node.id))
          )
          const result = await tokenizeCodeInWorker(
            plainTextFromDocument(document),
            node.language ?? 'plaintext',
            resolveThemeArg(node.theme),
            { signal: controller.signal, priority }
          )
          return [node.id, result.ranges] as const
        })
      ),
      loadGoogleFontCatalog().catch(() => null),
      embedSystemFontFaces([...systemFontFamilies]).catch(() => null),
    ])
      .then(([entries, fontCatalog, systemFontFaceCss]) => {
        if (!controller.signal.aborted) {
          setPrepared({
            tree,
            revision,
            syntaxSnapshots: Object.fromEntries(entries),
            fontCatalog,
            systemFontFaceCss,
            error: null,
          })
        }
      })
      .catch((error) => {
        if (controller.signal.aborted) return
        setPrepared({
          tree,
          revision,
          syntaxSnapshots: null,
          fontCatalog: null,
          systemFontFaceCss: null,
          error: error instanceof Error ? error.message : 'Syntax highlighting failed',
        })
      })

    return () => controller.abort()
  }, [pageId, priority, revision, tree])

  const preparedIsCurrent = prepared?.tree === tree && prepared.revision === revision
  const syntaxSnapshots = preparedIsCurrent ? prepared.syntaxSnapshots : null
  const syntaxError = preparedIsCurrent ? prepared.error : null
  const fontCatalog = preparedIsCurrent ? prepared.fontCatalog : null
  const systemFontFaceCss = preparedIsCurrent ? prepared.systemFontFaceCss : null
  const renderableSnapshots = syntaxSnapshots ?? (allowSyntaxFallback && syntaxError ? {} : null)

  return (
    <div
      className="scripture-browser-export-page"
      data-export-page-id={pageId}
      data-export-ready={Boolean(tree && renderableSnapshots)}
      data-export-error={!allowSyntaxFallback ? (syntaxError ?? undefined) : undefined}
    >
      {tree && renderableSnapshots && (
        <ExportDocument
          tree={tree}
          ydoc={getYDoc(pageId).doc}
          margin={margin}
          syntaxSnapshots={renderableSnapshots}
          pageNumber={pageNumber}
          fontCatalog={fontCatalog ?? undefined}
          systemFontFaceCss={systemFontFaceCss}
        />
      )}
    </div>
  )
})

export function BrowserExportSurfaces({
  pageIds,
  pageNumberSettings,
  rootRef,
}: {
  pageIds: string[]
  pageNumberSettings: PageNumberSettings
  rootRef: RefObject<HTMLDivElement | null>
}) {
  const margin = useExportMargin()

  return (
    <div ref={rootRef} className="scripture-browser-export-surfaces" aria-hidden="true">
      {pageIds.map((pageId) => {
        const pageNumber = resolvePageNumber(pageIds, pageId, pageNumberSettings)
        return (
          <BrowserExportPage
            key={pageId}
            pageId={pageId}
            margin={margin}
            pageNumber={pageNumber
              ? { number: pageNumber.number, settings: pageNumberSettings }
              : undefined}
          />
        )
      })}
    </div>
  )
}
