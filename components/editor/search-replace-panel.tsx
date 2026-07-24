'use client'

import { useEffect, useState } from 'react'
import { Search, ChevronUp, ChevronDown, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useEditorRegistry } from './editor-registry'
import { findAllMatches, selectMatch, replaceMatch, replaceAllInEditor, type Match } from '@/lib/tiptap/find-replace'

/** Not node-specific, so this lives in the toolbar rather than the
 * Inspector -- it operates across every currently-mounted block's editor
 * via the EditorRegistryProvider each BlockEditor registers into. */
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
    const refresh = () => setRevision((value) => value + 1)
    for (const editor of editors) editor.on('update', refresh)
    return () => {
      for (const editor of editors) editor.off('update', refresh)
    }
  }, [open, registry])

  function getMatches(): Match[] {
    return findAllMatches(registry.getAll(), query)
  }

  function goTo(index: number) {
    const matches = getMatches()
    if (matches.length === 0) return
    const wrapped = ((index % matches.length) + matches.length) % matches.length
    setMatchIndex(wrapped)
    const match = matches[wrapped]
    const editor = registry.getAll().get(match.blockId)
    if (editor) {
      onSelectMatch?.(match.blockId)
      selectMatch(editor, match)
    }
  }

  function handleReplaceCurrent() {
    const matches = getMatches()
    if (matches.length === 0) return
    const safeIndex = Math.min(matchIndex, matches.length - 1)
    const match = matches[safeIndex]
    const editor = registry.getAll().get(match.blockId)
    if (!editor) return
    replaceMatch(editor, match, replacement)
    setMatchIndex(0)
  }

  function handleReplaceAll() {
    for (const editor of registry.getAll().values()) {
      replaceAllInEditor(editor, query, replacement)
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
              if (event.key === 'Enter') goTo(safeMatchIndex + 1)
              if (event.key === 'Escape') onClose?.()
            }}
          />
        </div>
        <div className="scripture-inspector-row">
          <span className="scripture-inspector-hint">
            {matches.length > 0 ? `Match ${safeMatchIndex + 1} of ${matches.length}` : 'No matches'}
          </span>
          <div className="flex gap-1">
            <Button variant="ghost" size="icon-xs" onClick={() => goTo(safeMatchIndex - 1)} aria-label="Previous match">
              <ChevronUp />
            </Button>
            <Button variant="ghost" size="icon-xs" onClick={() => goTo(safeMatchIndex + 1)} aria-label="Next match">
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
          <Button variant="outline" size="sm" className="w-full" disabled={matches.length === 0} onClick={handleReplaceCurrent}>
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
          if (e.key === 'Enter') goTo(safeMatchIndex + 1)
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
      <Button variant="ghost" size="icon-xs" onClick={() => goTo(safeMatchIndex - 1)} aria-label="Previous match">
        <ChevronUp />
      </Button>
      <Button variant="ghost" size="icon-xs" onClick={() => goTo(safeMatchIndex + 1)} aria-label="Next match">
        <ChevronDown />
      </Button>
      <Button variant="outline" size="sm" disabled={matches.length === 0} onClick={handleReplaceCurrent}>
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
