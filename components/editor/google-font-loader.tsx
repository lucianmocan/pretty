'use client'

import { useEffect, useState } from 'react'
import { googleFontsStylesheetUrl, loadGoogleFontCatalog, type GoogleFontFamily } from '@/lib/google-fonts'

const loadedStylesheets = new Set<string>()

export function GoogleFontLoader({ families }: { families: string[] }) {
  const [catalog, setCatalog] = useState<GoogleFontFamily[] | undefined>(undefined)
  // Wait for the catalog before inserting the stylesheet. Loading the family
  // without its weight axis first leaves edit/static surfaces with different
  // faces while the weighted request is still arriving.
  const href = catalog ? googleFontsStylesheetUrl(families, catalog) : null

  useEffect(() => {
    if (families.length === 0) return
    let cancelled = false
    void loadGoogleFontCatalog().then((nextCatalog) => {
      if (!cancelled) setCatalog(nextCatalog)
    }).catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [families])

  useEffect(() => {
    if (!href || loadedStylesheets.has(href)) return
    const existing = document.head.querySelector<HTMLLinkElement>(
      `link[data-scripture-google-fonts][href="${CSS.escape(href)}"]`
    )
    if (existing) {
      loadedStylesheets.add(href)
      return
    }
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = href
    link.crossOrigin = 'anonymous'
    link.dataset.scriptureGoogleFonts = ''
    document.head.append(link)
    loadedStylesheets.add(href)
  }, [href])

  return null
}

/** React hoists stylesheet links into <head>, including in the server-rendered
 * print surface. Browser export separately waits for document.fonts.ready.
 * `catalog` must be the same weight-axis catalog GoogleFontLoader waits for --
 * requesting a family with no weight axis (the fallback below) only fetches
 * its default (400) weight, so a bold/italic run falls back to a system font
 * once font-synthesis: none rules out browser-synthesized bold and produces
 * text noticeably wider than the live canvas, wrapping differently. */
export function GoogleFontStylesheet({
  families,
  catalog,
}: {
  families: string[]
  catalog?: GoogleFontFamily[]
}) {
  const href = googleFontsStylesheetUrl(families, catalog)
  if (!href) return null
  return (
    <link
      rel="stylesheet"
      href={href}
      crossOrigin="anonymous"
      data-scripture-google-fonts=""
    />
  )
}
