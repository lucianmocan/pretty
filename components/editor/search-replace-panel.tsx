'use client'

import { useEffect, useState } from 'react'
import { Search, ChevronUp, ChevronDown, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useEditorRegistry } from './editor-registry'
import { findAllMatches, selectMatch, replaceMatch, replaceAllInEditor, type Match } from '@/lib/tiptap/find-replace'

/** Not node-specific, so this operates across live editors and static canvas
 * block adapters through the shared registry. */
export function SearchReplacePanel({
  sidebar = false,
  onClose,
  onSelectMatch,
}: {
  sidebar?: boolean
  onClose?: () => void
  onSelectMatch?: (blockId: string) => void
}) {
  const [open, setOpen] = useState(sidebar)
  const [query, setQuery] = useState('')
  const [replacement, setReplacement] = useState('')
  const [matchIndex, setMatchIndex] = useState(0)
  const [, setRevision] = useState(0)
  const registry = useEditorRegistry()

  useEffect(() => {
    if (!open) return
    const editors = Array.from(registry.getAll().values())
    const staticAdapters = Array.from(registry.getStatic().entries())
      .filter(([blockId]) => !registry.getAll().has(blockId))
      .map(([, adapter]) => adapter)
    const refresh = () => setRevision((value) => value + 1)
    for (const editor of editors) editor.on('update', refresh)
    const unsubscribeStatic = staticAdapters.map((adapter) => adapter.subscribe(refresh))
    return () => {
      for (const editor of editors) editor.off('update', refresh)
      unsubscribeStatic.forEach((unsubscribe) => unsubscribe())
    }
  }, [open, registry])

  function getMatches(): Match[] {
    const liveEditors = registry.getAll()
    const matches = findAllMatches(liveEditors, query)
    for (const [blockId, adapter] of registry.getStatic()) {
      if (liveEditors.has(blockId)) continue
      matches.push(...adapter.findMatches(query).map((match) => ({ blockId, ...match })))
    }
    return matches
  }

  async function goTo(index: number) {
    const matches = getMatches()
    if (matches.length === 0) return
    const wrapped = ((index % matches.length) + matches.length) % matches.length
    setMatchIndex(wrapped)
    const match = matches[wrapped]
    let editor = registry.getAll().get(match.blockId)
    onSelectMatch?.(match.blockId)
    if (!editor && registry.getStatic().has(match.blockId)) {
      editor = (await registry.waitForEditor(match.blockId)) ?? undefined
    }
    if (editor) {
      selectMatch(editor, match)
    }
  }

  async function handleReplaceCurrent() {
    const matches = getMatches()
    if (matches.length === 0) return
    const safeIndex = Math.min(matchIndex, matches.length - 1)
    const match = matches[safeIndex]
    let editor = registry.getAll().get(match.blockId)
    onSelectMatch?.(match.blockId)
    if (!editor && registry.getStatic().has(match.blockId)) {
      editor = (await registry.waitForEditor(match.blockId)) ?? undefined
    }
    if (editor) replaceMatch(editor, match, replacement)
    else registry.getStatic().get(match.blockId)?.replaceMatch(match, replacement)
    setMatchIndex(0)
  }

  function handleReplaceAll() {
    const liveEditors = registry.getAll()
    for (const editor of liveEditors.values()) {
      replaceAllInEditor(editor, query, replacement)
    }
    for (const [blockId, adapter] of registry.getStatic()) {
      if (!liveEditors.has(blockId)) adapter.replaceAll(query, replacement)
    }
    setMatchIndex(0)
  }

  const matches = open && query ? getMatches() : []
  const safeMatchIndex = Math.min(matchIndex, Math.max(0, matches.length - 1))

  if (!open) {
    return (
      <Button variant="ghost" size="icon" onClick={() => setOpen(true)} aria-label="Search and replace">
        <Search />
      </Button>
    )
  }

  if (sidebar) {
    return (
      <div className="scripture-sidebar-search scripture-property-panel">
        <div className="scripture-inspector-row">
          <Label htmlFor="scripture-layer-find">Find</Label>
          <Input
            id="scripture-layer-find"
            autoFocus
            className="w-36"
            placeholder="Search document…"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setMatchIndex(0)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void goTo(safeMatchIndex + 1)
              if (event.key === 'Escape') onClose?.()
            }}
          />
        </div>
        <div className="scripture-inspector-row">
          <span className="scripture-inspector-hint">
            {matches.length > 0 ? `Match ${safeMatchIndex + 1} of ${matches.length}` : 'No matches'}
          </span>
          <div className="flex gap-1">
            <Button variant="ghost" size="icon-xs" onClick={() => void goTo(safeMatchIndex - 1)} aria-label="Previous match">
              <ChevronUp />
            </Button>
            <Button variant="ghost" size="icon-xs" onClick={() => void goTo(safeMatchIndex + 1)} aria-label="Next match">
              <ChevronDown />
            </Button>
          </div>
        </div>
        <div className="scripture-inspector-row">
          <Label htmlFor="scripture-layer-replace">Replace</Label>
          <Input
            id="scripture-layer-replace"
            className="w-36"
            placeholder="Replace with"
            value={replacement}
            onChange={(event) => setReplacement(event.target.value)}
          />
        </div>
        <div className="scripture-inspector-actions">
          <Button variant="outline" size="sm" className="w-full" disabled={matches.length === 0} onClick={() => void handleReplaceCurrent()}>
            Replace
          </Button>
          <Button variant="outline" size="sm" className="w-full" disabled={matches.length === 0} onClick={handleReplaceAll}>
            Replace all
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="scripture-search-panel">
      <Input
        autoFocus
        placeholder="Find"
        className="w-32"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setMatchIndex(0)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void goTo(safeMatchIndex + 1)
          if (e.key === 'Escape') setOpen(false)
        }}
      />
      <Input
        placeholder="Replace"
        className="w-32"
        value={replacement}
        onChange={(e) => setReplacement(e.target.value)}
      />
      <span className="scripture-search-count">{matches.length > 0 ? `${safeMatchIndex + 1}/${matches.length}` : '0/0'}</span>
      <Button variant="ghost" size="icon-xs" onClick={() => void goTo(safeMatchIndex - 1)} aria-label="Previous match">
        <ChevronUp />
      </Button>
      <Button variant="ghost" size="icon-xs" onClick={() => void goTo(safeMatchIndex + 1)} aria-label="Next match">
        <ChevronDown />
      </Button>
      <Button variant="outline" size="sm" disabled={matches.length === 0} onClick={() => void handleReplaceCurrent()}>
        Replace
      </Button>
      <Button variant="outline" size="sm" disabled={matches.length === 0} onClick={handleReplaceAll}>
        Replace all
      </Button>
      <Button variant="ghost" size="icon-xs" onClick={() => setOpen(false)} aria-label="Close search">
        <X />
      </Button>
    </div>
  )
}
