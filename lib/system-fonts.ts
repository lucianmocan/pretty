export interface SystemFontData {
  family: string
  fullName: string
  postscriptName: string
  style: string
}

export interface SystemFontFamily {
  family: string
  styles: string[]
}

interface LocalFontAccessWindow extends Window {
  queryLocalFonts?: () => Promise<SystemFontData[]>
}

interface LocalFontPermissions {
  query(descriptor: { name: 'local-fonts' }): Promise<PermissionStatus>
}

let cachedSystemFontCatalog: SystemFontFamily[] | null = null

export function getCachedSystemFontCatalog(): SystemFontFamily[] {
  return cachedSystemFontCatalog ?? []
}

export function systemFontAccessSupported(): boolean {
  return typeof window !== 'undefined' && typeof (window as LocalFontAccessWindow).queryLocalFonts === 'function'
}

export async function systemFontPermissionGranted(): Promise<boolean> {
  if (!systemFontAccessSupported() || !navigator.permissions) return false
  try {
    const permissions = navigator.permissions as unknown as LocalFontPermissions
    const status = await permissions.query({ name: 'local-fonts' })
    return status.state === 'granted'
  } catch {
    return false
  }
}

/** Collapses the API's one-entry-per-face result into picker-friendly
 * families while retaining the available style names for a useful summary. */
export function groupSystemFontFamilies(fonts: Iterable<SystemFontData>): SystemFontFamily[] {
  const families = new Map<string, Set<string>>()
  for (const font of fonts) {
    const family = font.family.trim()
    if (!family) continue
    const styles = families.get(family) ?? new Set<string>()
    const style = font.style.trim()
    if (style) styles.add(style)
    families.set(family, styles)
  }
  return Array.from(families, ([family, styles]) => ({
    family,
    styles: [...styles].sort((a, b) => a.localeCompare(b)),
  })).sort((a, b) => a.family.localeCompare(b.family))
}

function weightFromSystemFontStyle(style: string): number {
  const normalized = style.toLocaleLowerCase().replace(/[^a-z0-9]/g, '')
  if (normalized.includes('thin') || normalized.includes('hairline')) return 100
  if (normalized.includes('extralight') || normalized.includes('ultralight')) return 200
  if (normalized.includes('light')) return 300
  if (normalized.includes('semibold') || normalized.includes('demibold')) return 600
  if (normalized.includes('extrabold') || normalized.includes('ultrabold')) return 800
  if (normalized.includes('black') || normalized.includes('heavy')) return 900
  if (normalized.includes('bold')) return 700
  if (normalized.includes('medium')) return 500
  return 400
}

export function systemFontWeightsForFamily(
  catalog: SystemFontFamily[],
  family: string
): number[] {
  const font = catalog.find((item) => item.family === family)
  if (!font || font.styles.length === 0) return [400]
  return [...new Set(font.styles.map(weightFromSystemFontStyle))].sort((a, b) => a - b)
}

/** When permission has not already been granted, this must be called directly
 * from a user gesture so the browser can show its local-font permission UI. */
export async function loadSystemFontCatalog(): Promise<SystemFontFamily[]> {
  if (cachedSystemFontCatalog) return cachedSystemFontCatalog
  const queryLocalFonts = (window as LocalFontAccessWindow).queryLocalFonts
  if (typeof queryLocalFonts !== 'function') {
    throw new Error('Device fonts are not supported by this browser.')
  }
  const fonts = await queryLocalFonts.call(window)
  cachedSystemFontCatalog = groupSystemFontFamilies(fonts)
  return cachedSystemFontCatalog
}
