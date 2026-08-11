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
    const uniqueWeights = [...new Set(numericWeights)]
    const weights = uniqueWeights.join(';')
    const hasNormal = metadata.styles.includes('normal')
    const hasItalic = metadata.styles.includes('italic')
    let axis: string | null = null
    if (uniqueWeights.length > 0) {
      if (metadata.variable) {
        const min = uniqueWeights[0]
        const max = uniqueWeights[uniqueWeights.length - 1]
        const range = min === max ? `${min}` : `${min}..${max}`
        const variants = [
          ...(hasNormal ? [`0,${range}`] : []),
          ...(hasItalic ? [`1,${range}`] : []),
        ]
        axis = hasItalic ? `ital,wght@${variants.join(';')}` : `wght@${range}`
      } else if (hasItalic) {
        const variants = uniqueWeights.flatMap((weight) => [
          ...(hasNormal ? [`0,${weight}`] : []),
          `1,${weight}`,
        ])
        axis = `ital,wght@${variants.join(';')}`
      } else {
        axis = `wght@${weights}`
      }
    }
    params.append('family', axis ? `${family}:${axis}` : family)
  }
  params.set('display', 'swap')
  return `https://fonts.googleapis.com/css2?${params.toString()}`
}

export function textFontFamilyCss(family: string | undefined, source: TextFontSource | undefined): string {
  if (!family || source === 'local' || !source) return 'var(--font-geist-sans), sans-serif'
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
