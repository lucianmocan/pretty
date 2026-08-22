'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDownIcon, LoaderCircle, Monitor, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { selectTriggerStyles } from '@/components/ui/select'
import { GoogleFontLoader } from './google-font-loader'
import { NotificationChip } from '@/components/ui/notification-chip'
import { cn } from '@/lib/utils'
import {
  LOCAL_TEXT_FONT,
  loadGoogleFontCatalog,
  textFontFamilyCss,
  type GoogleFontFamily,
  type TextFontSelection,
} from '@/lib/google-fonts'
import {
  getCachedSystemFontCatalog,
  loadSystemFontCatalog,
  systemFontAccessSupported,
  systemFontPermissionGranted,
  type SystemFontFamily,
} from '@/lib/system-fonts'

const RECENT_FONTS_KEY = 'scripture:recent-text-fonts'
const MAX_RESULTS = 120

function readRecents(): TextFontSelection[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_FONTS_KEY) ?? '[]')
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((value): TextFontSelection | null => {
        // Migrate the original string-only Google font history in place.
        if (typeof value === 'string') return { family: value, source: 'google' }
        if (!value || typeof value !== 'object') return null
        const candidate = value as Partial<TextFontSelection>
        if (typeof candidate.family !== 'string') return null
        if (candidate.source !== 'google' && candidate.source !== 'system') return null
        return { family: candidate.family, source: candidate.source }
      })
      .filter((value): value is TextFontSelection => value !== null)
      .slice(0, 8)
  } catch {
    return []
  }
}

function rememberFont(selection: TextFontSelection): TextFontSelection[] {
  const next = [
    selection,
    ...readRecents().filter((item) => item.family !== selection.family || item.source !== selection.source),
  ].slice(0, 8)
  localStorage.setItem(RECENT_FONTS_KEY, JSON.stringify(next))
  return next
}

function systemFontAccessError(reason: unknown): string {
  if (reason instanceof DOMException && reason.name === 'NotAllowedError') {
    return 'Device font access is blocked. Allow local fonts for this site in your browser settings, then try again.'
  }
  if (reason instanceof DOMException && reason.name === 'SecurityError') {
    return 'Device fonts are blocked by browser or site settings. Allow local fonts for this site, then try again.'
  }
  if (reason instanceof DOMException && reason.name === 'AbortError') {
    return 'The device font request was dismissed. Try again when you are ready.'
  }
  return 'Could not read fonts from this device. Check this site’s local-font permission in your browser settings, then try again.'
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
  const [previewFont, setPreviewFont] = useState<TextFontSelection>(value)
  const [recents, setRecents] = useState<TextFontSelection[]>([])
  const [systemCatalog, setSystemCatalog] = useState<SystemFontFamily[]>([])
  const [systemLoading, setSystemLoading] = useState(false)
  const [systemError, setSystemError] = useState<string | null>(null)
  const [systemSuccess, setSystemSuccess] = useState<string | null>(null)
  const usingSystemFonts = systemCatalog.length > 0

  useEffect(() => {
    if (!systemSuccess) return
    const timeout = window.setTimeout(() => setSystemSuccess(null), 3000)
    return () => window.clearTimeout(timeout)
  }, [systemSuccess])

  useEffect(() => {
    let cancelled = false
    const cachedSystemFonts = getCachedSystemFontCatalog()
    if (cachedSystemFonts.length > 0) {
      setSystemCatalog(cachedSystemFonts)
      return
    }

    void systemFontPermissionGranted().then(async (granted) => {
      if (!granted || cancelled) return
      try {
        const fonts = await loadSystemFontCatalog()
        if (!cancelled) setSystemCatalog(fonts)
      } catch {
        // Permission or browser settings may have changed since the query.
      }
    })

    return () => {
      cancelled = true
    }
  }, [])

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) return
    setRecents(readRecents())
    setPreviewFont(value)
    const cachedSystemFonts = getCachedSystemFontCatalog()
    if (cachedSystemFonts.length > 0) setSystemCatalog(cachedSystemFonts)
    if (catalog.length > 0) return
    setLoading(true)
    setError(null)
    void loadGoogleFontCatalog()
      .then(setCatalog)
      .catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not load fonts'))
      .finally(() => setLoading(false))
  }

  const normalizedQuery = query.trim().toLocaleLowerCase()
  const filteredGoogleFonts = useMemo(() => {
    const matches = normalizedQuery
      ? catalog.filter((font) => font.family.toLocaleLowerCase().includes(normalizedQuery))
      : catalog
    return matches.slice(0, MAX_RESULTS)
  }, [catalog, normalizedQuery])
  const filteredSystemFonts = useMemo(() => {
    const matches = normalizedQuery
      ? systemCatalog.filter((font) => font.family.toLocaleLowerCase().includes(normalizedQuery))
      : systemCatalog
    return matches.slice(0, MAX_RESULTS)
  }, [normalizedQuery, systemCatalog])

  const requestSystemFonts = async () => {
    if (!systemFontAccessSupported()) {
      setSystemSuccess(null)
      setSystemError(
        'This browser cannot list device fonts. Try desktop Chrome or Edge, and check that local font access is enabled.'
      )
      return
    }
    setSystemLoading(true)
    setSystemError(null)
    setSystemSuccess(null)
    try {
      const fonts = await loadSystemFontCatalog()
      setSystemCatalog(fonts)
      if (fonts.length === 0) {
        setSystemError('No device fonts were shared with this site.')
      } else {
        setSystemSuccess('Device fonts are now available.')
      }
    } catch (reason) {
      setSystemError(systemFontAccessError(reason))
    } finally {
      setSystemLoading(false)
    }
  }

  const select = (selection: TextFontSelection) => {
    if (selection.source !== 'local') setRecents(rememberFont(selection))
    onChange(selection)
    setPreviewFont(selection)
    setOpen(false)
    setQuery('')
  }

  const row = (
    family: string,
    source: TextFontSelection['source'],
    detail?: string,
    section = 'catalog'
  ) => {
    const selected = !mixed && value.family === family && value.source === source
    return (
      <button
        key={`${section}:${source}:${family}`}
        type="button"
        className="scripture-font-picker-row"
        data-selected={selected || undefined}
        data-font-source={source}
        data-font-family={family}
        onPointerEnter={() => setPreviewFont({ family, source })}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => select({ family, source })}
      >
        <span>{family}</span>
        {detail && <small>{detail}</small>}
        {selected && <Check className="scripture-font-picker-row-icon" aria-hidden="true" />}
      </button>
    )
  }

  const notificationHost =
    typeof document === 'undefined' ? null : document.getElementById('scripture-notification-host')
  const visibleRecents = recents.filter(
    (font) => mixed || font.family !== value.family || font.source !== value.source
  )

  return (
    <>
      {systemError && notificationHost && createPortal(
        <NotificationChip
          variant="error"
          action={<button type="button" onClick={() => setSystemError(null)}>Dismiss</button>}
        >
          {systemError}
        </NotificationChip>,
        notificationHost
      )}
      {systemSuccess && notificationHost && createPortal(
        <NotificationChip variant="success">
          {systemSuccess}
        </NotificationChip>,
        notificationHost
      )}
      <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-slot="select-trigger"
          data-size="sm"
          className={cn(selectTriggerStyles, 'scripture-font-picker-trigger')}
          onMouseDown={(event) => event.preventDefault()}
          aria-label={mixed ? 'Font: Mixed' : `Font: ${value.family}`}
        >
          <span>{mixed ? 'Mixed' : value.family}</span>
          <ChevronDownIcon className="pointer-events-none size-4 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="scripture-font-picker" align="start" sideOffset={8}>
        <GoogleFontLoader families={previewFont.source === 'google' ? [previewFont.family] : []} />
        <div className="scripture-font-picker-search">
          <Search aria-hidden="true" />
          <Input
            autoFocus
            className="h-7 text-xs"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search fonts…"
            aria-label="Search fonts"
          />
        </div>
        <div
          className="scripture-font-picker-preview"
          style={{
            fontFamily: textFontFamilyCss(previewFont.family, previewFont.source),
          }}
        >
          The quick brown fox jumps over the lazy dog.
        </div>
        <div className="scripture-font-picker-list">
          {!normalizedQuery && !usingSystemFonts && (
            <button
              type="button"
              className="scripture-font-picker-row scripture-font-picker-device-button"
              aria-disabled={systemLoading || usingSystemFonts}
              tabIndex={systemLoading || usingSystemFonts ? -1 : undefined}
              onClick={() => {
                if (!systemLoading && !usingSystemFonts) void requestSystemFonts()
              }}
            >
              <span>
                {systemLoading
                  ? 'Reading device fonts…'
                  : usingSystemFonts
                    ? 'Using fonts from this device'
                    : 'Use fonts from this device'}
              </span>
              {systemLoading
                ? <LoaderCircle className="scripture-font-picker-row-icon animate-spin" />
                : usingSystemFonts
                  ? <Check className="scripture-font-picker-row-icon" aria-hidden="true" />
                  : <Monitor className="scripture-font-picker-row-icon" aria-hidden="true" />}
            </button>
          )}
          {!normalizedQuery && visibleRecents.length > 0 && (
            <div className="scripture-font-picker-label">Recent</div>
          )}
          {!normalizedQuery && visibleRecents.map((font) =>
            row(font.family, font.source, undefined, 'recent')
          )}
          {!normalizedQuery && (mixed || value.family !== LOCAL_TEXT_FONT.family || value.source !== LOCAL_TEXT_FONT.source) &&
            row(LOCAL_TEXT_FONT.family, LOCAL_TEXT_FONT.source, 'Built in', 'built-in')}
          {filteredSystemFonts.length > 0 && (
            <div className="scripture-font-picker-label scripture-font-picker-device-label">
              <span>On this device</span>
              <span className="scripture-font-picker-device-status">
                <Check aria-hidden="true" />
                Using device fonts
              </span>
            </div>
          )}
          {filteredSystemFonts.map((font) =>
            row(
              font.family,
              'system',
              font.styles.length > 0
                ? `${font.styles.length} ${font.styles.length === 1 ? 'style' : 'styles'}`
                : 'On device',
              'system'
            )
          )}
          {!normalizedQuery && <div className="scripture-font-picker-label">All Google Fonts</div>}
          {loading && (
            <div className="scripture-font-picker-status"><LoaderCircle className="animate-spin" /> Loading fonts…</div>
          )}
          {error && <div className="scripture-font-picker-status is-error">{error}</div>}
          {!loading && !error && filteredGoogleFonts.map((font) =>
            row(font.family, 'google', font.variable ? 'Variable' : undefined, 'google')
          )}
          {!loading && !error && normalizedQuery && filteredSystemFonts.length === 0 && filteredGoogleFonts.length === 0 && (
            <div className="scripture-font-picker-status">No matching fonts.</div>
          )}
        </div>
        {(filteredGoogleFonts.length === MAX_RESULTS || filteredSystemFonts.length === MAX_RESULTS) && (
          <p className="scripture-font-picker-hint">Keep typing to narrow the complete catalog.</p>
        )}
      </PopoverContent>
      </Popover>
    </>
  )
}
