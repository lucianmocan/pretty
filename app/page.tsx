'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowRight,
  Download,
  HardDrive,
  Languages,
  Moon,
  MoveUpRight,
  Sun,
} from 'lucide-react'
import { createDocument } from '@/lib/documents/manifest'
import { setAppTheme, useAppTheme } from '@/lib/app-preferences'
import { Button } from '@/components/ui/button'

export default function PrettyHomePage() {
  const router = useRouter()
  const theme = useAppTheme()
  const [creating, setCreating] = useState(false)
  const [systemDark, setSystemDark] = useState(false)

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const updateSystemTheme = () => setSystemDark(media.matches)
    updateSystemTheme()
    media.addEventListener('change', updateSystemTheme)
    return () => media.removeEventListener('change', updateSystemTheme)
  }, [])

  const isDark = theme === 'dark' || (theme === 'system' && systemDark)

  function handleNewProject() {
    if (creating) return
    setCreating(true)
    const document = createDocument()
    router.push(`/doc/${document.id}?new=1`)
  }

  return (
    <div className="scripture-landing">
      <header className="scripture-landing-nav">
        <Link href="/" className="scripture-landing-logo" aria-label="Pretty home">
          pretty
        </Link>
        <nav className="scripture-landing-nav-links" aria-label="Main navigation">
          <a href="https://github.com/lucianmocan/pretty" target="_blank" rel="noopener noreferrer">
            <span className="scripture-github-mark" aria-hidden="true" />
            GitHub
          </a>
        </nav>
      </header>

      <main>
        <section className="scripture-landing-hero">
          <div className="scripture-hero-copy">
            <h1>
              Nice
              <span>Code.</span>
            </h1>
            <p>
              Pretty turns code, context, and annotation into clear visual narratives—without flattening your
              work into another forgettable screenshot.
            </p>
            <div className="scripture-hero-actions">
              <Button size="lg" onClick={handleNewProject} disabled={creating}>
                {creating ? 'Opening your canvas…' : 'Start a new project'}
                {!creating && <ArrowRight />}
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link href="/dashboard">
                  Open workspace
                  <MoveUpRight />
                </Link>
              </Button>
            </div>
            <div className="scripture-hero-privacy">
              <strong>Completely free. Open source.</strong>
              <span className="scripture-hero-local-note">
                <HardDrive />
                No account or cloud sync. Everything stays in this browser.
              </span>
              <div className="scripture-hero-facts" aria-label="Product highlights">
                <span>
                  <Languages />
                  235+ languages
                </span>
                <i />
                <span>
                  <Download />
                  PNG + PDF export
                </span>
              </div>
            </div>
          </div>

          <div className="scripture-product-stage">
            <div className="scripture-product-glow" />
            <div className="scripture-product-screenshot">
              <Image
                src="/pretty-editor-preview.png"
                alt="The Pretty editor showing a before-and-after TypeScript composition"
                width={2914}
                height={1808}
                sizes="(max-width: 1050px) calc(100vw - 3rem), 58vw"
                priority
              />
            </div>
          </div>
        </section>

        <section className="scripture-landing-cta">
          <h2>Give the code some room to speak.</h2>
        </section>
      </main>

      <footer className="scripture-landing-footer">
        <Link href="/" className="scripture-landing-logo" aria-label="Pretty home">pretty</Link>
        <div>
          <p>Free and open source</p>
          <a href="https://github.com/lucianmocan/pretty/blob/main/LICENSE" target="_blank" rel="noopener noreferrer">GPL-3.0</a>
          <button
            type="button"
            className="scripture-landing-theme-toggle"
            onClick={() => setAppTheme(isDark ? 'light' : 'dark')}
            aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`}
            title={`Switch to ${isDark ? 'light' : 'dark'} mode`}
          >
            {isDark ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
          </button>
        </div>
      </footer>
    </div>
  )
}
