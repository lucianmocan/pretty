/** Raw IndexedDB-backed Blob store -- images never leave the browser. Plain
 * IndexedDB (no DOM APIs) so this is safe to import from a Worker too (see
 * background-removal.worker.ts), not just window contexts. */

const DB_NAME = 'scripture-images'
const DB_VERSION = 1
const STORE_NAME = 'images'

// References stored on a node's `src` look like `local:{uuid}` -- this
// prefix is what distinguishes a local reference from (historically) a
// server-hosted URL, and lets every caller detect/parse it the same way.
export const LOCAL_IMAGE_PREFIX = 'local:'

export function toLocalImageSrc(id: string): string {
  return `${LOCAL_IMAGE_PREFIX}${id}`
}

export function parseLocalImageSrc(src: string | undefined | null): string | null {
  if (!src || !src.startsWith(LOCAL_IMAGE_PREFIX)) return null
  return src.slice(LOCAL_IMAGE_PREFIX.length)
}

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)
      request.onupgradeneeded = () => {
        request.result.createObjectStore(STORE_NAME)
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }
  return dbPromise
}

export async function putImageBlob(id: string, blob: Blob): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put(blob, id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function getImageBlob(id: string): Promise<Blob | null> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const request = tx.objectStore(STORE_NAME).get(id)
    request.onsuccess = () => resolve((request.result as Blob | undefined) ?? null)
    request.onerror = () => reject(request.error)
  })
}

export async function deleteImageBlob(id: string): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}
