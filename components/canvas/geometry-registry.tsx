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
import { MIN_CANVAS_ZOOM } from '@/lib/layout/canvas-zoom'

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
const GEOMETRY_EPSILON = 0.01

function sameGeometry(a: NodeGeometry | undefined, b: NodeGeometry) {
  const close = (left: number | undefined, right: number) =>
    left != null && Math.abs(left - right) <= GEOMETRY_EPSILON
  return (
    a?.parentId === b.parentId &&
    close(a?.x, b.x) &&
    close(a?.y, b.y) &&
    close(a?.width, b.width) &&
    close(a?.height, b.height)
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
  const versionFrameRef = useRef<number | null>(null)
  const [version, setVersion] = useState(0)

  // Publish measured geometry on the next frame rather than synchronously
  // inside ResizeObserver/scroll measurement callbacks. This keeps a render
  // from synchronously re-entering the measurement pipeline.
  const scheduleVersion = useCallback(() => {
    if (versionFrameRef.current != null) return
    versionFrameRef.current = requestAnimationFrame(() => {
      versionFrameRef.current = null
      setVersion((value) => value + 1)
    })
  }, [])

  const measure = useCallback((id: string): boolean => {
    const entry = entriesRef.current.get(id)
    if (!entry || !entry.element.isConnected) return false
    const rect = entry.element.getBoundingClientRect()
    const parentRect = entry.parentElement?.getBoundingClientRect()
    const scale = Math.max(entry.zoom, MIN_CANVAS_ZOOM)
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
    if (changed) scheduleVersion()
    return new Map(geometryRef.current)
  }, [measure, scheduleVersion])

  const scheduleMeasurement = useCallback(() => {
    if (measurementFrameRef.current != null) return
    measurementFrameRef.current = requestAnimationFrame(() => {
      measurementFrameRef.current = null
      measureAll()
    })
  }, [measureAll])

  useEffect(() => {
    const observedElements = observedElementsRef.current
    window.addEventListener('resize', scheduleMeasurement)
    window.addEventListener('scroll', scheduleMeasurement, true)
    return () => {
      window.removeEventListener('resize', scheduleMeasurement)
      window.removeEventListener('scroll', scheduleMeasurement, true)
      if (measurementFrameRef.current != null) {
        cancelAnimationFrame(measurementFrameRef.current)
        measurementFrameRef.current = null
      }
      if (versionFrameRef.current != null) {
        cancelAnimationFrame(versionFrameRef.current)
        versionFrameRef.current = null
      }
      resizeObserverRef.current?.disconnect()
      resizeObserverRef.current = null
      observedElements.clear()
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
        if (geometryRef.current.delete(id)) scheduleVersion()
      }
    },
    [scheduleMeasurement, scheduleVersion]
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
