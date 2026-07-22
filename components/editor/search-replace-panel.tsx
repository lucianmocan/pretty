'use client'

import { useState } from 'react'
import { Search, ChevronUp, ChevronDown, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useEditorRegistry } from './editor-registry'
import { findAllMatches, selectMatch, replaceMatch, replaceAllInEditor, type Match } from '@/lib/tiptap/find-replace'

/** Not node-specific, so this lives in the toolbar rather than the
 * Inspector -- it operates across every currently-mounted block's editor
 * via the EditorRegistryProvider each BlockEditor registers into. */
export function SearchReplacePanel() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [replacement, setReplacement] = useState('')
  const [matchIndex, setMatchIndex] = useState(0)
  const registry = useEditorRegistry()

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
    if (editor) selectMatch(editor, match)
  }

  function handleReplaceCurrent() {
    const matches = getMatches()
    if (matches.length === 0) return
    const match = matches[matchIndex]
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

  if (!open) {
    return (
      <Button variant="ghost" size="icon" onClick={() => setOpen(true)} aria-label="Search and replace">
        <Search />
      </Button>
    )
  }

  const matches = query ? getMatches() : []

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
          if (e.key === 'Enter') goTo(matchIndex + 1)
          if (e.key === 'Escape') setOpen(false)
        }}
      />
      <Input
        placeholder="Replace"
        className="w-32"
        value={replacement}
        onChange={(e) => setReplacement(e.target.value)}
      />
      <span className="scripture-search-count">{matches.length > 0 ? `${matchIndex + 1}/${matches.length}` : '0/0'}</span>
      <Button variant="ghost" size="icon-xs" onClick={() => goTo(matchIndex - 1)} aria-label="Previous match">
        <ChevronUp />
      </Button>
      <Button variant="ghost" size="icon-xs" onClick={() => goTo(matchIndex + 1)} aria-label="Next match">
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
