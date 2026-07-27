'use client'

import { useSyncExternalStore } from 'react'

const PREFERENCE_EVENT = 'scripture:app-preferences-changed'

const keys = {
  theme: 'scripture:appearance-theme',
  density: 'scripture:appearance-density',
  motion: 'scripture:appearance-motion',
  exportQuality: 'scripture:export-quality',
  exportMargin: 'scripture:export-margin',
  transparentExport: 'scripture:export-transparent-background',
} as const

export const APP_THEME_OPTIONS = ['dark', 'light', 'system'] as const
export type AppTheme = (typeof APP_THEME_OPTIONS)[number]
export const UI_DENSITY_OPTIONS = ['comfortable', 'compact'] as const
export type UiDensity = (typeof UI_DENSITY_OPTIONS)[number]
export const MOTION_OPTIONS = ['system', 'full', 'reduced'] as const
export type MotionPreference = (typeof MOTION_OPTIONS)[number]
export type ExportFormat = 'pdf' | 'png'
export const EXPORT_QUALITY_OPTIONS = ['standard', 'high', 'maximum'] as const
export type ExportQuality = (typeof EXPORT_QUALITY_OPTIONS)[number]
export const EXPORT_MARGIN_OPTIONS = [0, 16, 32] as const
export const MIN_EXPORT_MARGIN = 0
export const MAX_EXPORT_MARGIN = 512
export type ExportMargin = number

export const DEFAULT_APP_THEME: AppTheme = 'dark'
export const DEFAULT_UI_DENSITY: UiDensity = 'comfortable'
export const DEFAULT_MOTION: MotionPreference = 'system'
export const DEFAULT_EXPORT_QUALITY: ExportQuality = 'standard'
export const DEFAULT_EXPORT_MARGIN: ExportMargin = 32
export const DEFAULT_TRANSPARENT_EXPORT = true

function option<T extends string>(value: unknown, options: readonly T[], fallback: T): T {
  return options.includes(value as T) ? (value as T) : fallback
}

export const normalizeAppTheme = (value: unknown) => option(value, APP_THEME_OPTIONS, DEFAULT_APP_THEME)
export const normalizeUiDensity = (value: unknown) => option(value, UI_DENSITY_OPTIONS, DEFAULT_UI_DENSITY)
export const normalizeMotionPreference = (value: unknown) => option(value, MOTION_OPTIONS, DEFAULT_MOTION)
export const normalizeExportQuality = (value: unknown) => option(value, EXPORT_QUALITY_OPTIONS, DEFAULT_EXPORT_QUALITY)

export function normalizeExportMargin(value: unknown): ExportMargin {
  if (value === null || value === '') return DEFAULT_EXPORT_MARGIN
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= MIN_EXPORT_MARGIN && parsed <= MAX_EXPORT_MARGIN
    ? parsed
    : DEFAULT_EXPORT_MARGIN
}

function stored(key: string): string | null {
  return typeof window === 'undefined' ? null : window.localStorage.getItem(key)
}

function setStored(key: string, value: string) {
  window.localStorage.setItem(key, value)
  window.dispatchEvent(new Event(PREFERENCE_EVENT))
}

function subscribe(callback: () => void) {
  window.addEventListener(PREFERENCE_EVENT, callback)
  window.addEventListener('storage', callback)
  return () => {
    window.removeEventListener(PREFERENCE_EVENT, callback)
    window.removeEventListener('storage', callback)
  }
}

function usePreference<T>(getSnapshot: () => T, serverSnapshot: T): T {
  return useSyncExternalStore(subscribe, getSnapshot, () => serverSnapshot)
}

export const getAppTheme = () => normalizeAppTheme(stored(keys.theme))
export const setAppTheme = (value: AppTheme) => setStored(keys.theme, normalizeAppTheme(value))
export const useAppTheme = () => usePreference(getAppTheme, DEFAULT_APP_THEME)

export const getUiDensity = () => normalizeUiDensity(stored(keys.density))
export const setUiDensity = (value: UiDensity) => setStored(keys.density, normalizeUiDensity(value))
export const useUiDensity = () => usePreference(getUiDensity, DEFAULT_UI_DENSITY)

export const getMotionPreference = () => normalizeMotionPreference(stored(keys.motion))
export const setMotionPreference = (value: MotionPreference) => setStored(keys.motion, normalizeMotionPreference(value))
export const useMotionPreference = () => usePreference(getMotionPreference, DEFAULT_MOTION)

export const getExportQuality = () => normalizeExportQuality(stored(keys.exportQuality))
export const setExportQuality = (value: ExportQuality) => setStored(keys.exportQuality, normalizeExportQuality(value))
export const useExportQuality = () => usePreference(getExportQuality, DEFAULT_EXPORT_QUALITY)

export const getExportMargin = () => normalizeExportMargin(stored(keys.exportMargin))
export const setExportMargin = (value: ExportMargin) => setStored(keys.exportMargin, String(normalizeExportMargin(value)))
export const useExportMargin = () => usePreference(getExportMargin, DEFAULT_EXPORT_MARGIN)

export const getTransparentExport = () => stored(keys.transparentExport) !== 'false'
export const setTransparentExport = (value: boolean) => setStored(keys.transparentExport, String(value))
export const useTransparentExport = () => usePreference(getTransparentExport, DEFAULT_TRANSPARENT_EXPORT)

export function exportRasterScale(format: ExportFormat, quality: ExportQuality): number {
  if (quality === 'maximum') return 3
  if (quality === 'high') return format === 'pdf' ? 2.5 : 2
  return format === 'pdf' ? 2 : 1
}

export function getExportPreferences() {
  return {
    quality: getExportQuality(),
    margin: getExportMargin(),
    transparentBackground: getTransparentExport(),
  }
}
