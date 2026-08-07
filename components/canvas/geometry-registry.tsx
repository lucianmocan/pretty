'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { GeometryMap, NodeGeometry } from '@/lib/layout/geometry'

interface GeometryRegistryActions {
  observe: (
    id: string,
    parentId: string | null,
    element: HTMLElement,
    parentElement: HTMLElement | null,
    zoom: number
  ) => () => void
  measureAll: () => GeometryMap
}

interface GeometryRegistryValue extends GeometryRegistryActions {
  geometry: GeometryMap
}

const GeometryRegistryActionsContext = createContext<GeometryRegistryActions | null>(null)
const GeometryRegistrySnapshotContext = createContext<GeometryMap | null>(null)

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
  const resizeObserverRef = useRef<ResizeObserver | null>(null)
  const observedElementsRef = useRef(new Map<Element, number>())
  const measurementFrameRef = useRef<number | null>(null)
  const [version, setVersion] = useState(0)

  const measure = useCallback((id: string): boolean => {
    const entry = entriesRef.current.get(id)
    if (!entry || !entry.element.isConnected) return false
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
    if (sameGeometry(geometryRef.current.get(id), next)) return false
    geometryRef.current.set(id, next)
    return true
  }, [])

  const measureAll = useCallback(() => {
    let changed = false
    for (const id of entriesRef.current.keys()) {
      if (measure(id)) changed = true
    }
    if (changed) setVersion((value) => value + 1)
    return new Map(geometryRef.current)
  }, [measure])

  const scheduleMeasurement = useCallback(() => {
    if (measurementFrameRef.current != null) return
    measurementFrameRef.current = requestAnimationFrame(() => {
      measurementFrameRef.current = null
      measureAll()
    })
  }, [measureAll])

  useEffect(() => {
    window.addEventListener('resize', scheduleMeasurement)
    window.addEventListener('scroll', scheduleMeasurement, true)
    return () => {
      window.removeEventListener('resize', scheduleMeasurement)
      window.removeEventListener('scroll', scheduleMeasurement, true)
      if (measurementFrameRef.current != null) {
        cancelAnimationFrame(measurementFrameRef.current)
        measurementFrameRef.current = null
      }
      resizeObserverRef.current?.disconnect()
      resizeObserverRef.current = null
      observedElementsRef.current.clear()
    }
  }, [scheduleMeasurement])

  const observe = useCallback(
    (
      id: string,
      parentId: string | null,
      element: HTMLElement,
      parentElement: HTMLElement | null,
      zoom: number
    ) => {
      entriesRef.current.get(id)?.cleanup()
      if (!resizeObserverRef.current) {
        resizeObserverRef.current = new ResizeObserver(scheduleMeasurement)
      }
      const retainElement = (target: Element | null) => {
        if (!target) return
        const count = observedElementsRef.current.get(target) ?? 0
        observedElementsRef.current.set(target, count + 1)
        if (count === 0) resizeObserverRef.current?.observe(target)
      }
      const releaseElement = (target: Element | null) => {
        if (!target) return
        const count = observedElementsRef.current.get(target)
        if (count == null) return
        if (count > 1) observedElementsRef.current.set(target, count - 1)
        else {
          observedElementsRef.current.delete(target)
          resizeObserverRef.current?.unobserve(target)
        }
      }
      retainElement(element)
      retainElement(parentElement)
      const cleanup = () => {
        releaseElement(element)
        releaseElement(parentElement)
      }
      const registeredEntry = { parentId, element, parentElement, zoom, cleanup }
      entriesRef.current.set(id, registeredEntry)
      scheduleMeasurement()
      return () => {
        const current = entriesRef.current.get(id)
        if (current !== registeredEntry) return
        cleanup()
        entriesRef.current.delete(id)
        if (geometryRef.current.delete(id)) setVersion((value) => value + 1)
      }
    },
    [scheduleMeasurement]
  )

  const actions = useMemo(() => ({ observe, measureAll }), [observe, measureAll])
  const snapshot = useMemo(
    () => new Map(geometryRef.current),
    // version intentionally snapshots the ref-backed map for consumers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version]
  )

  return (
    <GeometryRegistryActionsContext.Provider value={actions}>
      <GeometryRegistrySnapshotContext.Provider value={snapshot}>
        {children}
      </GeometryRegistrySnapshotContext.Provider>
    </GeometryRegistryActionsContext.Provider>
  )
}

/** Stable geometry operations for canvas nodes that register measurements but
 * do not render them. These consumers no longer rerender when another node's
 * ResizeObserver reports a change. */
export function useGeometryActions(): GeometryRegistryActions {
  const value = useContext(GeometryRegistryActionsContext)
  if (!value) throw new Error('useGeometryActions must be used within GeometryRegistryProvider')
  return value
}

export function useGeometryRegistry(): GeometryRegistryValue {
  const actions = useGeometryActions()
  const geometry = useContext(GeometryRegistrySnapshotContext)
  if (!geometry) throw new Error('useGeometryRegistry must be used within GeometryRegistryProvider')
  return { ...actions, geometry }
}
