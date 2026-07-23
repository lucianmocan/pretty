'use client'

import { useEffect, useState } from 'react'
import { Plus, FileCode, Terminal, Ban } from 'lucide-react'
import { CUSTOM_CHROME_ICONS } from '@/components/editor/code-chrome'
import { listCustomChromeStyles, subscribeToCustomChromeStyles } from '@/lib/presets/custom-chrome-styles'
import type { CustomChromeStyle } from '@/lib/layout/types'

type BuiltinChromeStyle = 'none' | 'mac' | 'vscode-tab' | 'terminal'

const BUILTIN_STYLES: Array<{ value: BuiltinChromeStyle; label: string }> = [
  { value: 'none', label: 'None' },
  { value: 'mac', label: 'Mac' },
  { value: 'vscode-tab', label: 'VS Code Tab' },
  { value: 'terminal', label: 'Terminal' },
]

// Built-in chrome bars have no configurable background of their own (they're
// fixed CSS, not stored data) -- a neutral dark swatch backdrop matches the
// same default the Customize dialog's own syntax-theme preview already uses.
const SWATCH_BG = '#1e1e1e'

function BuiltinSwatchGlyph({ style }: { style: BuiltinChromeStyle }) {
  if (style === 'mac') {
    return (
      <span className="chrome-swatch-dots">
        <span style={{ background: '#ff5f56' }} />
        <span style={{ background: '#ffbd2e' }} />
        <span style={{ background: '#27c93f' }} />
      </span>
    )
  }
  if (style === 'vscode-tab') return <FileCode size={16} color="rgba(255,255,255,0.6)" />
  if (style === 'terminal') return <Terminal size={16} color="rgba(255,255,255,0.6)" />
  return <Ban size={16} color="rgba(255,255,255,0.3)" />
}

interface ChromeStylePickerProps {
  value: BuiltinChromeStyle | 'custom'
  // Which saved custom style is active -- only meaningful when value === 'custom'
  // (the block stores a full COPY of the style it's using, not just this id;
  // see lib/layout/types.ts's CustomChromeStyle comment for why).
  customChromeId?: string
  onSelectBuiltin: (style: BuiltinChromeStyle) => void
  onSelectCustom: (style: CustomChromeStyle) => void
  onCreateCustom: () => void
}

/** A grid of small preview swatches for window chrome styles, matching
 * ThemeSwatchPicker's look exactly (same .theme-swatch/-grid/-add classes) --
 * built-in styles alongside any user-saved custom ones, plus a "+" to design
 * a new one. Replaces a plain <select> + a separate "pick which custom style"
 * list with one unified grid, the same way the theme picker already works. */
export function ChromeStylePicker({
  value,
  customChromeId,
  onSelectBuiltin,
  onSelectCustom,
  onCreateCustom,
}: ChromeStylePickerProps) {
  const [customStyles, setCustomStyles] = useState<CustomChromeStyle[]>([])

  useEffect(() => {
    const refresh = () => setCustomStyles(listCustomChromeStyles())
    refresh()
    return subscribeToCustomChromeStyles(refresh)
  }, [])

  return (
    <div className="theme-swatch-grid">
      {BUILTIN_STYLES.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={value === opt.value ? 'theme-swatch is-active' : 'theme-swatch'}
          style={{ background: SWATCH_BG, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => onSelectBuiltin(opt.value)}
          title={opt.label}
          aria-label={opt.label}
        >
          <BuiltinSwatchGlyph style={opt.value} />
        </button>
      ))}
      {customStyles.map((style) => {
        const Icon = style.icon !== 'none' ? CUSTOM_CHROME_ICONS[style.icon] : null
        const isActive = value === 'custom' && customChromeId === style.id
        return (
          <button
            key={style.id}
            type="button"
            className={isActive ? 'theme-swatch is-active' : 'theme-swatch'}
            style={{
              background: style.barBackground,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              // The real chrome bar's own border-bottom accent (see
              // ChromeBar in code-chrome.tsx) -- often the most distinctive
              // part of a style, e.g. VS Code tab's colored underline.
              // Overriding just this one edge's color (not the full
              // shorthand) leaves .theme-swatch's own border on the other
              // three sides intact.
              borderBottomColor: style.barBorderColor,
            }}
            onClick={() => onSelectCustom(style)}
            title={style.name}
            aria-label={style.name}
          >
            {/* Dots and icon can both be configured at once on a real chrome
                bar -- shown together here too, not either/or, so the swatch
                doesn't hide half of what the style actually looks like. */}
            {style.dotColors && (
              <span className="chrome-swatch-dots">
                <span style={{ background: style.dotColors[0] }} />
                <span style={{ background: style.dotColors[1] }} />
                <span style={{ background: style.dotColors[2] }} />
              </span>
            )}
            {Icon && <Icon size={14} color={style.textColor} />}
          </button>
        )
      })}
      <button
        type="button"
        className="theme-swatch theme-swatch-add"
        onClick={onCreateCustom}
        title="Create custom chrome style"
        aria-label="Create custom chrome style"
      >
        <Plus size={16} />
      </button>
    </div>
  )
}
