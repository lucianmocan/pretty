export interface SystemFontData {
  family: string
  fullName: string
  postscriptName: string
  style: string
}

/** The Local Font Access API's real return shape -- SystemFontData above
 * drops `blob()` because most call sites only need the catalog metadata. */
interface LocalFontDataEntry extends SystemFontData {
  blob(): Promise<Blob>
}

export interface SystemFontFamily {
  family: string
  styles: string[]
}

interface LocalFontAccessWindow extends Window {
  queryLocalFonts?: () => Promise<LocalFontDataEntry[]>
}

interface LocalFontPermissions {
  query(descriptor: { name: 'local-fonts' }): Promise<PermissionStatus>
}

let cachedSystemFontCatalog: SystemFontFamily[] | null = null
let cachedRawSystemFonts: LocalFontDataEntry[] | null = null
let rawSystemFontsRequest: Promise<LocalFontDataEntry[]> | null = null
const embeddedSystemFontFamilyRequests = new Map<string, Promise<string | null>>()

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
  const fonts = await queryRawSystemFonts()
  cachedSystemFontCatalog = groupSystemFontFamilies(fonts)
  return cachedSystemFontCatalog
}

function queryRawSystemFonts(): Promise<LocalFontDataEntry[]> {
  if (cachedRawSystemFonts) return Promise.resolve(cachedRawSystemFonts)
  if (rawSystemFontsRequest) return rawSystemFontsRequest
  const queryLocalFonts = (window as LocalFontAccessWindow).queryLocalFonts
  if (typeof queryLocalFonts !== 'function') {
    throw new Error('Device fonts are not supported by this browser.')
  }
  rawSystemFontsRequest = queryLocalFonts.call(window)
    .then((fonts) => {
      cachedRawSystemFonts = fonts
      return fonts
    })
    .finally(() => {
      rawSystemFontsRequest = null
    })
  return rawSystemFontsRequest
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = ''
  const bytes = new Uint8Array(buffer)
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

/**
 * A device font is applied by CSS `font-family` name only -- the browser
 * matches it against fonts installed on this OS. The offscreen export
 * surface renders into an SVG `<foreignObject>` that's then drawn through an
 * `<img>` (see modern-screenshot), and that image-decoding context does not
 * resolve OS-installed fonts by name -- only real `@font-face` rules with an
 * embedded `src: url(...)` get bundled into the captured image. Without this,
 * export silently falls back to the default app font for any device-font
 * block, which -- inside a resized (fixed-width) box -- reflows the text
 * differently than the live canvas.
 *
 * The Local Font Access API's `FontData.blob()` can read the real font file
 * bytes (once the user has already granted local-font permission by picking
 * a device font), so each face actually used in the document is embedded as
 * a real `@font-face`, matching how Google Fonts are already embedded via a
 * normal stylesheet `<link>`.
 */
export async function embedSystemFontFaces(families: string[]): Promise<string | null> {
  if (families.length === 0 || !systemFontAccessSupported()) return null
  const wanted = new Set(families)
  let fonts: LocalFontDataEntry[]
  try {
    fonts = await queryRawSystemFonts()
  } catch {
    return null
  }
  const faces = await Promise.all([...wanted].map((family) => {
    const cached = embeddedSystemFontFamilyRequests.get(family)
    if (cached) return cached
    const request = Promise.all(
      fonts.filter((font) => font.family === family).map(async (font) => {
        try {
          const blob = await font.blob()
          const buffer = await blob.arrayBuffer()
          const base64 = arrayBufferToBase64(buffer)
          const weight = weightFromSystemFontStyle(font.style)
          const style = font.style.toLocaleLowerCase().includes('italic') ? 'italic' : 'normal'
          const safeFamily = font.family.replaceAll('\\', '\\\\').replaceAll("'", "\\'")
          const mimeType = blob.type || 'application/octet-stream'
          return `@font-face { font-family: '${safeFamily}'; font-weight: ${weight}; font-style: ${style}; src: url(data:${mimeType};base64,${base64}); }`
        } catch {
          return null
        }
      })
    ).then((familyFaces) => familyFaces.filter(Boolean).join('\n') || null)
    embeddedSystemFontFamilyRequests.set(family, request)
    return request
  }))
  const cssText = faces.filter(Boolean).join('\n')
  return cssText.length > 0 ? cssText : null
}
