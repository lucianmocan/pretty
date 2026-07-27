import { DEFAULT_THEME, THEME_PREVIEWS } from '@/lib/presets'
import { buildShikiTheme, type CustomSyntaxTheme } from '@/lib/shiki/custom-theme'

const STORAGE_KEY = 'scripture:custom-syntax-themes'

// A saved custom theme's id is stored in a code block's `theme` string field
// as `custom:<id>` -- no schema change to CodeBlockProps needed, and every
// existing consumer that just displays/compares `theme` as an opaque string
// (ThemeSwatchPicker, style presets, etc.) keeps working unmodified.
export const CUSTOM_THEME_PREFIX = 'custom:'

export function customThemeValue(id: string): string {
  return `${CUSTOM_THEME_PREFIX}${id}`
}

export function isCustomThemeValue(theme: string | undefined): boolean {
  return !!theme && theme.startsWith(CUSTOM_THEME_PREFIX)
}

/** Same localStorage read/write pattern as lib/presets/style-presets.ts --
 * small, synchronous, easy to inspect, and this is a personal local tool
 * with no server-side user accounts to store presets against instead. */
function readAll(): CustomSyntaxTheme[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

// The native 'storage' event only fires in OTHER tabs/windows, never the one
// that made the write -- this custom event covers the same-tab case (e.g.
// the customize dialog saving a theme while a ThemeSwatchPicker elsewhere in
// the same Inspector is already mounted and would otherwise show stale data).
const CHANGE_EVENT = 'scripture:custom-syntax-themes-changed'

function writeAll(themes: CustomSyntaxTheme[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(themes))
    window.dispatchEvent(new Event(CHANGE_EVENT))
  } catch {
    // Best-effort -- e.g. storage quota exceeded or disabled (private browsing).
  }
}

/** Notifies on any local CRUD write (same tab) or a write from another tab.
 * Returns an unsubscribe function. */
export function subscribeToCustomSyntaxThemes(callback: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, callback)
  window.addEventListener('storage', callback)
  return () => {
    window.removeEventListener(CHANGE_EVENT, callback)
    window.removeEventListener('storage', callback)
  }
}

export function listCustomSyntaxThemes(): CustomSyntaxTheme[] {
  return readAll()
}

export function getCustomSyntaxTheme(id: string): CustomSyntaxTheme | null {
  return readAll().find((t) => t.id === id) ?? null
}

export function saveCustomSyntaxTheme(theme: CustomSyntaxTheme): CustomSyntaxTheme {
  const all = readAll()
  const idx = all.findIndex((t) => t.id === theme.id)
  if (idx >= 0) all[idx] = theme
  else all.push(theme)
  writeAll(all)
  return theme
}

export function deleteCustomSyntaxTheme(id: string) {
  writeAll(readAll().filter((t) => t.id !== id))
}

/** Resolves a code block's stored `theme` string to a bundled theme name or
 * a full, self-contained Shiki theme object. Falls back to the default theme
 * if a referenced custom theme has since been deleted. */
export function resolveThemeArg(theme: string | undefined) {
  const value = theme ?? DEFAULT_THEME
  if (!isCustomThemeValue(value)) return value
  const id = value.slice(CUSTOM_THEME_PREFIX.length)
  const custom = getCustomSyntaxTheme(id)
  return custom ? buildShikiTheme(custom) : DEFAULT_THEME
}

/** Resolves the visual background that belongs to a code block's syntax
 * theme. Unlike tokenization, this is synchronous so picking a theme updates
 * the block surface immediately; the resolved value is also persisted on
 * the block so the server-rendered print route can reproduce custom themes
 * without access to this browser's localStorage. */
export function resolveThemeBackground(theme: string | undefined): string {
  const value = theme ?? DEFAULT_THEME
  if (isCustomThemeValue(value)) {
    const id = value.slice(CUSTOM_THEME_PREFIX.length)
    return getCustomSyntaxTheme(id)?.background ?? THEME_PREVIEWS[DEFAULT_THEME].bg
  }
  return THEME_PREVIEWS[value as keyof typeof THEME_PREVIEWS]?.bg ?? THEME_PREVIEWS[DEFAULT_THEME].bg
}

/** Immediate text color before worker tokenization finishes. */
export function resolveThemeForeground(theme: string | undefined): string {
  const value = theme ?? DEFAULT_THEME
  if (isCustomThemeValue(value)) {
    const id = value.slice(CUSTOM_THEME_PREFIX.length)
    return getCustomSyntaxTheme(id)?.foreground ?? THEME_PREVIEWS[DEFAULT_THEME].fg
  }
  return THEME_PREVIEWS[value as keyof typeof THEME_PREVIEWS]?.fg ?? THEME_PREVIEWS[DEFAULT_THEME].fg
}

/** Line-number foreground for both the live gutter and exported output.
 * Older custom themes fall back to their comment color, which is normally
 * the palette's intended subdued-but-readable text color. */
export function resolveThemeLineNumberForeground(theme: string | undefined): string {
  const value = theme ?? DEFAULT_THEME
  if (isCustomThemeValue(value)) {
    const id = value.slice(CUSTOM_THEME_PREFIX.length)
    const custom = getCustomSyntaxTheme(id)
    return custom?.lineNumberForeground ?? custom?.colors.comment ?? THEME_PREVIEWS[DEFAULT_THEME].lineNumber
  }
  return THEME_PREVIEWS[value as keyof typeof THEME_PREVIEWS]?.lineNumber ?? THEME_PREVIEWS[DEFAULT_THEME].lineNumber
}

/** Accent used by the browser's native text selection inside code blocks.
 * Keeping it theme-derived makes selection feel native to each palette
 * without changing the authored syntax colors themselves. */
export function resolveThemeSelectionAccent(theme: string | undefined): string {
  const value = theme ?? DEFAULT_THEME
  if (isCustomThemeValue(value)) {
    const id = value.slice(CUSTOM_THEME_PREFIX.length)
    return getCustomSyntaxTheme(id)?.colors.keyword ?? THEME_PREVIEWS[DEFAULT_THEME].accents[0]
  }
  return THEME_PREVIEWS[value as keyof typeof THEME_PREVIEWS]?.accents[0] ?? THEME_PREVIEWS[DEFAULT_THEME].accents[0]
}
