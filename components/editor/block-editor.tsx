'use client'

import { memo, useEffect, useRef, useState, type CSSProperties } from 'react'
import { useEditor, useEditorState, EditorContent, type Editor } from '@tiptap/react'
import { Collaboration } from '@tiptap/extension-collaboration'
import { TextSelection } from '@tiptap/pm/state'
import { getYDoc, getUndoManager, blockFragmentName } from '@/lib/yjs/doc-store'
import { baseExtensions } from '@/lib/tiptap/extensions'
import { tokenizeCodeInWorker } from '@/lib/shiki/client-tokenizer'
import { useSyntaxPriority } from '@/lib/shiki/use-syntax-priority'
import {
  SyntaxDecorations,
  applySyntaxDecorations,
} from '@/lib/tiptap/extensions/syntax-decorations'
import { BubbleToolbar } from './bubble-toolbar'
import { CodeChrome } from './code-chrome'
import { DEFAULT_THEME } from '@/lib/presets'
import {
  resolveThemeArg,
  resolveThemeForeground,
  resolveThemeLineNumberForeground,
  resolveThemeSelectionAccent,
  subscribeToCustomSyntaxThemes,
} from '@/lib/presets/custom-syntax-themes'
import type { ChromeStyle, CustomChromeStyle } from '@/lib/layout/types'
import { useEditorRegistry } from './editor-registry'
import {
  indentationBackspaceCount,
  nextLineIndent,
  selectedLineIndentEdits,
  useAutoIndent,
  useTabSize,
} from '@/lib/editor-preferences'
import { StaticBlockEditor } from './static-block-editor'
import { codeLineFontSizes } from '@/lib/tiptap/line-font-sizes'
import type { TextFontSource, TextFontStyle } from '@/lib/layout/types'
import { textBlockStyle } from '@/lib/layout/text-style'
import { googleFontsInDocument } from '@/lib/google-fonts'
import { GoogleFontLoader } from './google-font-loader'

const RETOKENIZE_DEBOUNCE_MS = 140
const RETOKENIZE_RETRY_MS = 900
const MAX_RETOKENIZE_RETRIES = 2

function themeIdentity(theme: ReturnType<typeof resolveThemeArg>): string {
  return typeof theme === 'string' ? theme : String(theme.name)
}

export type BlockKind = 'code' | 'text'

export interface BlockEditorProps {
  docId: string
  blockId: string
  kind: BlockKind
  // Figma-style selection model (canvas-mode blocks only; frame-node.tsx
  // always passes true for flex-mode blocks, which stay always-editable).
  // false means "selected but not text-editing" and uses the lightweight
  // static renderer, so dragging moves the block instead of placing a cursor.
  editable?: boolean
  // Canvas text blocks keep a read-only editor mounted while selected so the
  // Inspector can format the whole block without first entering text-editing.
  activeForFormatting?: boolean
  focusOnMount?: boolean
  language?: string
  theme?: string
  fontFamily?: string
  filename?: string
  chromeStyle?: ChromeStyle
  customChrome?: CustomChromeStyle
  showLineNumbers?: boolean
  startLineNumber?: number
  ligatures?: boolean
  lineHeight?: number
  letterSpacing?: number
  highlightLines?: Array<[number, number]>
  trimRanges?: Array<[number, number]>
  diffLines?: Record<number, 'add' | 'remove'>
  onLineClick?: (lineNumber: number) => void
  textFontFamily?: string
  textFontSource?: TextFontSource
  textFontWeight?: number
  textFontStyle?: TextFontStyle
  textFontSize?: number
  textLineHeight?: number
  textLetterSpacing?: number
  textColor?: string
}

/**
 * One active Tiptap instance per editable block, bound to its top-level Y.XmlFragment
 * (keyed by blockId) within the SAME Y.Doc, all sharing one Y.UndoManager
 * (see lib/yjs/doc-store.ts) -- that's what gives the whole canvas one
 * unified undo history instead of one per block.
 */
function InteractiveBlockEditor({
  docId,
  blockId,
  kind,
  editable = true,
  language,
  theme = DEFAULT_THEME,
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
  focusOnMount = false,
  textFontFamily = 'Geist Sans',
  textFontSource = 'local',
  textFontWeight = 400,
  textFontStyle = 'normal',
  textFontSize = 16,
  textLineHeight = 1.5,
  textLetterSpacing = 0,
  textColor = 'currentColor',
}: BlockEditorProps) {
  const entry = getYDoc(docId)
  const [syncedDocId, setSyncedDocId] = useState<string | null>(() => entry.isSynced ? docId : null)
  const synced = syncedDocId === docId
  const [customThemeRevision, setCustomThemeRevision] = useState(0)
  const { elementRef: syntaxElementRef, priority: syntaxWorkPriority } =
    useSyntaxPriority(kind === 'code' && synced)
  const syntaxPriorityRef = useRef(syntaxWorkPriority)
  syntaxPriorityRef.current = syntaxWorkPriority
  const tabSize = useTabSize()
  const autoIndent = useAutoIndent()
  const tabSizeRef = useRef(tabSize)
  const autoIndentRef = useRef(autoIndent)
  tabSizeRef.current = tabSize
  autoIndentRef.current = autoIndent
  const languageRef = useRef(language)
  const themeRef = useRef(theme)
  languageRef.current = language
  themeRef.current = theme

  const { doc: ydoc } = entry
  const fragment = ydoc.getXmlFragment(blockFragmentName(blockId))
  const undoManager = getUndoManager(docId)

  const lastHighlightedRef = useRef<{
    text: string
    language: string
    theme: string
  } | null>(null)
  const retokenizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const retokenizeAbortRef = useRef<AbortController | null>(null)
  const retokenizeGenerationRef = useRef(0)
  const retokenizeRetryRef = useRef(0)

  useEffect(() => {
    const generationRef = retokenizeGenerationRef
    return () => {
      if (retokenizeTimerRef.current) clearTimeout(retokenizeTimerRef.current)
      retokenizeAbortRef.current?.abort()
      generationRef.current++
    }
  }, [])

  useEffect(() => {
    if (kind !== 'code') return
    return subscribeToCustomSyntaxThemes(() => {
      setCustomThemeRevision((revision) => revision + 1)
    })
  }, [kind])

  useEffect(() => {
    if (entry.isSynced) {
      setSyncedDocId(docId)
      return
    }
    let cancelled = false
    entry.synced.then(() => {
      if (!cancelled) setSyncedDocId(docId)
    })
    return () => {
      cancelled = true
    }
  }, [docId, entry])

  async function rehighlightCode(editor: Editor) {
    if (editor.view.composing) {
      scheduleRetokenize(editor, 80, false)
      return
    }

    const text = editor.state.doc.textContent
    const currentLanguage = languageRef.current ?? 'plaintext'
    const currentTheme = resolveThemeArg(themeRef.current)
    const currentThemeIdentity = themeIdentity(currentTheme)
    const lastHighlighted = lastHighlightedRef.current
    if (
      lastHighlighted?.text === text &&
      lastHighlighted.language === currentLanguage &&
      lastHighlighted.theme === currentThemeIdentity
    ) {
      return
    }

    const generation = ++retokenizeGenerationRef.current
    retokenizeAbortRef.current?.abort()
    const controller = new AbortController()
    retokenizeAbortRef.current = controller
    try {
      const { ranges } = await tokenizeCodeInWorker(
        text,
        currentLanguage,
        currentTheme,
        {
          signal: controller.signal,
          priority: editor.view.hasFocus() ? 'focused' : syntaxPriorityRef.current,
        }
      )

      if (
        generation !== retokenizeGenerationRef.current ||
        editor.state.doc.textContent !== text ||
        editor.view.composing
      ) {
        if (editor.view.composing) scheduleRetokenize(editor, 80, false)
        return
      }

      if (!applySyntaxDecorations(editor.view, text, ranges)) return
      lastHighlightedRef.current = {
        text,
        language: currentLanguage,
        theme: currentThemeIdentity,
      }
      retokenizeRetryRef.current = 0
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      console.error('Failed to re-highlight edited code', err)
      if (
        generation === retokenizeGenerationRef.current &&
        retokenizeRetryRef.current < MAX_RETOKENIZE_RETRIES
      ) {
        retokenizeRetryRef.current++
        scheduleRetokenize(
          editor,
          RETOKENIZE_RETRY_MS * retokenizeRetryRef.current,
          false
        )
      }
    } finally {
      if (retokenizeAbortRef.current === controller) retokenizeAbortRef.current = null
    }
  }

  function scheduleRetokenize(
    editor: Editor,
    delay = RETOKENIZE_DEBOUNCE_MS,
    invalidateInFlight = true
  ) {
    if (retokenizeTimerRef.current) clearTimeout(retokenizeTimerRef.current)
    if (invalidateInFlight) {
      retokenizeAbortRef.current?.abort()
      retokenizeGenerationRef.current++
    }
    retokenizeTimerRef.current = setTimeout(() => {
      retokenizeTimerRef.current = null
      if (!editor.isDestroyed) void rehighlightCode(editor)
    }, delay)
  }

  const editor = useEditor(
    {
      immediatelyRender: false,
      shouldRerenderOnTransaction: false,
      editable,
      extensions: [
        ...baseExtensions(),
        ...(kind === 'code' ? [SyntaxDecorations] : []),
        Collaboration.configure({ fragment, yUndoOptions: { undoManager } }),
      ],
      editorProps: {
        attributes: {
          class: kind === 'code' ? 'scripture-code-editor' : 'scripture-text-editor',
          spellcheck: 'false',
        },
        handleKeyDown(view, event) {
          if (kind !== 'code') return false

          if (event.key === 'Enter' && autoIndentRef.current && !event.isComposing) {
            const { from, to, $from } = view.state.selection
            const textBeforeCaret = $from.parent.textBetween(0, $from.parentOffset, '\n', '\n')
            const indent = nextLineIndent(textBeforeCaret, tabSizeRef.current)
            event.preventDefault()
            view.dispatch(view.state.tr.insertText(`\n${indent}`, from, to).scrollIntoView())
            return true
          }

          if (event.key === 'Backspace') {
            const { empty, from, $from } = view.state.selection
            if (!empty || event.altKey || event.ctrlKey || event.metaKey || event.isComposing) return false

            const textBeforeCaret = $from.parent.textBetween(0, $from.parentOffset, '\n', '\n')
            const spaces = indentationBackspaceCount(textBeforeCaret, tabSizeRef.current)
            if (spaces === 0) return false

            event.preventDefault()
            view.dispatch(view.state.tr.delete(from - spaces, from).scrollIntoView())
            return true
          }

          if (event.key !== 'Tab') return false
          event.preventDefault()

          const { from, to } = view.state.selection
          const currentTabSize = tabSizeRef.current
          if (!event.shiftKey && from === to) {
            view.dispatch(view.state.tr.insertText(' '.repeat(currentTabSize), from, to).scrollIntoView())
            return true
          }

          const edits = selectedLineIndentEdits(
            view.state.doc.textContent,
            from - 1,
            to - 1,
            currentTabSize,
            event.shiftKey
          )
          if (edits.length === 0) return true

          let transaction = view.state.tr
          for (const edit of [...edits].reverse()) {
            transaction = transaction.insertText(edit.text, edit.from + 1, edit.to + 1)
          }
          transaction = transaction.setSelection(
            TextSelection.create(
              transaction.doc,
              transaction.mapping.map(from),
              transaction.mapping.map(to)
            )
          )
          view.dispatch(transaction.scrollIntoView())
          return true
        },
        handlePaste(view, event) {
          if (kind !== 'code') return false // text blocks use Tiptap's default paste

          const text = event.clipboardData?.getData('text/plain').replace(/\r\n?/g, '\n')
          if (!text) return false
          event.preventDefault()

          // Paste behaves like a normal text editor: insert at the caret, or
          // replace only the active selection. The normal update hook queues
          // a fresh, non-document-mutating syntax decoration pass.
          const { from, to } = view.state.selection
          view.dispatch(view.state.tr.insertText(text, from, to).scrollIntoView())

          return true
        },
      },
      onUpdate({ editor }) {
        if (kind !== 'code') return
        retokenizeRetryRef.current = 0
        scheduleRetokenize(editor)
      },
      onFocus({ editor }) {
        if (kind === 'code') scheduleRetokenize(editor, 0)
      },
    },
    [fragment, undoManager]
  )

  // Register this block's live editor instance for search/replace (see
  // components/editor/editor-registry.tsx) -- every block renders
  // simultaneously, so the registry is always complete.
  const registry = useEditorRegistry()
  useEffect(() => {
    if (!editor) return
    registry.register(blockId, editor)
    return () => registry.unregister(blockId, editor)
  }, [editor, blockId, registry])

  // useEditor's initial config value only applies on creation -- toggling
  // `editable` across renders (selected-not-editing <-> double-clicked into
  // edit mode) needs this explicit, imperative call to actually take effect
  // afterward.
  useEffect(() => {
    editor?.setEditable(editable)
  }, [editor, editable])

  useEffect(() => {
    // Existing canvas blocks mount the interactive editor before the Yjs
    // sync promise settles. Until `synced` is true EditorContent is not in
    // the DOM, so an earlier focus() succeeds only internally and no caret
    // appears. Focus after the synced render has committed instead.
    if (editor && synced && focusOnMount) editor.commands.focus()
  }, [editor, focusOnMount, synced])

  // Seed initial content once synced, if this block's fragment is still empty.
  useEffect(() => {
    if (!editor || !synced) return
    if (fragment.length === 0) {
      const initial =
        kind === 'code'
          ? { type: 'annotatedCodeBlock', attrs: { language: language ?? 'plaintext' }, content: [] }
          : { type: 'paragraph', content: [] }
      editor.commands.setContent({ type: 'doc', content: [initial] })
      // A brand-new block, unlike an existing one transitioning into edit
      // mode (handled above), never sees an editable false->true transition
      // within its own mount lifecycle if it's created already-editable (the
      // common case: flex mode always, or canvas mode when the creating
      // action pre-selects editingId) -- so it needs its own direct focus()
      // call, scoped to "just seeded empty content" as the signal for "this
      // is new", not a generic mount-time focus that would steal focus from
      // every already-populated block reloaded from a saved document.
      if (editable) editor.commands.focus()
    }
    if (kind === 'code') {
      // Older documents stored every syntax token as collaborative marks.
      // Remove only those obsolete marks once; all new highlighting is local
      // decoration state and never enters Yjs or the undo stack.
      const syntaxColor = editor.state.schema.marks.syntaxColor
      const contentEnd = editor.state.doc.content.size
      if (syntaxColor && contentEnd > 0) {
        const transaction = editor.state.tr
          .removeMark(0, contentEnd, syntaxColor)
          .setMeta('addToHistory', false)
        if (transaction.steps.length) editor.view.dispatch(transaction)
      }
      lastHighlightedRef.current = null
      scheduleRetokenize(editor, 0)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, synced])

  // Re-highlight on the first load and whenever the language or theme changes.
  // Custom theme edits can keep the same stored id, so their storage revision
  // is also part of this trigger.
  useEffect(() => {
    if (kind !== 'code' || !editor || !synced) return
    const block = editor.state.doc.firstChild
    const currentLanguage = language ?? 'plaintext'
    if (
      block?.type.name === 'annotatedCodeBlock' &&
      block.attrs.language !== currentLanguage
    ) {
      editor.view.dispatch(
        editor.state.tr
          .setNodeMarkup(0, undefined, { ...block.attrs, language: currentLanguage })
          .setMeta('addToHistory', false)
      )
    }
    lastHighlightedRef.current = null
    retokenizeRetryRef.current = 0
    scheduleRetokenize(editor, 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, synced, language, theme, customThemeRevision])

  useEffect(() => {
    if (
      kind === 'code' &&
      editor &&
      synced &&
      syntaxWorkPriority === 'visible'
    ) {
      scheduleRetokenize(editor, 0)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, synced, kind, syntaxWorkPriority])

  // Reactive line count for the line-number gutter -- one literal '\n' is
  // always exactly one visual line, since code renders with white-space: pre.
  const renderedEditorState = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => {
      const text = currentEditor?.state.doc.textContent ?? ''
      return {
        lineCount: text.split('\n').length,
        isEmpty: text.trim().length === 0,
        lineFontSizes: currentEditor ? codeLineFontSizes(currentEditor.getJSON()) : [],
        googleFonts: currentEditor && kind === 'text'
          ? googleFontsInDocument(currentEditor.getJSON(), textFontFamily, textFontSource)
          : [],
      }
    },
  })
  const lineCount = renderedEditorState?.lineCount ?? 1
  const isEmpty = renderedEditorState?.isEmpty ?? true
  const lineFontSizes = renderedEditorState?.lineFontSizes ?? []
  const googleFonts = renderedEditorState?.googleFonts ?? []

  if (!synced) {
    return <div className="scripture-editor-loading">Loading…</div>
  }

  const placeholder =
    kind === 'code'
      ? editable
        ? 'Paste or type code…'
        : 'Double-click to add code'
      : editable
        ? 'Write something…'
        : 'Double-click to add text'

  const editorContent = (
    <div
      ref={syntaxElementRef}
      className="scripture-editor-wrapper"
      data-empty={isEmpty || undefined}
      data-kind={kind}
      style={
        kind === 'code'
          ? {
              tabSize,
              color: resolveThemeForeground(theme),
              '--scripture-code-selection-accent': resolveThemeSelectionAccent(theme),
            } as CSSProperties
          : textBlockStyle({
              textFontFamily,
              textFontSource,
              textFontWeight,
              textFontStyle,
              textFontSize,
              textLineHeight,
              textLetterSpacing,
              textColor,
            })
      }
    >
      <GoogleFontLoader families={googleFonts} />
      {editor && (
        <BubbleToolbar
          editor={editor}
          kind={kind}
          fontFamily={kind === 'text' ? textFontFamily : fontFamily}
          fontSource={kind === 'text' ? textFontSource : 'local'}
        />
      )}
      {isEmpty && (
        <span className="scripture-editor-placeholder" aria-hidden="true">
          {placeholder}
        </span>
      )}
      <EditorContent editor={editor} />
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
      lineNumberColor={resolveThemeLineNumberForeground(theme)}
      foregroundColor={resolveThemeForeground(theme)}
      lineCount={lineCount}
      lineFontSizes={lineFontSizes}
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
}

/** Canvas blocks stay as inexpensive static markup until the user enters
 * text-edit mode; flex-flow blocks remain continuously editable. */
export const BlockEditor = memo(function BlockEditor(props: BlockEditorProps) {
  const editable = props.editable ?? true
  if (!editable && !props.activeForFormatting) return <StaticBlockEditor {...props} />
  return <InteractiveBlockEditor {...props} />
})
