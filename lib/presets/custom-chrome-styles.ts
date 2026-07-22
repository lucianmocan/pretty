import type { CustomChromeStyle } from '@/lib/layout/types'

const STORAGE_KEY = 'scripture:custom-chrome-styles'

// See the matching comment in lib/presets/custom-syntax-themes.ts -- the
// native 'storage' event only fires in OTHER tabs/windows, never the one
// that made the write.
const CHANGE_EVENT = 'scripture:custom-chrome-styles-changed'

// Plain hex, not rgba() -- these are edited via native <input type="color">
// pickers in the customize dialog, which only understand/produce hex.
export function createBlankCustomChromeStyle(name = 'Untitled chrome'): CustomChromeStyle {
  return {
    id: crypto.randomUUID(),
    name,
    barBackground: '#1e1e1e',
    barBorderColor: '#333333',
    textColor: '#999999',
    dotColors: ['#ff5f56', '#ffbd2e', '#27c93f'],
    icon: 'file-code',
    filenamePosition: 'inline',
    radius: 0,
  }
}

/** Same localStorage read/write pattern as lib/presets/style-presets.ts --
 * small, synchronous, easy to inspect, and this is a personal local tool
 * with no server-side user accounts to store presets against instead. */
function readAll(): CustomChromeStyle[] {
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

function writeAll(styles: CustomChromeStyle[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(styles))
    window.dispatchEvent(new Event(CHANGE_EVENT))
  } catch {
    // Best-effort -- e.g. storage quota exceeded or disabled (private browsing).
  }
}

export function listCustomChromeStyles(): CustomChromeStyle[] {
  return readAll()
}

export function saveCustomChromeStyle(style: CustomChromeStyle): CustomChromeStyle {
  const all = readAll()
  const idx = all.findIndex((s) => s.id === style.id)
  if (idx >= 0) all[idx] = style
  else all.push(style)
  writeAll(all)
  return style
}

export function deleteCustomChromeStyle(id: string) {
  writeAll(readAll().filter((s) => s.id !== id))
}

/** Notifies on any local CRUD write (same tab) or a write from another tab.
 * Returns an unsubscribe function. */
export function subscribeToCustomChromeStyles(callback: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, callback)
  window.addEventListener('storage', callback)
  return () => {
    window.removeEventListener(CHANGE_EVENT, callback)
    window.removeEventListener('storage', callback)
  }
}
