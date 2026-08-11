type BackgroundRemovalWorkerRequest = {
  id: string
  src: string
}

type BackgroundRemovalWorkerResponse =
  | { id: string; type: 'progress'; key: string; current: number; total: number }
  | { id: string; type: 'result'; buffer: ArrayBuffer; mimeType: string }
  | { id: string; type: 'error'; message: string }

const workerScope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<BackgroundRemovalWorkerRequest>) => void) | null
  postMessage: (message: BackgroundRemovalWorkerResponse, transfer?: Transferable[]) => void
}

async function processRequest({ id, src }: BackgroundRemovalWorkerRequest): Promise<void> {
  try {
    const sourceResponse = await fetch(src)
    if (!sourceResponse.ok) {
      throw new Error(`Could not read the image (${sourceResponse.status})`)
    }
    const source = await sourceResponse.blob()
    const { removeBackground } = await import('@imgly/background-removal')
    const result = await removeBackground(source, {
      model: 'isnet_quint8',
      progress(key, current, total) {
        workerScope.postMessage({ id, type: 'progress', key, current, total })
      },
    })
    const buffer = await result.arrayBuffer()
    workerScope.postMessage(
      { id, type: 'result', buffer, mimeType: result.type || 'image/png' },
      [buffer]
    )
  } catch (cause) {
    workerScope.postMessage({
      id,
      type: 'error',
      message: cause instanceof Error ? cause.message : 'Background removal failed.',
    })
  }
}

// Model inference is intentionally serialized inside the worker. Multiple
// requests can remain queued without competing for memory or blocking the UI.
let requestQueue = Promise.resolve()
workerScope.onmessage = (event) => {
  requestQueue = requestQueue.then(() => processRequest(event.data))
}
