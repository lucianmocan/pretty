'use client'

import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { THEMES, THEME_PREVIEWS } from '@/lib/presets'
import {
  listCustomSyntaxThemes,
  subscribeToCustomSyntaxThemes,
  customThemeValue,
} from '@/lib/presets/custom-syntax-themes'
import type { CustomSyntaxTheme } from '@/lib/shiki/custom-theme'

interface ThemeSwatchPickerProps {
  value: string
  onChange: (theme: string) => void
  // Omitted entirely where there's nowhere for it to open to yet.
  onCreateCustom?: () => void
}

/** A grid of small color-preview buttons instead of a plain text <select> --
 * you can actually see what a theme looks like before picking it. Lists
 * built-in bundled themes alongside any user-saved custom ones. */
export function ThemeSwatchPicker({ value, onChange, onCreateCustom }: ThemeSwatchPickerProps) {
  const [customThemes, setCustomThemes] = useState<CustomSyntaxTheme[]>([])

  useEffect(() => {
    const refresh = () => setCustomThemes(listCustomSyntaxThemes())
    refresh()
    return subscribeToCustomSyntaxThemes(refresh)
  }, [])

  return (
    <div className="theme-swatch-grid">
      {THEMES.map((theme) => {
        const preview = THEME_PREVIEWS[theme]
        return (
          <button
            key={theme}
            type="button"
            className={theme === value ? 'theme-swatch is-active' : 'theme-swatch'}
            style={{ background: preview.bg }}
            onClick={() => onChange(theme)}
            title={theme}
            aria-label={theme}
          >
            <span className="theme-swatch-dot" style={{ background: preview.accents[0], width: 7, height: 7, left: 5, bottom: 5 }} />
            <span className="theme-swatch-dot" style={{ background: preview.accents[1], width: 7, height: 7, right: 5, bottom: 5 }} />
          </button>
        )
      })}
      {customThemes.map((custom) => {
        const themeValue = customThemeValue(custom.id)
        return (
          <button
            key={custom.id}
            type="button"
            className={themeValue === value ? 'theme-swatch is-active' : 'theme-swatch'}
            style={{ background: custom.background }}
            onClick={() => onChange(themeValue)}
            title={custom.name}
            aria-label={custom.name}
          >
            <span
              className="theme-swatch-dot"
              style={{ background: custom.colors.keyword, width: 7, height: 7, left: 5, bottom: 5 }}
            />
            <span
              className="theme-swatch-dot"
              style={{ background: custom.colors.string, width: 7, height: 7, right: 5, bottom: 5 }}
            />
          </button>
        )
      })}
      {onCreateCustom && (
        <button
          type="button"
          className="theme-swatch theme-swatch-add"
          onClick={onCreateCustom}
          title="Create custom theme"
          aria-label="Create custom theme"
        >
          <Plus size={16} />
        </button>
      )}
    </div>
  )
}
