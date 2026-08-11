'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { loadGoogleFontCatalog, textFontFamilyCss } from '@/lib/google-fonts'
import { getCachedSystemFontCatalog, systemFontWeightsForFamily } from '@/lib/system-fonts'
import type { TextFontSource } from '@/lib/layout/types'

const LOCAL_FONT_WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900]
const FALLBACK_GOOGLE_WEIGHTS = [300, 400, 500, 600, 700, 800]

function weightsForFamily(catalog: Awaited<ReturnType<typeof loadGoogleFontCatalog>>, family: string) {
  const font = catalog.find((item) => item.family === family)
  const weights = (font?.weights ?? []).map(Number).filter((weight) => Number.isFinite(weight))
  if (weights.length > 0) return [...new Set(weights)].sort((a, b) => a - b)
  return font?.variable ? LOCAL_FONT_WEIGHTS : FALLBACK_GOOGLE_WEIGHTS
}

export function FontWeightPicker({
  value,
  onChange,
  fontFamily,
  fontSource,
  surface = 'inspector',
  showTrigger = true,
  children,
}: {
  value: number
  onChange: (weight: number) => void
  fontFamily: string
  fontSource: TextFontSource
  surface?: 'inspector' | 'bubble'
  showTrigger?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [catalogKey, setCatalogKey] = useState<string | null>(null)

  useEffect(() => {
    if (fontSource !== 'google') return
    const key = `${fontSource}:${fontFamily}`
    let cancelled = false
    void loadGoogleFontCatalog()
      .then((catalog) => {
        if (!cancelled) setCatalogKey(key + ':' + weightsForFamily(catalog, fontFamily).join(','))
      })
      .catch(() => {
        if (!cancelled) setCatalogKey(key + ':')
      })
    return () => {
      cancelled = true
    }
  }, [fontFamily, fontSource])

  const key = `${fontSource}:${fontFamily}`
  const weights = fontSource === 'local'
    ? LOCAL_FONT_WEIGHTS
    : fontSource === 'system'
      ? systemFontWeightsForFamily(getCachedSystemFontCatalog(), fontFamily)
      : catalogKey?.startsWith(key + ':')
        ? catalogKey.slice(key.length + 1).split(',').filter(Boolean).map(Number)
        : null
  const uniqueWeights = weights ? [...new Set(weights)] : null

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <span
          className="scripture-bubble-weight-anchor"
          onContextMenu={(event) => {
            event.preventDefault()
            setOpen(true)
          }}
        >
          {children}
          {showTrigger && (
            <button
              type="button"
              className="scripture-bubble-weight-trigger"
              aria-label="Choose font weight"
              aria-expanded={open}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setOpen((current) => !current)}
            >
              <ChevronDown aria-hidden="true" />
            </button>
          )}
        </span>
      </PopoverAnchor>
      <PopoverContent
        className="scripture-font-weight-picker"
        align="start"
        alignOffset={surface === 'bubble' ? -6 : 0}
        sideOffset={surface === 'bubble' ? 12 : 6}
        onOpenAutoFocus={(event) => {
          if (!(event.currentTarget instanceof HTMLElement)) return
          const selected = event.currentTarget.querySelector<HTMLButtonElement>('[data-selected]')
          if (!selected) return
          event.preventDefault()
          selected.focus()
        }}
      >
        <span className="scripture-font-weight-label">Font weight</span>
        {uniqueWeights ? (
          <div className="scripture-font-weight-options">
            {uniqueWeights.map((weight) => (
              <button
                key={weight}
                type="button"
                className="scripture-font-weight-option"
                data-selected={value === weight || undefined}
                style={{
                  fontFamily: textFontFamilyCss(fontFamily, fontSource),
                  fontWeight: weight,
                }}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange(weight)
                  setOpen(false)
                }}
              >
                {weight}
              </button>
            ))}
          </div>
        ) : (
          <div className="scripture-font-weight-status">Loading supported weights…</div>
        )}
      </PopoverContent>
    </Popover>
  )
}
