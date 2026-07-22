import type { FrameProps, CodeBlockProps } from '@/lib/layout/types'

const STORAGE_KEY = 'scripture:style-presets'

export interface StylePreset {
  id: string
  name: string
  frame: Partial<FrameProps>
  code: Partial<CodeBlockProps>
}

/** Same localStorage read/write pattern as lib/documents/manifest.ts --
 * small, synchronous, easy to inspect, and this is a personal local tool
 * with no server-side user accounts to store presets against instead. */
function readAll(): StylePreset[] {
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

function writeAll(presets: StylePreset[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(presets))
  } catch {
    // Best-effort -- e.g. storage quota exceeded or disabled (private browsing).
  }
}

export function listStylePresets(): StylePreset[] {
  return readAll()
}

export function saveStylePreset(
  name: string,
  frame: Partial<FrameProps>,
  code: Partial<CodeBlockProps>
): StylePreset {
  const preset: StylePreset = { id: crypto.randomUUID(), name, frame, code }
  const presets = readAll()
  presets.push(preset)
  writeAll(presets)
  return preset
}

export function deleteStylePreset(id: string) {
  writeAll(readAll().filter((p) => p.id !== id))
}
