'use client'

import { useEffect } from 'react'
import { useAppTheme, useMotionPreference, useUiDensity } from '@/lib/app-preferences'

export function PreferenceEffects() {
  const theme = useAppTheme()
  const density = useUiDensity()
  const motion = useMotionPreference()

  useEffect(() => {
    const root = document.documentElement
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => root.classList.toggle('dark', theme === 'dark' || (theme === 'system' && systemDark.matches))
    apply()
    systemDark.addEventListener('change', apply)
    return () => systemDark.removeEventListener('change', apply)
  }, [theme])

  useEffect(() => {
    document.documentElement.dataset.scriptureDensity = density
  }, [density])

  useEffect(() => {
    const root = document.documentElement
    const systemReduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    const apply = () => {
      const reduced = motion === 'reduced' || (motion === 'system' && systemReduced.matches)
      root.dataset.scriptureReducedMotion = String(reduced)
    }
    apply()
    systemReduced.addEventListener('change', apply)
    return () => systemReduced.removeEventListener('change', apply)
  }, [motion])

  return null
}
