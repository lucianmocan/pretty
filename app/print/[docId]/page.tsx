import type { ReactNode } from 'react'
import * as Y from 'yjs'
import type { JSONContent } from '@tiptap/core'
import { yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap'
import { renderToReactElement } from '@tiptap/static-renderer'
import { notFound } from 'next/navigation'
import { readDocumentBytes } from '@/lib/documents/store'
import { baseExtensions } from '@/lib/tiptap/extensions'
import { blockFragmentName } from '@/lib/yjs/doc-store'
import { toPlainTree, ROOT_ID } from '@/lib/yjs/layout-store'
import { frameStyle, sizeStyle } from '@/lib/layout/frame-style'
import type { ChildLayout, LayoutNode } from '@/lib/layout/types'
import { CanvasRoot } from '@/components/canvas/canvas-root'
import { CodeChrome } from '@/components/editor/code-chrome'

// Mirrors what editor.state.doc.textContent gives the live side (see
// BlockEditor) -- there's no live ProseMirror doc here, so walk the JSON.
function extractPlainText(node: JSONContent): string {
  if (node.text) return node.text
  if (node.content) return node.content.map(extractPlainText).join('')
  return ''
}

export const dynamic = 'force-dynamic'

interface PrintPageProps {
  params: Promise<{ docId: string }>
}

function canvasPositionStyle(node: LayoutNode, isRoot: boolean, parentChildLayout: ChildLayout) {
  if (isRoot || parentChildLayout !== 'canvas') return undefined
  return { position: 'absolute' as const, left: node.x ?? 0, top: node.y ?? 0 }
}

/** Static (non-draggable) rendering of a frame's callouts -- same visual
 * classes as the live components/canvas/callout.tsx, just a <span> instead
 * of an <input> since nothing here is interactive. */
function renderCallouts(node: LayoutNode): ReactNode {
  return (node.callouts ?? []).map((callout) => (
    <div key={callout.id} className="scripture-callout" style={{ left: callout.dx, top: callout.dy }}>
      <div className="scripture-callout-tail" />
      <span className="scripture-callout-text">{callout.text}</span>
    </div>
  ))
}

/**
 * Walks the same layout tree shape the live canvas does, but renders each
 * leaf via Tiptap's static renderer instead of a live editor -- no live
 * editor is ever mounted here, so this can't diverge from the live canvas's
 * own renderHTML definitions. frameStyle() is the single source of truth for
 * container styling, shared with components/canvas/frame-node.tsx -- same
 * for canvas-mode child positioning (see canvasPositionStyle above).
 */
function renderNode(node: LayoutNode, ydoc: Y.Doc, parentChildLayout: ChildLayout = 'flex'): ReactNode {
  if (node.kind === 'frame') {
    const isRoot = node.id === ROOT_ID
    const childLayout = node.childLayout ?? 'flex'
    return (
      <div
        key={node.id}
        className={[isRoot && 'scripture-card', childLayout === 'canvas' && 'scripture-frame-canvas']
          .filter(Boolean)
          .join(' ')}
        style={{ ...frameStyle(node), ...canvasPositionStyle(node, isRoot, parentChildLayout) }}
      >
        {(node.children ?? []).map((child) => renderNode(child, ydoc, childLayout))}
        {renderCallouts(node)}
      </div>
    )
  }

  const leafPositionStyle = canvasPositionStyle(node, false, parentChildLayout)

  if (node.kind === 'image') {
    return (
      <div key={node.id} className="scripture-leaf" style={{ ...sizeStyle(node), ...leafPositionStyle }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- served from our own /api/images route */}
        {node.src && <img className="scripture-image" src={node.src} alt={node.alt ?? ''} />}
      </div>
    )
  }

  const fragment = ydoc.getXmlFragment(blockFragmentName(node.id))
  const docJSON = yXmlFragmentToProsemirrorJSON(fragment)
  const content = renderToReactElement({ content: docJSON, extensions: baseExtensions() })

  if (node.kind !== 'code') {
    return (
      <div key={node.id} className="scripture-leaf" style={{ ...sizeStyle(node), ...leafPositionStyle }}>
        <div className="scripture-text-editor">{content}</div>
      </div>
    )
  }

  const lineCount = extractPlainText(docJSON).split('\n').length

  return (
    <div key={node.id} className="scripture-leaf" style={{ ...sizeStyle(node), ...leafPositionStyle }}>
      <CodeChrome
        fontFamily={node.fontFamily ?? 'geist-mono'}
        filename={node.filename ?? ''}
        chromeStyle={node.chromeStyle ?? 'none'}
        customChrome={node.customChrome}
        showLineNumbers={node.showLineNumbers ?? false}
        lineCount={lineCount}
        startLineNumber={node.startLineNumber ?? 1}
        ligatures={node.ligatures ?? true}
        lineHeight={node.lineHeight ?? 1.65}
        letterSpacing={node.letterSpacing ?? 0}
        highlightLines={node.highlightLines ?? []}
        trimRanges={node.trimRanges ?? []}
        diffLines={node.diffLines ?? {}}
      >
        <div className="scripture-code-editor">{content}</div>
      </CodeChrome>
    </div>
  )
}

export default async function PrintPage({ params }: PrintPageProps) {
  const { docId } = await params
  const bytes = await readDocumentBytes(docId)
  if (!bytes) notFound()

  const ydoc = new Y.Doc()
  try {
    Y.applyUpdate(ydoc, bytes)
  } catch (err) {
    // Corrupted/undecodable bytes (e.g. disk corruption, manual tampering --
    // writeDocumentBytes' atomic rename already rules out a torn read from a
    // concurrent save) should read as "not found", not an uncaught 500 with
    // a stack trace leaking into the response.
    console.error(`Failed to decode document ${docId}`, err)
    notFound()
  }

  const tree = toPlainTree(ydoc)
  if (!tree) notFound()

  return (
    <CanvasRoot
      printMode
      pageSize={tree.pageSize}
      customPageWidthMm={tree.customPageWidthMm}
      customPageHeightMm={tree.customPageHeightMm}
    >
      {renderNode(tree, ydoc)}
    </CanvasRoot>
  )
}
