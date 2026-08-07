import type { PageNumberSettings } from '@/lib/documents/manifest'
import { formatPageNumber, pageNumberTypographyStyle } from '@/lib/documents/page-numbers'
import { GoogleFontLoader } from '@/components/editor/google-font-loader'

export function CanvasPageNumber({
  number,
  settings,
}: {
  number: number
  settings: PageNumberSettings
}) {
  if (!settings.enabled) return null

  const typography = settings.typography

  return (
    <>
      <GoogleFontLoader families={typography.fontSource === 'google' ? [typography.fontFamily] : []} />
      <span
        className={`scripture-canvas-page-number is-${settings.vertical} is-${settings.horizontal}`}
        data-highlighted={typography.highlightColor ? '' : undefined}
        style={pageNumberTypographyStyle(typography)}
        aria-label={`Page ${number}`}
      >
        {formatPageNumber(number, settings)}
      </span>
    </>
  )
}
