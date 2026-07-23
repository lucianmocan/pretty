'use client'

import { useEffect, useRef, useState } from 'react'
import { useEditor, useEditorState, EditorContent, type Editor } from '@tiptap/react'
import type { EditorView } from '@tiptap/pm/view'
import { Collaboration } from '@tiptap/extension-collaboration'
import { getYDoc, getUndoManager, blockFragmentName } from '@/lib/yjs/doc-store'
import { setRootBackgroundIfAuto } from '@/lib/yjs/layout-store'
import { baseExtensions } from '@/lib/tiptap/extensions'
import { tokenizeCode } from '@/lib/shiki/tokenize'
import { tokensToContent, type ProseMirrorTextNode } from '@/lib/tiptap/shiki-to-doc'
import { BubbleToolbar } from './bubble-toolbar'
import { CodeChrome } from './code-chrome'
import { DEFAULT_THEME } from '@/lib/presets'
import { resolveThemeArg } from '@/lib/presets/custom-syntax-themes'
import type { PlainToken } from '@/lib/shiki/tokenize'
import type { ChromeStyle, CustomChromeStyle } from '@/lib/layout/types'
import { useEditorRegistry } from './editor-registry'

const RETOKENIZE_DEBOUNCE_MS = 350

function toProseMirrorNodes(view: EditorView, nodes: ProseMirrorTextNode[]) {
  return nodes.map((n) => view.state.schema.text(n.text, n.marks?.map((m) => view.state.schema.marks[m.type].create(m.attrs))))
}

/** Replaces the whole block's content with freshly tokenized text -- used
 * both for the initial paste and for re-highlighting existing text when the
 * language/theme changes (this intentionally drops any manual bold/italic/
 * highlight/font-size marks, same trade-off as a fresh paste). */
function replaceWithTokenizedContent(view: EditorView, language: string, lines: PlainToken[][]) {
  const content = tokensToContent(lines)
  const node = view.state.schema.nodes.annotatedCodeBlock.create(
    { language },
    content.length ? toProseMirrorNodes(view, content) : null
  )
  const tr = view.state.tr.replaceWith(0, view.state.doc.content.size, node)
  view.dispatch(tr)
}

/** Starting character offset of each line within `lines.join('\n')`. */
function lineStartOffsets(lines: string[]): number[] {
  const offsets: number[] = []
  let offset = 0
  for (const line of lines) {
    offsets.push(offset)
    offset += line.length + 1
  }
  return offsets
}

/** Slices a tokenized line down to a [start, end) character range, splitting
 * any token straddling that boundary -- used so re-tokenizing only the
 * substring that actually changed (see retokenizeChangedLines) doesn't need
 * the tokenizer to already work in character ranges. */
function sliceTokensByChars(tokens: PlainToken[], start: number, end: number): PlainToken[] {
  const result: PlainToken[] = []
  let pos = 0
  for (const tok of tokens) {
    const tokStart = pos
    const tokEnd = pos + tok.content.length
    pos = tokEnd
    if (tokEnd <= start || tokStart >= end) continue
    const sliceStart = Math.max(0, start - tokStart)
    const sliceEnd = Math.min(tok.content.length, end - tokStart)
    if (sliceEnd > sliceStart) result.push({ ...tok, content: tok.content.slice(sliceStart, sliceEnd) })
  }
  return result
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
  // Called when the user clicks away from a block that's completely empty --
  // the caller (frame-node.tsx) wires this to the same removeNode used by
  // the delete button, so an untouched/emptied block doesn't linger around
  // invisible and hard to find.
  onEmptyBlur?: () => void
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
  onEmptyBlur,
}: BlockEditorProps) {
  const [synced, setSynced] = useState(false)
  const languageRef = useRef(language)
  const themeRef = useRef(theme)
  languageRef.current = language
  themeRef.current = theme

  const { doc: ydoc } = getYDoc(docId)
  const fragment = ydoc.getXmlFragment(blockFragmentName(blockId))
  const undoManager = getUndoManager(docId)

  // Per-line incremental re-highlighting while typing (see retokenizeChangedLines
  // below). `isRetokenizingRef` guards against reacting to our OWN programmatic
  // dispatches (paste, language/theme change, or this feature's own replace) --
  // each of those triggers onUpdate again since it's a normal transaction
  // dispatch through the same EditorView. `prevTextRef` is the baseline the
  // next genuine edit gets diffed against; it's resynced (not diffed) whenever
  // isRetokenizingRef is set, and left `null` until the first real update so
  // the initial-content-seeding effect's own dispatch is never mistaken for
  // an edit either.
  const isRetokenizingRef = useRef(false)
  const prevTextRef = useRef<string | null>(null)
  const retokenizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Guards against an OLDER, slower retokenizeChangedLines call resolving
  // AFTER a newer one already started (the debounce timer only prevents two
  // calls being SCHEDULED at once -- once a timer fires and the async
  // tokenizeCode() call is in flight, a slow cold grammar load can easily
  // still be pending when the NEXT debounce window elapses and starts a
  // second call). Every dispatch path that replaces this block's content
  // bumps this first, so a stale in-flight response can tell it's been
  // superseded and skip applying its now-wrong-range replacement instead of
  // corrupting the document or clobbering a newer path's own state.
  const retokenizeGenerationRef = useRef(0)

  useEffect(() => {
    let cancelled = false
    getYDoc(docId).synced.then(() => {
      if (!cancelled) setSynced(true)
    })
    return () => {
      cancelled = true
    }
  }, [docId])

  async function retokenizeChangedLines(editor: Editor) {
    const newText = editor.state.doc.textContent
    const oldText = prevTextRef.current ?? newText
    if (oldText === newText) return

    const generation = ++retokenizeGenerationRef.current
    try {
      const { lines: tokenizedLines, themeBg } = await tokenizeCode(
        newText,
        languageRef.current ?? 'plaintext',
        resolveThemeArg(themeRef.current)
      )

      // A NEWER call (or a paste/language/theme change) already started
      // since this one began -- this response's from/to were computed
      // against a document snapshot that's no longer current, so applying
      // it now would either corrupt content or clobber state the newer
      // path already set correctly. Let that newer path be authoritative.
      if (generation !== retokenizeGenerationRef.current) return

      const oldLines = oldText.split('\n')
      const newLines = newText.split('\n')

      let from: number
      let to: number
      let replacementLines: PlainToken[][]

      if (oldLines.length === newLines.length) {
        // Fast path: typing within a single line is the overwhelmingly
        // common case when line counts match -- find that one line, then
        // narrow further to just its differing SUBSTRING (common prefix/
        // suffix diff), not the whole line. Replacing the whole line would
        // silently wipe any manual bold/italic/highlight mark elsewhere on
        // it, not just at the edit point -- everything before and after the
        // actual edit keeps its existing marks (and the cursor position,
        // auto-mapped by the transaction) this way.
        const lineIndex = newLines.findIndex((line, i) => line !== oldLines[i])
        if (lineIndex === -1) return
        const oldLine = oldLines[lineIndex]
        const newLine = newLines[lineIndex]
        const maxCommon = Math.min(oldLine.length, newLine.length)
        let prefixLen = 0
        while (prefixLen < maxCommon && oldLine[prefixLen] === newLine[prefixLen]) prefixLen++
        let suffixLen = 0
        while (
          suffixLen < maxCommon - prefixLen &&
          oldLine[oldLine.length - 1 - suffixLen] === newLine[newLine.length - 1 - suffixLen]
        ) {
          suffixLen++
        }
        // `from`/`to` use the NEW line's offsets/length: by the time this
        // debounced pass runs, normal typing has already inserted the
        // characters into the live document (we never intercept plain
        // typing, only paste), so the document's actual current range for
        // this line already matches newLines, not oldLines -- using the old
        // (pre-edit) length here would replace the wrong-sized range and
        // duplicate/clip text.
        const newOffsets = lineStartOffsets(newLines)
        from = 1 + newOffsets[lineIndex] + prefixLen
        to = 1 + newOffsets[lineIndex] + (newLine.length - suffixLen)
        replacementLines = [sliceTokensByChars(tokenizedLines[lineIndex] ?? [], prefixLen, newLine.length - suffixLen)]
      } else {
        // Line count changed (Enter split a line, or a newline was deleted
        // merging two) -- replace from the first differing line through the
        // end of the document. Less surgical, but every untouched line
        // BEFORE the edit still keeps its marks. Same reasoning as above:
        // the end of the range must be the CURRENT (new) document's end.
        let firstDiff = 0
        const minLen = Math.min(oldLines.length, newLines.length)
        while (firstDiff < minLen && oldLines[firstDiff] === newLines[firstDiff]) firstDiff++
        const newOffsets = lineStartOffsets(newLines)
        from = 1 + newOffsets[firstDiff]
        to = 1 + newText.length
        replacementLines = tokenizedLines.slice(firstDiff)
      }

      const replacementNodes = toProseMirrorNodes(editor.view, tokensToContent(replacementLines))
      isRetokenizingRef.current = true
      try {
        editor.view.dispatch(editor.view.state.tr.replaceWith(from, to, replacementNodes))
      } finally {
        // finally, not a plain assignment after dispatch -- if dispatch
        // itself throws (e.g. an out-of-range position from an edge case
        // this guard didn't catch), this ref would otherwise stay stuck
        // `true` forever, silently disabling all future re-highlighting for
        // this block (onUpdate's early-return checks it unconditionally).
        isRetokenizingRef.current = false
      }

      prevTextRef.current = newText
      setRootBackgroundIfAuto(ydoc, themeBg)
    } catch (err) {
      console.error('Failed to re-highlight edited code', err)
      if (generation === retokenizeGenerationRef.current) prevTextRef.current = newText
    }
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
        handlePaste(view, event) {
          if (kind !== 'code') return false // text blocks use Tiptap's default paste

          const text = event.clipboardData?.getData('text/plain')
          if (!text) return false
          event.preventDefault()

          const lang = languageRef.current ?? 'plaintext'
          const themeName = themeRef.current

          // Invalidates any slower, still-in-flight typing-triggered
          // retokenizeChangedLines call -- a paste replaces the whole block,
          // so that call's from/to (computed against a now-stale snapshot)
          // must not be allowed to land afterward and clobber this.
          retokenizeGenerationRef.current++
          tokenizeCode(text, lang, resolveThemeArg(themeName))
            .then(({ lines, themeBg }) => {
              isRetokenizingRef.current = true
              try {
                replaceWithTokenizedContent(view, lang, lines)
              } finally {
                isRetokenizingRef.current = false
              }
              prevTextRef.current = view.state.doc.textContent
              setRootBackgroundIfAuto(ydoc, themeBg)
            })
            .catch((err) => {
              console.error('Failed to tokenize pasted code, inserting as plain text', err)
              const node = view.state.schema.nodes.annotatedCodeBlock.create(
                { language: lang },
                text.length ? view.state.schema.text(text) : null
              )
              const tr = view.state.tr.replaceWith(0, view.state.doc.content.size, node)
              view.dispatch(tr)
            })

          return true
        },
      },
      onUpdate({ editor }) {
        if (kind !== 'code') return
        if (isRetokenizingRef.current || prevTextRef.current === null) {
          // Our own programmatic dispatch (paste/theme-change/incremental
          // replace) or the very first update after content was seeded --
          // resync the baseline, don't treat it as an edit to re-highlight.
          prevTextRef.current = editor.state.doc.textContent
          return
        }
        if (retokenizeTimerRef.current) clearTimeout(retokenizeTimerRef.current)
        retokenizeTimerRef.current = setTimeout(() => {
          retokenizeChangedLines(editor)
        }, RETOKENIZE_DEBOUNCE_MS)
      },
      onBlur({ editor }) {
        if (editor.state.doc.textContent.trim().length === 0) {
          onEmptyBlur?.()
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

    // Invalidates any slower, still-in-flight typing-triggered
    // retokenizeChangedLines call -- same reasoning as the paste handler.
    retokenizeGenerationRef.current++
    tokenizeCode(text, language ?? 'plaintext', resolveThemeArg(theme))
      .then(({ lines, themeBg }) => {
        // `text` was captured before this await -- if the user kept typing
        // during the round trip, applying a replace built from that now-
        // stale snapshot would silently discard every character typed since
        // then. Skipping here isn't a permanent loss: the regular per-
        // keystroke retokenize path (which always diffs against the
        // CURRENT text) catches up and re-colors those characters correctly
        // once typing settles, just a beat later than usual.
        if (editor.state.doc.textContent !== text) return
        isRetokenizingRef.current = true
        try {
          replaceWithTokenizedContent(editor.view, language ?? 'plaintext', lines)
        } finally {
          isRetokenizingRef.current = false
        }
        prevTextRef.current = editor.state.doc.textContent
        setRootBackgroundIfAuto(ydoc, themeBg)
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

  if (!synced) {
    return <div className="scripture-editor-loading">Loading…</div>
  }

  const editorContent = (
    <div className="scripture-editor-wrapper">
      {editor && <BubbleToolbar editor={editor} />}
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
