'use client'

import { useSyncExternalStore } from 'react'

export type BackgroundRemovalStatus = 'running' | 'success' | 'error'

export interface BackgroundRemovalState {
  nodeId: string
  status: BackgroundRemovalStatus
  label: string
  detail?: string
  progress: number | null
}

export interface BackgroundRemovalOperation extends BackgroundRemovalState {
  docId: string
}

const states = new Map<string, Map<string, BackgroundRemovalState>>()
const listeners = new Set<() => void>()
const EMPTY_OPERATIONS: readonly BackgroundRemovalOperation[] = []
let operationSnapshot: readonly BackgroundRemovalOperation[] = EMPTY_OPERATIONS

function rebuildSnapshot(): void {
  operationSnapshot = Array.from(states, ([docId, documentStates]) =>
    Array.from(documentStates.values(), (state) => ({ ...state, docId }))
  ).flat()
}

function emit(): void {
  for (const listener of listeners) listener()
}

export function getBackgroundRemovalState(docId: string, nodeId: string | null): BackgroundRemovalState | null {
  return nodeId ? (states.get(docId)?.get(nodeId) ?? null) : null
}

export function setBackgroundRemovalState(docId: string, state: BackgroundRemovalState): void {
  let documentStates = states.get(docId)
  if (!documentStates) {
    documentStates = new Map()
    states.set(docId, documentStates)
  }
  documentStates.set(state.nodeId, state)
  rebuildSnapshot()
  emit()
}

export function clearBackgroundRemovalState(docId: string, nodeId: string): void {
  const documentStates = states.get(docId)
  if (!documentStates?.delete(nodeId)) return
  if (documentStates.size === 0) states.delete(docId)
  rebuildSnapshot()
  emit()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useBackgroundRemovalState(docId: string, nodeId: string | null): BackgroundRemovalState | null {
  return useSyncExternalStore(
    subscribe,
    () => getBackgroundRemovalState(docId, nodeId),
    () => null
  )
}

export function useBackgroundRemovalOperations(): readonly BackgroundRemovalOperation[] {
  return useSyncExternalStore(subscribe, () => operationSnapshot, () => EMPTY_OPERATIONS)
}
