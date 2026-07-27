'use client'

import type {
  SyntaxPriority,
  TokenizeResult,
  TokenizeTheme,
  TokenizeWorkerRequest,
  TokenizeWorkerResponse,
} from './token-types'

interface PendingRequest {
  id: number
  message: TokenizeWorkerRequest
  priority: SyntaxPriority
  order: number
  cacheKey: string
  sourceLength: number
  resolve: (result: TokenizeResult) => void
  reject: (error: Error) => void
  cleanup: () => void
}

interface CachedResult {
  result: TokenizeResult
  sourceLength: number
}

const MAX_CACHE_ENTRIES = 64
const MAX_CACHED_SOURCE_CHARACTERS = 2_000_000
const priorityRank: Record<SyntaxPriority, number> = {
  focused: 0,
  visible: 1,
  background: 2,
}

let worker: Worker | null = null
let nextRequestId = 1
let nextOrder = 1
let activeRequestId: number | null = null
let immediatePumpScheduled = false
let idlePumpHandle: number | null = null
let idlePumpUsesCallback = false
let cachedSourceCharacters = 0
const pending = new Map<number, PendingRequest>()
const queue: PendingRequest[] = []
const resultCache = new Map<string, CachedResult>()

function abortError() {
  const error = new Error('Syntax tokenization was cancelled')
  error.name = 'AbortError'
  return error
}

function themeCacheKey(theme: TokenizeTheme): string {
  return typeof theme === 'string' ? theme : JSON.stringify(theme)
}

function resultCacheKey(code: string, language: string, theme: TokenizeTheme): string {
  return `${language}\0${themeCacheKey(theme)}\0${code}`
}

function readCachedResult(key: string): TokenizeResult | null {
  const cached = resultCache.get(key)
  if (!cached) return null
  resultCache.delete(key)
  resultCache.set(key, cached)
  return cached.result
}

function cacheResult(key: string, sourceLength: number, result: TokenizeResult) {
  const previous = resultCache.get(key)
  if (previous) cachedSourceCharacters -= previous.sourceLength
  resultCache.delete(key)
  resultCache.set(key, { result, sourceLength })
  cachedSourceCharacters += sourceLength

  while (
    resultCache.size > MAX_CACHE_ENTRIES ||
    cachedSourceCharacters > MAX_CACHED_SOURCE_CHARACTERS
  ) {
    const oldestKey = resultCache.keys().next().value as string | undefined
    if (!oldestKey) break
    const oldest = resultCache.get(oldestKey)
    if (oldest) cachedSourceCharacters -= oldest.sourceLength
    resultCache.delete(oldestKey)
  }
}

function rejectPending(error: Error) {
  for (const request of pending.values()) {
    request.cleanup()
    request.reject(error)
  }
  pending.clear()
  queue.length = 0
  activeRequestId = null
}

function getWorker(): Worker {
  if (worker) return worker
  if (typeof window === 'undefined') {
    throw new Error('The syntax tokenizer is only available in the browser')
  }

  worker = new Worker(new URL('./tokenize.worker.ts', import.meta.url), {
    type: 'module',
    name: 'scripture-syntax-tokenizer',
  })
  worker.onmessage = (event: MessageEvent<TokenizeWorkerResponse>) => {
    const request = pending.get(event.data.id)
    if (activeRequestId === event.data.id) activeRequestId = null
    if (!request) {
      schedulePump()
      return
    }

    pending.delete(event.data.id)
    request.cleanup()
    if ('error' in event.data) {
      request.reject(new Error(event.data.error))
    } else {
      cacheResult(request.cacheKey, request.sourceLength, event.data.result)
      request.resolve(event.data.result)
    }
    schedulePump()
  }
  worker.onerror = () => {
    rejectPending(new Error('The syntax tokenizer worker stopped unexpectedly'))
    worker?.terminate()
    worker = null
  }
  return worker
}

function cancelIdlePump() {
  if (idlePumpHandle === null) return
  const idleWindow = window as unknown as {
    cancelIdleCallback?: (handle: number) => void
  }
  if (idlePumpUsesCallback && idleWindow.cancelIdleCallback) {
    idleWindow.cancelIdleCallback(idlePumpHandle)
  } else {
    window.clearTimeout(idlePumpHandle)
  }
  idlePumpHandle = null
}

function takeNextRequest(): PendingRequest | null {
  queue.sort((left, right) =>
    priorityRank[left.priority] - priorityRank[right.priority] || left.order - right.order
  )
  return queue.shift() ?? null
}

function pump() {
  idlePumpHandle = null
  if (activeRequestId !== null) return
  const request = takeNextRequest()
  if (!request || !pending.has(request.id)) {
    if (queue.length) schedulePump()
    return
  }

  activeRequestId = request.id
  try {
    getWorker().postMessage(request.message)
  } catch (error) {
    activeRequestId = null
    pending.delete(request.id)
    request.cleanup()
    request.reject(error instanceof Error ? error : new Error('Could not start syntax tokenization'))
    schedulePump()
  }
}

function schedulePump() {
  if (activeRequestId !== null || queue.length === 0 || typeof window === 'undefined') return
  const hasImmediateWork = queue.some((request) => request.priority !== 'background')

  if (hasImmediateWork) {
    cancelIdlePump()
    if (immediatePumpScheduled) return
    immediatePumpScheduled = true
    queueMicrotask(() => {
      immediatePumpScheduled = false
      pump()
    })
    return
  }

  if (idlePumpHandle !== null) return
  const idleWindow = window as unknown as {
    requestIdleCallback?: (
      callback: IdleRequestCallback,
      options?: IdleRequestOptions
    ) => number
  }
  if (idleWindow.requestIdleCallback) {
    idlePumpUsesCallback = true
    idlePumpHandle = idleWindow.requestIdleCallback(() => pump(), { timeout: 750 })
  } else {
    idlePumpUsesCallback = false
    idlePumpHandle = window.setTimeout(() => pump(), 60)
  }
}

export function tokenizeCodeInWorker(
  code: string,
  language: string,
  theme: TokenizeTheme,
  options: { signal?: AbortSignal; priority?: SyntaxPriority } = {}
): Promise<TokenizeResult> {
  const { signal, priority = 'visible' } = options
  if (signal?.aborted) return Promise.reject(abortError())

  const cacheKey = resultCacheKey(code, language, theme)
  const cached = readCachedResult(cacheKey)
  if (cached) return Promise.resolve(cached)

  const id = nextRequestId++
  const message: TokenizeWorkerRequest = { type: 'tokenize', id, code, language, theme }

  return new Promise((resolve, reject) => {
    const onAbort = () => {
      const request = pending.get(id)
      if (!request) return
      pending.delete(id)
      const queuedIndex = queue.findIndex((candidate) => candidate.id === id)
      if (queuedIndex >= 0) queue.splice(queuedIndex, 1)
      if (activeRequestId === id) {
        activeRequestId = null
        try {
          worker?.postMessage({ type: 'cancel', id })
        } catch {
          // A worker failure rejects every request through its error handler.
        }
      }
      request.cleanup()
      request.reject(abortError())
      schedulePump()
    }
    const cleanup = () => signal?.removeEventListener('abort', onAbort)
    const request: PendingRequest = {
      id,
      message,
      priority,
      order: nextOrder++,
      cacheKey,
      sourceLength: code.length,
      resolve,
      reject,
      cleanup,
    }

    pending.set(id, request)
    queue.push(request)
    signal?.addEventListener('abort', onAbort, { once: true })
    schedulePump()
  })
}
