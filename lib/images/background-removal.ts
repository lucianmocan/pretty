/** Client-side bridge to the dedicated background-removal worker. Model
 * loading, image decoding, ONNX inference, masking, and encoding all stay
 * off the main thread so the editor remains interactive. */

export type BackgroundRemovalProgress = (label: string, current: number, total: number) => void

type WorkerResponse =
  | { id: string; type: 'progress'; key: string; current: number; total: number }
  | { id: string; type: 'result'; buffer: ArrayBuffer; mimeType: string }
  | { id: string; type: 'error'; message: string }

interface PendingRemoval {
  resolve: (blob: Blob) => void
  reject: (cause: Error) => void
  onProgress?: BackgroundRemovalProgress
}

let worker: Worker | null = null
const pending = new Map<string, PendingRemoval>()

function failPending(cause: Error): void {
  for (const request of pending.values()) request.reject(cause)
  pending.clear()
  worker?.terminate()
  worker = null
}

function backgroundRemovalWorker(): Worker {
  if (worker) return worker
  worker = new Worker(new URL('./background-removal.worker.ts', import.meta.url), {
    type: 'module',
    name: 'scripture-background-removal',
  })
  worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const message = event.data
    const request = pending.get(message.id)
    if (!request) return
    if (message.type === 'progress') {
      request.onProgress?.(message.key, message.current, message.total)
      return
    }
    pending.delete(message.id)
    if (message.type === 'error') {
      request.reject(new Error(message.message))
      return
    }
    request.resolve(new Blob([message.buffer], { type: message.mimeType }))
  }
  worker.onerror = () => failPending(new Error('The background-removal worker stopped unexpectedly.'))
  worker.onmessageerror = () => failPending(new Error('The background-removal worker returned an invalid result.'))
  return worker
}

export async function removeImageBackground(src: string, onProgress?: BackgroundRemovalProgress): Promise<Blob> {
  const id = crypto.randomUUID()
  return new Promise<Blob>((resolve, reject) => {
    pending.set(id, { resolve, reject, onProgress })
    try {
      backgroundRemovalWorker().postMessage({ id, src })
    } catch (cause) {
      pending.delete(id)
      reject(cause instanceof Error ? cause : new Error('Could not start background removal.'))
    }
  })
}
