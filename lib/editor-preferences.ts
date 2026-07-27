'use client'

import { useSyncExternalStore } from 'react'

const TAB_SIZE_KEY = 'scripture:editor-tab-size'
const AUTO_INDENT_KEY = 'scripture:editor-auto-indent'
const EDITOR_PREFERENCE_EVENT = 'scripture:editor-preferences-changed'
export const DEFAULT_TAB_SIZE = 2
export const TAB_SIZE_OPTIONS = [2, 4, 8] as const
export const MIN_TAB_SIZE = 1
export const MAX_TAB_SIZE = 16

export function normalizeTabSize(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isInteger(parsed) && parsed >= MIN_TAB_SIZE && parsed <= MAX_TAB_SIZE
    ? parsed
    : DEFAULT_TAB_SIZE
}

/** Number of leading spaces Backspace should remove to reach the previous
 * indentation tab stop. Returns zero once the caret is past real code. */
export function indentationBackspaceCount(textBeforeCaret: string, tabSize: number): number {
  const currentLine = textBeforeCaret.slice(textBeforeCaret.lastIndexOf('\n') + 1)
  if (!/^ +$/.test(currentLine)) return 0

  const normalizedTabSize = normalizeTabSize(tabSize)
  return currentLine.length % normalizedTabSize || normalizedTabSize
}

export function nextLineIndent(textBeforeCaret: string, tabSize: number): string {
  const currentLine = textBeforeCaret.slice(textBeforeCaret.lastIndexOf('\n') + 1)
  const leading = currentLine.match(/^ */)?.[0] ?? ''
  const opensBlock = /[{[(]\s*$/.test(currentLine)
  return leading + (opensBlock ? ' '.repeat(normalizeTabSize(tabSize)) : '')
}

export function getTabSize(): number {
  if (typeof window === 'undefined') return DEFAULT_TAB_SIZE
  return normalizeTabSize(window.localStorage.getItem(TAB_SIZE_KEY))
}

export function setTabSize(value: number) {
  const next = normalizeTabSize(value)
  window.localStorage.setItem(TAB_SIZE_KEY, String(next))
  window.dispatchEvent(new Event(EDITOR_PREFERENCE_EVENT))
}

export function getAutoIndent(): boolean {
  if (typeof window === 'undefined') return true
  return window.localStorage.getItem(AUTO_INDENT_KEY) !== 'false'
}

export function setAutoIndent(value: boolean) {
  window.localStorage.setItem(AUTO_INDENT_KEY, String(value))
  window.dispatchEvent(new Event(EDITOR_PREFERENCE_EVENT))
}

function subscribe(callback: () => void) {
  window.addEventListener(EDITOR_PREFERENCE_EVENT, callback)
  window.addEventListener('storage', callback)
  return () => {
    window.removeEventListener(EDITOR_PREFERENCE_EVENT, callback)
    window.removeEventListener('storage', callback)
  }
}

export function useTabSize(): number {
  return useSyncExternalStore(subscribe, getTabSize, () => DEFAULT_TAB_SIZE)
}

export function useAutoIndent(): boolean {
  return useSyncExternalStore(subscribe, getAutoIndent, () => true)
}
