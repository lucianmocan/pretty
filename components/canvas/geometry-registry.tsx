'use client'

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { GeometryMap, NodeGeometry } from '@/lib/layout/geometry'

interface GeometryRegistryValue {
  geometry: GeometryMap
  observe: (
    id: string,
    parentId: string | null,
    element: HTMLElement,
    parentElement: HTMLElement | null,
    zoom: number
  ) => () => void
  measureAll: () => GeometryMap
}

const GeometryRegistryContext = createContext<GeometryRegistryValue | null>(null)

function sameGeometry(a: NodeGeometry | undefined, b: NodeGeometry) {
  return (
    a?.parentId === b.parentId &&
    a.x === b.x &&
    a.y === b.y &&
    a.width === b.width &&
    a.height === b.height
  )
}

export function GeometryRegistryProvider({ children }: { children: ReactNode }) {
  const entriesRef = useRef(
    new Map<
      string,
      {
        parentId: string | null
        element: HTMLElement
        parentElement: HTMLElement | null
        zoom: number
        cleanup: () => void
      }
    >()
  )
  const geometryRef = useRef(new Map<string, NodeGeometry>())
  const [version, setVersion] = useState(0)

  const measure = useCallback((id: string) => {
    const entry = entriesRef.current.get(id)
    if (!entry || !entry.element.isConnected) return
    const rect = entry.element.getBoundingClientRect()
    const parentRect = entry.parentElement?.getBoundingClientRect()
    const scale = Math.max(entry.zoom, 0.01)
    const next: NodeGeometry = {
      id,
      parentId: entry.parentId,
      x: parentRect
        ? (rect.left - parentRect.left) / scale + (entry.parentElement?.scrollLeft ?? 0)
        : 0,
      y: parentRect
        ? (rect.top - parentRect.top) / scale + (entry.parentElement?.scrollTop ?? 0)
        : 0,
      width: rect.width / scale,
      height: rect.height / scale,
    }
    if (sameGeometry(geometryRef.current.get(id), next)) return
    geometryRef.current.set(id, next)
    setVersion((value) => value + 1)
  }, [])

  const measureAll = useCallback(() => {
    for (const id of entriesRef.current.keys()) measure(id)
    return new Map(geometryRef.current)
  }, [measure])

  const observe = useCallback(
    (
      id: string,
      parentId: string | null,
      element: HTMLElement,
      parentElement: HTMLElement | null,
      zoom: number
    ) => {
      entriesRef.current.get(id)?.cleanup()
      const update = () => measure(id)
      const observer = new ResizeObserver(update)
      observer.observe(element)
      if (parentElement) observer.observe(parentElement)
      window.addEventListener('resize', update)
      window.addEventListener('scroll', update, true)
      const cleanup = () => {
        observer.disconnect()
        window.removeEventListener('resize', update)
        window.removeEventListener('scroll', update, true)
      }
      entriesRef.current.set(id, { parentId, element, parentElement, zoom, cleanup })
      update()
      return () => {
        const current = entriesRef.current.get(id)
        if (current?.element !== element) return
        cleanup()
        entriesRef.current.delete(id)
        if (geometryRef.current.delete(id)) setVersion((value) => value + 1)
      }
    },
    [measure]
  )

  const value = useMemo(
    () => ({ geometry: new Map(geometryRef.current), observe, measureAll }),
    // version intentionally snapshots the ref-backed map for consumers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version, observe, measureAll]
  )

  return <GeometryRegistryContext.Provider value={value}>{children}</GeometryRegistryContext.Provider>
}

export function useGeometryRegistry(): GeometryRegistryValue {
  const value = useContext(GeometryRegistryContext)
  if (!value) throw new Error('useGeometryRegistry must be used within GeometryRegistryProvider')
  return value
}
