'use client'

import { createContext, useCallback, useContext, useMemo, useRef, type ReactNode } from 'react'
import type { Editor } from '@tiptap/react'
import type { LocalMatch } from '@/lib/tiptap/find-replace'

export interface StaticEditorAdapter {
  getText: () => string
  findMatches: (query: string) => LocalMatch[]
  replaceMatch: (match: LocalMatch, replacement: string) => void
  replaceAll: (query: string, replacement: string) => number
  subscribe: (listener: () => void) => () => void
}

interface EditorRegistryValue {
  register: (blockId: string, editor: Editor) => void
  unregister: (blockId: string, editor: Editor) => void
  registerStatic: (blockId: string, adapter: StaticEditorAdapter) => void
  unregisterStatic: (blockId: string, adapter: StaticEditorAdapter) => void
  getAll: () => Map<string, Editor>
  getStatic: () => Map<string, StaticEditorAdapter>
  waitForEditor: (blockId: string, timeoutMs?: number) => Promise<Editor | null>
  subscribe: (listener: () => void) => () => void
}

const EditorRegistryContext = createContext<EditorRegistryValue | null>(null)

/**
 * Live editors and lightweight static block adapters share this registry so
 * document-wide search keeps working when inactive canvas editors unmount.
 */
export function EditorRegistryProvider({ children }: { children: ReactNode }) {
  const mapRef = useRef(new Map<string, Editor>())
  const staticMapRef = useRef(new Map<string, StaticEditorAdapter>())
  const waitersRef = useRef(new Map<string, Set<(editor: Editor | null) => void>>())
  const listenersRef = useRef(new Set<() => void>())
  const notify = useCallback(() => listenersRef.current.forEach((listener) => listener()), [])

  const register = useCallback((blockId: string, editor: Editor) => {
    mapRef.current.set(blockId, editor)
    const waiters = waitersRef.current.get(blockId)
    if (waiters) {
      waiters.forEach((resolve) => resolve(editor))
      waitersRef.current.delete(blockId)
    }
    notify()
  }, [notify])
  const unregister = useCallback((blockId: string, editor: Editor) => {
    if (mapRef.current.get(blockId) !== editor) return
    mapRef.current.delete(blockId)
    notify()
  }, [notify])
  const registerStatic = useCallback((blockId: string, adapter: StaticEditorAdapter) => {
    staticMapRef.current.set(blockId, adapter)
  }, [])
  const unregisterStatic = useCallback((blockId: string, adapter: StaticEditorAdapter) => {
    if (staticMapRef.current.get(blockId) === adapter) staticMapRef.current.delete(blockId)
  }, [])
  const getAll = useCallback(() => mapRef.current, [])
  const getStatic = useCallback(() => staticMapRef.current, [])
  const waitForEditor = useCallback((blockId: string, timeoutMs = 1200) => {
    const current = mapRef.current.get(blockId)
    if (current) return Promise.resolve(current)
    return new Promise<Editor | null>((resolve) => {
      const waiters = waitersRef.current.get(blockId) ?? new Set()
      waiters.add(resolve)
      waitersRef.current.set(blockId, waiters)
      window.setTimeout(() => {
        const pendingWaiters = waitersRef.current.get(blockId)
        if (!pendingWaiters?.delete(resolve)) return
        if (pendingWaiters.size === 0) waitersRef.current.delete(blockId)
        resolve(null)
      }, timeoutMs)
    })
  }, [])
  const subscribe = useCallback((listener: () => void) => {
    listenersRef.current.add(listener)
    return () => {
      listenersRef.current.delete(listener)
    }
  }, [])
  const value = useMemo(() => ({
    register,
    unregister,
    registerStatic,
    unregisterStatic,
    getAll,
    getStatic,
    waitForEditor,
    subscribe,
  }), [getAll, getStatic, register, registerStatic, subscribe, unregister, unregisterStatic, waitForEditor])

  return (
    <EditorRegistryContext.Provider value={value}>
      {children}
    </EditorRegistryContext.Provider>
  )
}

export function useEditorRegistry(): EditorRegistryValue {
  const ctx = useContext(EditorRegistryContext)
  if (!ctx) throw new Error('useEditorRegistry must be used within an EditorRegistryProvider')
  return ctx
}
