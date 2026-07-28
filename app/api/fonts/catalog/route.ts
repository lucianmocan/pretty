import { googleFontsMetadata } from 'next/dist/compiled/@next/font/dist/google/google-fonts-metadata'
import type { GoogleFontFamily } from '@/lib/google-fonts'

const catalog: GoogleFontFamily[] = Object.entries(googleFontsMetadata).map(([family, metadata]) => ({
  family,
  weights: metadata.weights.filter((weight) => weight !== 'variable'),
  styles: metadata.styles,
  subsets: metadata.subsets,
  variable: metadata.weights.includes('variable'),
}))

export async function GET() {
  return Response.json(catalog, {
    headers: {
      'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
    },
  })
}
