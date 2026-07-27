'use client'

import { memo, useEffect, useMemo, useState } from 'react'
import { renderToReactElement } from '@tiptap/static-renderer'
import type { JSONContent } from '@tiptap/core'
import { CodeChrome } from './code-chrome'
import type { BlockEditorProps } from './block-editor'
import { baseExtensions } from '@/lib/tiptap/extensions'
import { blockFragmentName, getUndoManager, getYDoc } from '@/lib/yjs/doc-store'
import {
  findMatchesInStaticBlock,
  replaceAllInStaticBlock,
  replaceMatchInStaticBlock,
  staticBlockJSON,
  staticBlockText,
} from '@/lib/tiptap/static-block-document'
import { useEditorRegistry, type StaticEditorAdapter } from './editor-registry'
import { plainTextFromDocument, withSyntaxRanges } from '@/lib/tiptap/syntax-document'
import { tokenizeCodeInWorker } from '@/lib/shiki/client-tokenizer'
import { useSyntaxPriority } from '@/lib/shiki/use-syntax-priority'
import {
  resolveThemeArg,
  resolveThemeForeground,
  subscribeToCustomSyntaxThemes,
} from '@/lib/presets/custom-syntax-themes'
import type { SyntaxStyleRange } from '@/lib/shiki/token-types'

const staticExtensions = baseExtensions()

export const StaticBlockEditor = memo(function StaticBlockEditor({
  docId,
  blockId,
  kind,
  language,
  theme,
  fontFamily = 'geist-mono',
  filename = '',
  chromeStyle = 'none',
  customChrome,
  showLineNumbers = false,
  startLineNumber = 1,
  ligatures = true,
  lineHeight = 1.65,
  letterSpacing = 0,
  highlightLines = [],
  trimRanges = [],
  diffLines = {},
  onLineClick,
}: BlockEditorProps) {
  const entry = getYDoc(docId)
  const fragment = entry.doc.getXmlFragment(blockFragmentName(blockId))
  const registry = useEditorRegistry()
  const [document, setDocument] = useState<JSONContent | null>(null)
  const [customThemeRevision, setCustomThemeRevision] = useState(0)
  const [highlighted, setHighlighted] = useState<{
    text: string
    language: string
    theme: string
    ranges: SyntaxStyleRange[]
  } | null>(null)
  const { elementRef: syntaxElementRef, priority: syntaxWorkPriority } =
    useSyntaxPriority(kind === 'code' && document !== null)

  const adapter = useMemo<StaticEditorAdapter>(() => ({
    getText: () => staticBlockText(fragment),
    findMatches: (query) => findMatchesInStaticBlock(fragment, query),
    replaceMatch: (match, replacement) => {
      getUndoManager(docId)
      replaceMatchInStaticBlock(fragment, match, replacement)
    },
    replaceAll: (query, replacement) => {
      getUndoManager(docId)
      return replaceAllInStaticBlock(fragment, query, replacement)
    },
    subscribe: (listener) => {
      const observer = () => listener()
      fragment.observeDeep(observer)
      return () => fragment.unobserveDeep(observer)
    },
  }), [docId, fragment])

  useEffect(() => {
    registry.registerStatic(blockId, adapter)
    return () => registry.unregisterStatic(blockId, adapter)
  }, [adapter, blockId, registry])

  useEffect(() => {
    let cancelled = false
    let observing = false
    const update = () => {
      if (!cancelled) setDocument(staticBlockJSON(fragment))
    }
    void entry.synced.then(() => {
      if (cancelled) return
      update()
      fragment.observeDeep(update)
      observing = true
    })
    return () => {
      cancelled = true
      if (observing) fragment.unobserveDeep(update)
    }
  }, [entry.synced, fragment])

  useEffect(() => {
    if (kind !== 'code') return
    return subscribeToCustomSyntaxThemes(() => {
      setCustomThemeRevision((revision) => revision + 1)
    })
  }, [kind])

  useEffect(() => {
    if (kind !== 'code' || !document) return
    const text = plainTextFromDocument(document)
    const currentLanguage = language ?? 'plaintext'
    const currentTheme = resolveThemeArg(theme)
    const currentThemeIdentity =
      typeof currentTheme === 'string' ? currentTheme : String(currentTheme.name)
    const controller = new AbortController()

    void tokenizeCodeInWorker(text, currentLanguage, currentTheme, {
      signal: controller.signal,
      priority: syntaxWorkPriority,
    })
      .then((result) => {
        if (!controller.signal.aborted) {
          setHighlighted({
            text,
            language: currentLanguage,
            theme: currentThemeIdentity,
            ranges: result.ranges,
          })
        }
      })
      .catch((error) => {
        if (!(error instanceof Error && error.name === 'AbortError')) {
          console.error('Failed to highlight static code block', error)
        }
      })

    return () => controller.abort()
  }, [customThemeRevision, document, kind, language, syntaxWorkPriority, theme])

  if (!document) return <div className="scripture-editor-loading">Loading…</div>

  const text = plainTextFromDocument(document)
  const currentTheme = resolveThemeArg(theme)
  const currentThemeIdentity =
    typeof currentTheme === 'string' ? currentTheme : String(currentTheme.name)
  const highlightedDocument =
    kind === 'code' &&
    highlighted?.text === text &&
    highlighted.language === (language ?? 'plaintext') &&
    highlighted.theme === currentThemeIdentity
      ? withSyntaxRanges(document, highlighted.ranges)
      : document
  const content = renderToReactElement({
    content: highlightedDocument,
    extensions: staticExtensions,
  })
  const isEmpty = text.trim().length === 0
  const placeholder = kind === 'code' ? 'Double-click to add code' : 'Double-click to add text'
  const editorContent = (
    <div
      ref={syntaxElementRef}
      className="scripture-editor-wrapper"
      data-empty={isEmpty || undefined}
      data-kind={kind}
      style={kind === 'code' ? { color: resolveThemeForeground(theme) } : undefined}
    >
      {isEmpty && (
        <span className="scripture-editor-placeholder" aria-hidden="true">
          {placeholder}
        </span>
      )}
      <div className={kind === 'code' ? 'scripture-code-editor' : 'scripture-text-editor'}>
        {content}
      </div>
    </div>
  )

  if (kind !== 'code') return editorContent
  return (
    <CodeChrome
      fontFamily={fontFamily}
      filename={filename}
      chromeStyle={chromeStyle}
      customChrome={customChrome}
      showLineNumbers={showLineNumbers}
      lineCount={text.split('\n').length}
      startLineNumber={startLineNumber}
      ligatures={ligatures}
      lineHeight={lineHeight}
      letterSpacing={letterSpacing}
      highlightLines={highlightLines}
      trimRanges={trimRanges}
      diffLines={diffLines}
      onLineClick={onLineClick}
    >
      {editorContent}
    </CodeChrome>
  )
})
