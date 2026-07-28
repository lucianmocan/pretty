'use client'

import { useMemo, useState } from 'react'
import { Check, ChevronsUpDown, LoaderCircle, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { GoogleFontLoader } from './google-font-loader'
import {
  LOCAL_TEXT_FONT,
  loadGoogleFontCatalog,
  textFontFamilyCss,
  type GoogleFontFamily,
  type TextFontSelection,
} from '@/lib/google-fonts'

const RECENT_FONTS_KEY = 'scripture:recent-text-fonts'
const MAX_RESULTS = 120

function readRecents(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_FONTS_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string').slice(0, 8) : []
  } catch {
    return []
  }
}

function rememberFont(family: string): string[] {
  const next = [family, ...readRecents().filter((item) => item !== family)].slice(0, 8)
  localStorage.setItem(RECENT_FONTS_KEY, JSON.stringify(next))
  return next
}

export function FontPicker({
  value,
  onChange,
  mixed = false,
}: {
  value: TextFontSelection
  onChange: (font: TextFontSelection) => void
  mixed?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [catalog, setCatalog] = useState<GoogleFontFamily[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [previewFamily, setPreviewFamily] = useState<string | null>(
    value.source === 'google' ? value.family : null
  )
  const [recents, setRecents] = useState<string[]>([])

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) return
    setRecents(readRecents())
    if (catalog.length > 0) return
    setLoading(true)
    setError(null)
    void loadGoogleFontCatalog()
      .then(setCatalog)
      .catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not load fonts'))
      .finally(() => setLoading(false))
  }

  const normalizedQuery = query.trim().toLocaleLowerCase()
  const filtered = useMemo(() => {
    const matches = normalizedQuery
      ? catalog.filter((font) => font.family.toLocaleLowerCase().includes(normalizedQuery))
      : catalog
    return matches.slice(0, MAX_RESULTS)
  }, [catalog, normalizedQuery])

  const select = (selection: TextFontSelection) => {
    if (selection.source === 'google') setRecents(rememberFont(selection.family))
    onChange(selection)
    setPreviewFamily(selection.source === 'google' ? selection.family : null)
    setOpen(false)
    setQuery('')
  }

  const row = (family: string, source: TextFontSelection['source'], detail?: string) => {
    const selected = !mixed && value.family === family && value.source === source
    return (
      <button
        key={`${source}:${family}`}
        type="button"
        className="scripture-font-picker-row"
        data-selected={selected || undefined}
        onPointerEnter={() => setPreviewFamily(source === 'google' ? family : null)}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => select({ family, source })}
      >
        <span>{family}</span>
        {detail && <small>{detail}</small>}
        {selected && <Check aria-hidden="true" />}
      </button>
    )
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="scripture-font-picker-trigger"
          onMouseDown={(event) => event.preventDefault()}
          aria-label={mixed ? 'Font: Mixed' : `Font: ${value.family}`}
        >
          <span>{mixed ? 'Mixed' : value.family}</span>
          <ChevronsUpDown />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="scripture-font-picker" align="start" sideOffset={8}>
        <GoogleFontLoader families={previewFamily ? [previewFamily] : []} />
        <div className="scripture-font-picker-search">
          <Search aria-hidden="true" />
          <Input
            autoFocus
            className="h-7 text-xs"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search 1,900+ Google Fonts…"
            aria-label="Search Google Fonts"
          />
        </div>
        <div
          className="scripture-font-picker-preview"
          style={{
            fontFamily: previewFamily
              ? textFontFamilyCss(previewFamily, 'google')
              : textFontFamilyCss(LOCAL_TEXT_FONT.family, LOCAL_TEXT_FONT.source),
          }}
        >
          The quick brown fox jumps over the lazy dog.
        </div>
        <div className="scripture-font-picker-list">
          {!normalizedQuery && row(LOCAL_TEXT_FONT.family, LOCAL_TEXT_FONT.source, 'Built in')}
          {!normalizedQuery && recents.length > 0 && (
            <div className="scripture-font-picker-label">Recent</div>
          )}
          {!normalizedQuery && recents.map((family) => row(family, 'google'))}
          {!normalizedQuery && <div className="scripture-font-picker-label">All Google Fonts</div>}
          {loading && (
            <div className="scripture-font-picker-status"><LoaderCircle className="animate-spin" /> Loading fonts…</div>
          )}
          {error && <div className="scripture-font-picker-status is-error">{error}</div>}
          {!loading && !error && filtered.map((font) => row(font.family, 'google', font.variable ? 'Variable' : undefined))}
          {!loading && !error && normalizedQuery && filtered.length === 0 && (
            <div className="scripture-font-picker-status">No matching fonts.</div>
          )}
        </div>
        {filtered.length === MAX_RESULTS && (
          <p className="scripture-font-picker-hint">Keep typing to narrow the complete catalog.</p>
        )}
      </PopoverContent>
    </Popover>
  )
}
