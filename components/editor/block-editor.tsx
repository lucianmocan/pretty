'use client'

import { useEffect, useRef, useState } from 'react'
import { useEditor, useEditorState, EditorContent, type Editor } from '@tiptap/react'
import type { EditorView } from '@tiptap/pm/view'
import type { Transaction } from '@tiptap/pm/state'
import { Collaboration } from '@tiptap/extension-collaboration'
import { getYDoc, getUndoManager, blockFragmentName } from '@/lib/yjs/doc-store'
import { baseExtensions } from '@/lib/tiptap/extensions'
import { tokenizeCode } from '@/lib/shiki/tokenize'
import { syntaxMarkRanges } from '@/lib/tiptap/syntax-highlighting'
import { BubbleToolbar } from './bubble-toolbar'
import { CodeChrome } from './code-chrome'
import { DEFAULT_THEME } from '@/lib/presets'
import { resolveThemeArg } from '@/lib/presets/custom-syntax-themes'
import type { ChromeStyle, CustomChromeStyle } from '@/lib/layout/types'
import { useEditorRegistry } from './editor-registry'
import { indentationBackspaceCount, nextLineIndent, useAutoIndent, useTabSize } from '@/lib/editor-preferences'

const RETOKENIZE_DEBOUNCE_MS = 350

/** Preserve browser focus if this editor owned it immediately before a
 * cosmetic mark transaction, but never steal it after the user moved away. */
function dispatchPreservingFocus(view: EditorView, transaction: Transaction) {
  const hadFocus = view.hasFocus()
  view.dispatch(transaction)
  if (!hadFocus) return
  const restoreDroppedFocus = () => {
    if (view.isDestroyed || view.hasFocus()) return
    const active = document.activeElement
    // A programmatic DOM rebuild drops focus to the document body. If focus
    // belongs to another actual control, the user moved it intentionally.
    if (!active || active === document.body || active === document.documentElement) view.focus()
  }
  restoreDroppedFocus()
  queueMicrotask(restoreDroppedFocus)
}

/** Applies Shiki output as marks only. This function has no operation capable
 * of inserting or deleting a character, which keeps async highlighting safe
 * during fast typing, browser composition, and Yjs synchronization. */
function applyTokenizedMarks(
  view: EditorView,
  text: string,
  language: string,
  lines: Awaited<ReturnType<typeof tokenizeCode>>['lines']
) {
  if (view.state.doc.textContent !== text) return false

  const ranges = syntaxMarkRanges(text, lines)
  const syntaxColor = view.state.schema.marks.syntaxColor
  let tr = view.state.tr
  const contentEnd = 1 + text.length

  if (text.length) tr = tr.removeMark(1, contentEnd, syntaxColor)
  for (const range of ranges) {
    tr = tr.addMark(range.from, range.to, syntaxColor.create(range.attrs))
  }

  const block = tr.doc.firstChild
  if (block && block.type.name === 'annotatedCodeBlock' && block.attrs.language !== language) {
    tr = tr.setNodeMarkup(0, undefined, { ...block.attrs, language })
  }

  // Syntax paint should persist and collaborate, but Cmd/Ctrl+Z must undo
  // the user's last edit rather than an invisible highlighting transaction.
  tr = tr.setMeta('addToHistory', false)

  // Runtime safety belt: future refactors must preserve this invariant too.
  if (tr.doc.textContent !== text) {
    throw new Error('Syntax highlighting attempted to change editor text')
  }

  if (tr.steps.length) dispatchPreservingFocus(view, tr)
  return true
}

export type BlockKind = 'code' | 'text'

interface BlockEditorProps {
  docId: string
  blockId: string
  kind: BlockKind
  // Figma-style selection model (canvas-mode blocks only; frame-node.tsx
  // always passes true for flex-mode blocks, which stay always-editable).
  // false means "selected but not text-editing" -- contenteditable is
  // turned off so plain click+drag on the block means "move it" instead of
  // "place a text cursor", exactly like clicking a shape in Figma.
  editable?: boolean
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
}

/**
 * One Tiptap instance per block, each bound to its own top-level Y.XmlFragment
 * (keyed by blockId) within the SAME Y.Doc, all sharing one Y.UndoManager
 * (see lib/yjs/doc-store.ts) -- that's what gives the whole canvas one
 * unified undo history instead of one per block.
 */
export function BlockEditor({
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
}: BlockEditorProps) {
  const [synced, setSynced] = useState(false)
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

  const { doc: ydoc } = getYDoc(docId)
  const fragment = ydoc.getXmlFragment(blockFragmentName(blockId))
  const undoManager = getUndoManager(docId)

  // `isRetokenizingRef` guards against reacting to our own mark-only
  // transactions. `prevTextRef` is the last highlighted text snapshot.
  const isRetokenizingRef = useRef(false)
  const prevTextRef = useRef<string | null>(null)
  const retokenizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Guards against an OLDER, slower rehighlightCode call resolving
  // AFTER a newer one already started (the debounce timer only prevents two
  // calls being SCHEDULED at once -- once a timer fires and the async
  // tokenizeCode() call is in flight, a slow cold grammar load can easily
  // still be pending when the NEXT debounce window elapses and starts a
  // second call). Every competing async path bumps this first, so stale
  // highlighting is skipped.
  const retokenizeGenerationRef = useRef(0)

  useEffect(() => {
    const generationRef = retokenizeGenerationRef
    return () => {
      if (retokenizeTimerRef.current) clearTimeout(retokenizeTimerRef.current)
      generationRef.current++
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    getYDoc(docId).synced.then(() => {
      if (!cancelled) setSynced(true)
    })
    return () => {
      cancelled = true
    }
  }, [docId])

  async function rehighlightCode(editor: Editor) {
    // Avoid repainting syntax spans while the browser is painting a range
    // selection. onSelectionUpdate schedules the pending pass after collapse.
    if (!editor.state.selection.empty) return
    if (editor.view.composing) {
      scheduleRetokenize(editor)
      return
    }

    const text = editor.state.doc.textContent
    if (prevTextRef.current === text) return

    const generation = ++retokenizeGenerationRef.current
    try {
      const { lines } = await tokenizeCode(
        text,
        languageRef.current ?? 'plaintext',
        resolveThemeArg(themeRef.current)
      )

      // More keystrokes may arrive while tokenization is in flight. Never
      // apply ranges calculated for an older document snapshot.
      if (
        generation !== retokenizeGenerationRef.current ||
        editor.state.doc.textContent !== text ||
        !editor.state.selection.empty ||
        editor.view.composing
      ) {
        if (editor.view.composing) scheduleRetokenize(editor)
        return
      }

      isRetokenizingRef.current = true
      try {
        applyTokenizedMarks(editor.view, text, languageRef.current ?? 'plaintext', lines)
      } finally {
        isRetokenizingRef.current = false
      }

      prevTextRef.current = text
    } catch (err) {
      console.error('Failed to re-highlight edited code', err)
      if (generation === retokenizeGenerationRef.current) prevTextRef.current = text
    }
  }

  function scheduleRetokenize(editor: Editor) {
    if (retokenizeTimerRef.current) clearTimeout(retokenizeTimerRef.current)
    retokenizeTimerRef.current = setTimeout(() => {
      retokenizeTimerRef.current = null
      if (!editor.isDestroyed) void rehighlightCode(editor)
    }, RETOKENIZE_DEBOUNCE_MS)
  }

  const editor = useEditor(
    {
      immediatelyRender: false,
      editable,
      extensions: [
        ...baseExtensions(),
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

          const { from, to, $from } = view.state.selection
          const currentTabSize = tabSizeRef.current
          if (!event.shiftKey) {
            view.dispatch(view.state.tr.insertText(' '.repeat(currentTabSize), from, to).scrollIntoView())
            return true
          }

          // Shift+Tab removes up to one configured indent from the current
          // line and is still consumed when the line is already flush-left,
          // so focus never escapes the code editor in either direction.
          const parentStart = from - $from.parentOffset
          const textBeforeCaret = $from.parent.textBetween(0, $from.parentOffset, '\n', '\n')
          const lineStart = parentStart + textBeforeCaret.lastIndexOf('\n') + 1
          const prefix = view.state.doc.textBetween(
            lineStart,
            Math.min(lineStart + currentTabSize, view.state.doc.content.size)
          )
          const spaces = prefix.match(new RegExp(`^ {1,${currentTabSize}}`))?.[0].length ?? 0
          if (spaces > 0) view.dispatch(view.state.tr.delete(lineStart, lineStart + spaces).scrollIntoView())
          return true
        },
        handlePaste(view, event) {
          if (kind !== 'code') return false // text blocks use Tiptap's default paste

          const text = event.clipboardData?.getData('text/plain').replace(/\r\n?/g, '\n')
          if (!text) return false
          event.preventDefault()

          // Paste behaves like a normal text editor: insert at the caret, or
          // replace only the active selection. Syntax colors are applied by
          // the same debounced mark-only pass used for regular typing.
          if (retokenizeTimerRef.current) {
            clearTimeout(retokenizeTimerRef.current)
            retokenizeTimerRef.current = null
          }
          retokenizeGenerationRef.current++
          const { from, to } = view.state.selection
          view.dispatch(view.state.tr.insertText(text, from, to).scrollIntoView())

          return true
        },
      },
      onUpdate({ editor }) {
        if (kind !== 'code') return
        if (isRetokenizingRef.current || prevTextRef.current === null) {
          // Our own programmatic syntax-mark dispatch
          // or the very first update after content was seeded --
          // resync the baseline, don't treat it as an edit to re-highlight.
          prevTextRef.current = editor.state.doc.textContent
          return
        }
        scheduleRetokenize(editor)
      },
      onSelectionUpdate({ editor }) {
        if (kind !== 'code') return
        if (!editor.state.selection.empty) {
          if (retokenizeTimerRef.current) {
            clearTimeout(retokenizeTimerRef.current)
            retokenizeTimerRef.current = null
          }
          // Also invalidates a tokenizer request that was already in flight.
          retokenizeGenerationRef.current++
          return
        }
        if (
          prevTextRef.current !== null &&
          prevTextRef.current !== editor.state.doc.textContent
        ) {
          scheduleRetokenize(editor)
        }
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
    return () => registry.unregister(blockId)
  }, [editor, blockId, registry])

  // useEditor's initial config value only applies on creation -- toggling
  // `editable` across renders (selected-not-editing <-> double-clicked into
  // edit mode) needs this explicit, imperative call to actually take effect
  // afterward.
  useEffect(() => {
    editor?.setEditable(editable)
  }, [editor, editable])

  // Auto-focuses when a block transitions INTO edit mode (double-click on an
  // existing, already-populated block) -- skips the very first render, so a
  // block that simply mounts already-editable (every flex-mode block, always)
  // doesn't steal focus just by existing. Brand-new empty blocks get their
  // own focus() call below instead, right after seeding their initial content.
  const prevEditableRef = useRef(editable)
  useEffect(() => {
    if (!editor) return
    const wasEditable = prevEditableRef.current
    prevEditableRef.current = editable
    if (!wasEditable && editable) editor.commands.focus()
  }, [editor, editable])

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
    if (kind === 'code') prevTextRef.current = editor.state.doc.textContent
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, synced])

  // Re-highlight existing text when language/theme change via the Inspector
  // (not just new pastes). Skips the very first run after mount -- that's
  // the initial value, not a change, and the content (if any) was already
  // tokenized correctly when it was pasted.
  const prevLangThemeRef = useRef<{ language?: string; theme: string } | null>(null)
  useEffect(() => {
    if (kind !== 'code' || !editor || !synced) return
    const prev = prevLangThemeRef.current
    prevLangThemeRef.current = { language, theme }
    if (!prev || (prev.language === language && prev.theme === theme)) return

    const text = editor.state.doc.textContent
    if (!text) return

    // Invalidates any slower typing-triggered highlight request.
    const generation = ++retokenizeGenerationRef.current
    tokenizeCode(text, language ?? 'plaintext', resolveThemeArg(theme))
      .then(({ lines }) => {
        if (
          generation !== retokenizeGenerationRef.current ||
          editor.state.doc.textContent !== text
        ) {
          return
        }
        isRetokenizingRef.current = true
        try {
          applyTokenizedMarks(editor.view, text, language ?? 'plaintext', lines)
        } finally {
          isRetokenizingRef.current = false
        }
        prevTextRef.current = editor.state.doc.textContent
      })
      .catch((err) => console.error('Failed to re-highlight existing code', err))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, synced, language, theme])

  // Reactive line count for the line-number gutter -- one literal '\n' is
  // always exactly one visual line, since code renders with white-space: pre.
  const lineCount = useEditorState({
    editor,
    selector: ({ editor }) => (editor ? editor.state.doc.textContent.split('\n').length : 1),
  })
  const isEmpty = useEditorState({
    editor,
    selector: ({ editor }) => (editor ? editor.state.doc.textContent.trim().length === 0 : true),
  })

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
      className="scripture-editor-wrapper"
      data-empty={isEmpty || undefined}
      data-kind={kind}
      style={kind === 'code' ? { tabSize } : undefined}
    >
      {editor && <BubbleToolbar editor={editor} />}
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
      lineCount={lineCount ?? 1}
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
