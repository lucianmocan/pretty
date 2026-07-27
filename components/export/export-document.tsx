import type { ReactNode } from 'react'
import type { JSONContent } from '@tiptap/core'
import { renderToReactElement } from '@tiptap/static-renderer'
import { yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap'
import type * as Y from 'yjs'
import { CanvasRoot } from '@/components/canvas/canvas-root'
import { CodeChrome } from '@/components/editor/code-chrome'
import {
  contentOverflowStyle,
  frameInnerStyle,
  frameOuterStyle,
  outerBoxStyle,
} from '@/lib/layout/frame-style'
import type { ChildLayout, LayoutNode } from '@/lib/layout/types'
import { resolveThemeBackground } from '@/lib/presets/custom-syntax-themes'
import { baseExtensions } from '@/lib/tiptap/extensions'
import { blockFragmentName } from '@/lib/yjs/doc-store'
import { ROOT_ID } from '@/lib/yjs/layout-store'

function extractPlainText(node: JSONContent): string {
  if (node.text) return node.text
  if (node.content) return node.content.map(extractPlainText).join('')
  return ''
}

function canvasPositionStyle(node: LayoutNode, isRoot: boolean, parentChildLayout: ChildLayout) {
  if (isRoot || parentChildLayout !== 'canvas') return undefined
  return { position: 'absolute' as const, left: node.x ?? 0, top: node.y ?? 0 }
}

function autoSizeClasses(node: LayoutNode): string[] {
  return [
    node.width == null ? 'scripture-auto-width' : '',
    node.height == null ? 'scripture-auto-height' : '',
  ].filter(Boolean)
}

function renderCallouts(node: LayoutNode): ReactNode {
  return (node.callouts ?? []).map((callout) => (
    <div key={callout.id} className="scripture-callout" style={{ left: callout.dx, top: callout.dy }}>
      <div className="scripture-callout-tail" />
      <span className="scripture-callout-text">{callout.text}</span>
    </div>
  ))
}

function renderNode(node: LayoutNode, ydoc: Y.Doc, parentChildLayout: ChildLayout = 'flex'): ReactNode {
  if (node.kind === 'frame') {
    const isRoot = node.id === ROOT_ID
    const childLayout = node.childLayout ?? 'flex'
    return (
      <div
        key={node.id}
        className={[
          'scripture-frame',
          isRoot && 'scripture-card',
          childLayout === 'canvas' && 'scripture-frame-canvas',
          ...autoSizeClasses(node),
        ]
          .filter(Boolean)
          .join(' ')}
        style={{ ...frameOuterStyle(node), ...canvasPositionStyle(node, isRoot, parentChildLayout) }}
      >
        <div className="scripture-frame-content" style={frameInnerStyle(node)}>
          {(node.children ?? []).map((child) => renderNode(child, ydoc, childLayout))}
        </div>
        {renderCallouts(node)}
      </div>
    )
  }

  const positionStyle = canvasPositionStyle(node, false, parentChildLayout)
  if (node.kind === 'image') {
    return (
      <div
        key={node.id}
        className={['scripture-leaf', ...autoSizeClasses(node)].join(' ')}
        style={{ ...outerBoxStyle(node), ...positionStyle }}
      >
        <div className="scripture-leaf-content" style={contentOverflowStyle(node)}>
          {/* eslint-disable-next-line @next/next/no-img-element -- export must preserve the source exactly */}
          {node.src && <img className="scripture-image" src={node.src} alt={node.alt ?? ''} />}
        </div>
      </div>
    )
  }

  const docJSON = yXmlFragmentToProsemirrorJSON(ydoc.getXmlFragment(blockFragmentName(node.id)))
  const content = renderToReactElement({ content: docJSON, extensions: baseExtensions() })
  if (node.kind !== 'code') {
    return (
      <div
        key={node.id}
        className={['scripture-leaf', ...autoSizeClasses(node)].join(' ')}
        style={{ ...outerBoxStyle(node), ...positionStyle }}
      >
        <div className="scripture-leaf-content" style={contentOverflowStyle(node)}>
          <div className="scripture-text-editor">{content}</div>
        </div>
      </div>
    )
  }

  const lineCount = extractPlainText(docJSON).split('\n').length
  return (
    <div
      key={node.id}
      className={['scripture-leaf', 'scripture-code-leaf', ...autoSizeClasses(node)].join(' ')}
      style={{
        ...outerBoxStyle(node),
        background: node.themeBackground ?? resolveThemeBackground(node.theme),
        ...positionStyle,
      }}
    >
      <div className="scripture-leaf-content" style={contentOverflowStyle(node)}>
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
    </div>
  )
}

export function ExportDocument({ tree, ydoc, margin }: { tree: LayoutNode; ydoc: Y.Doc; margin?: number }) {
  return (
    <CanvasRoot
      printMode
      pageSize={tree.pageSize}
      customPageWidthMm={tree.customPageWidthMm}
      customPageHeightMm={tree.customPageHeightMm}
      exportMarginPx={margin}
    >
      {renderNode(tree, ydoc)}
    </CanvasRoot>
  )
}
