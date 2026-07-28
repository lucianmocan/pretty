import type { JSONContent } from '@tiptap/core'
import type { TextFontSource } from '@/lib/layout/types'

export interface GoogleFontFamily {
  family: string
  weights: string[]
  styles: string[]
  subsets: string[]
  variable: boolean
}

export interface TextFontSelection {
  family: string
  source: TextFontSource
}

export const LOCAL_TEXT_FONT: TextFontSelection = {
  family: 'Geist Sans',
  source: 'local',
}

let cachedGoogleFontCatalog: GoogleFontFamily[] | null = null
let googleFontCatalogRequest: Promise<GoogleFontFamily[]> | null = null

export function loadGoogleFontCatalog(): Promise<GoogleFontFamily[]> {
  if (cachedGoogleFontCatalog) return Promise.resolve(cachedGoogleFontCatalog)
  if (!googleFontCatalogRequest) {
    googleFontCatalogRequest = fetch('/api/fonts/catalog')
      .then((response) => {
        if (!response.ok) throw new Error(`Font catalog request failed (${response.status})`)
        return response.json() as Promise<GoogleFontFamily[]>
      })
      .then((catalog) => {
        cachedGoogleFontCatalog = catalog
        return catalog
      })
      .finally(() => {
        googleFontCatalogRequest = null
      })
  }
  return googleFontCatalogRequest
}

function uniqueSortedFamilies(families: Iterable<string>): string[] {
  return [...new Set(families)].filter(Boolean).sort((a, b) => a.localeCompare(b))
}

/** Google Fonts' CSS v2 endpoint accepts repeated family parameters. Keeping
 * one stylesheet for all families in a block avoids a request per marked span. */
export function googleFontsStylesheetUrl(
  families: Iterable<string>,
  catalog?: GoogleFontFamily[]
): string | null {
  const names = uniqueSortedFamilies(families)
  if (names.length === 0) return null
  const params = new URLSearchParams()
  for (const family of names) {
    const metadata = catalog?.find((item) => item.family === family)
    if (!metadata) {
      params.append('family', family)
      continue
    }
    const numericWeights = metadata.weights
      .map(Number)
      .filter((weight) => Number.isFinite(weight))
      .sort((a, b) => a - b)
    const weights = [...new Set(numericWeights)].join(';')
    const hasItalic = metadata.styles.includes('italic')
    const axis = metadata.variable
      ? hasItalic
        ? 'ital,wght@0,100..900;1,100..900'
        : 'wght@100..900'
      : numericWeights.length > 0
        ? hasItalic
          ? `ital,wght@0,${weights};1,${weights}`
          : `wght@${weights}`
        : null
    params.append('family', axis ? `${family}:${axis}` : family)
  }
  params.set('display', 'swap')
  return `https://fonts.googleapis.com/css2?${params.toString()}`
}

export function textFontFamilyCss(family: string | undefined, source: TextFontSource | undefined): string {
  if (!family || source !== 'google') return 'var(--font-geist-sans), sans-serif'
  const safeFamily = family.replaceAll('\\', '\\\\').replaceAll("'", "\\'")
  return `'${safeFamily}', var(--font-geist-sans), sans-serif`
}

/** Finds every selection-level Google font used by the collaborative Tiptap
 * document, plus the text block's base family. */
export function googleFontsInDocument(
  document: JSONContent | null | undefined,
  baseFamily?: string,
  baseSource?: TextFontSource
): string[] {
  const families = new Set<string>()
  if (baseSource === 'google' && baseFamily) families.add(baseFamily)

  const visit = (node: JSONContent) => {
    for (const mark of node.marks ?? []) {
      if (mark.type !== 'format' || mark.attrs?.fontSource !== 'google') continue
      const family = mark.attrs.fontFamily
      if (typeof family === 'string' && family) families.add(family)
    }
    for (const child of node.content ?? []) visit(child)
  }
  if (document) visit(document)
  return uniqueSortedFamilies(families)
}
