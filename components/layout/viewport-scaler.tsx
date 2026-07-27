'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { calculateViewportScale } from '@/lib/viewport-scale'
import { useUiDensity } from '@/lib/app-preferences'

/** Scales the root rem so application chrome and body-portaled overlays
 * (dialogs, menus, selects, and tooltips) stay in lockstep without changing
 * the canvas's coordinate system. */
export function ViewportScaler() {
  const pathname = usePathname()
  const density = useUiDensity()

  useEffect(() => {
    const root = document.documentElement
    const updateScale = () => {
      const scale = pathname.startsWith('/print/')
        ? 1
        : calculateViewportScale(window.innerWidth, window.innerHeight)
      root.style.setProperty('--scripture-ui-scale', String(scale))
      const densityScale = density === 'compact' ? 0.9 : 1
      root.style.setProperty('--scripture-ui-rem', `${16 * scale * densityScale}px`)
    }

    updateScale()
    window.addEventListener('resize', updateScale)
    window.visualViewport?.addEventListener('resize', updateScale)
    return () => {
      window.removeEventListener('resize', updateScale)
      window.visualViewport?.removeEventListener('resize', updateScale)
    }
  }, [pathname, density])

  return null
}
