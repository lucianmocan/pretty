import { THEMES, THEME_PREVIEWS } from '@/lib/presets'

interface ThemeSwatchPickerProps {
  value: string
  onChange: (theme: string) => void
}

/** A grid of small color-preview buttons instead of a plain text <select> --
 * you can actually see what a theme looks like before picking it. */
export function ThemeSwatchPicker({ value, onChange }: ThemeSwatchPickerProps) {
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
    </div>
  )
}
