'use client'

import { createContext, useCallback, useContext, useRef, type ReactNode } from 'react'
import type { Editor } from '@tiptap/react'

interface EditorRegistryValue {
  register: (blockId: string, editor: Editor) => void
  unregister: (blockId: string) => void
  getAll: () => Map<string, Editor>
}

const EditorRegistryContext = createContext<EditorRegistryValue | null>(null)

/**
 * Every block renders its own live Tiptap instance simultaneously (see
 * BlockEditor) -- this registry is how a page-level feature that isn't
 * node-specific (search/replace) can reach all of them, keyed by block id.
 * A plain ref-backed Map, not state -- registering an editor shouldn't
 * itself trigger a re-render.
 */
export function EditorRegistryProvider({ children }: { children: ReactNode }) {
  const mapRef = useRef(new Map<string, Editor>())

  const register = useCallback((blockId: string, editor: Editor) => {
    mapRef.current.set(blockId, editor)
  }, [])
  const unregister = useCallback((blockId: string) => {
    mapRef.current.delete(blockId)
  }, [])
  const getAll = useCallback(() => mapRef.current, [])

  return (
    <EditorRegistryContext.Provider value={{ register, unregister, getAll }}>
      {children}
    </EditorRegistryContext.Provider>
  )
}

export function useEditorRegistry(): EditorRegistryValue {
  const ctx = useContext(EditorRegistryContext)
  if (!ctx) throw new Error('useEditorRegistry must be used within an EditorRegistryProvider')
  return ctx
}
