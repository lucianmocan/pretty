import type { CSSProperties } from 'react'
import type { PageNumberSettings, PageNumberTypography } from '@/lib/documents/manifest'
import { textFontFamilyCss } from '@/lib/google-fonts'

export interface ResolvedPageNumber {
  number: number
  text: string
}

function romanNumeral(value: number): string {
  const numerals: Array<[number, string]> = [
    [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'],
    [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'],
    [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
  ]
  let remaining = Math.max(1, Math.floor(value))
  let result = ''
  for (const [amount, numeral] of numerals) {
    while (remaining >= amount) {
      result += numeral
      remaining -= amount
    }
  }
  return result
}

export function formatPageNumber(number: number, settings: PageNumberSettings): string {
  return settings.numeralStyle === 'roman' ? romanNumeral(number) : String(number)
}

export function pageNumberTypographyStyle(typography: PageNumberTypography): CSSProperties {
  const decorations = [typography.underline && 'underline', typography.strike && 'line-through']
    .filter(Boolean)
    .join(' ')
  return {
    fontFamily: textFontFamilyCss(typography.fontFamily, typography.fontSource),
    fontSize: `${typography.fontSize}px`,
    fontWeight: typography.fontWeight,
    fontStyle: typography.fontStyle,
    lineHeight: typography.lineHeight,
    letterSpacing: `${typography.letterSpacing}px`,
    color: typography.textColor,
    background: typography.highlightColor ?? undefined,
    textDecorationLine: decorations || undefined,
  }
}

/** Returns null when numbering is disabled, has not started yet, or is
 * suppressed on this specific page. The first eligible start page is 1/I;
 * hiding an individual page does not change later pages' values. */
export function resolvePageNumber(
  pageIds: string[],
  pageId: string,
  settings: PageNumberSettings
): ResolvedPageNumber | null {
  if (!settings.enabled || settings.hiddenPageIds.includes(pageId)) return null
  const pageIndex = pageIds.indexOf(pageId)
  if (pageIndex < 0) return null
  const configuredStartIndex = settings.startPageId ? pageIds.indexOf(settings.startPageId) : 0
  const startIndex = configuredStartIndex >= 0 ? configuredStartIndex : 0
  if (pageIndex < startIndex) return null
  const number = pageIndex - startIndex + 1
  return { number, text: formatPageNumber(number, settings) }
}
