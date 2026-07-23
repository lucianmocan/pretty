import { mkdir, readFile, writeFile, unlink, rename } from 'fs/promises'
import path from 'path'

const DOCS_DIR = path.join(process.cwd(), '.data', 'documents')

// Bridges the interactive browser session and Playwright's separate headless
// Chromium context, which cannot see the editor's IndexedDB state -- see plan
// point 6. Plain filesystem storage: a personal, single-user local tool.
function docPath(id: string) {
  if (!/^[a-zA-Z0-9-]+$/.test(id)) throw new Error('Invalid document id')
  return path.join(DOCS_DIR, `${id}.bin`)
}

export async function writeDocumentBytes(id: string, bytes: Uint8Array) {
  await mkdir(DOCS_DIR, { recursive: true })
  const finalPath = docPath(id)
  // Write to a temp file then rename, not a direct write -- writeFile
  // truncates before writing, so a concurrent read (e.g. an export request
  // hitting the print route while a save is in flight) could otherwise
  // observe a partially-written, undecodable buffer. rename() within the
  // same directory is atomic on POSIX filesystems: a reader always sees
  // either the complete old file or the complete new one, never a partial
  // write. crypto.randomUUID() keeps concurrent writes to the SAME id from
  // colliding on the same temp filename.
  const tmpPath = path.join(DOCS_DIR, `${id}.bin.tmp-${crypto.randomUUID()}`)
  await writeFile(tmpPath, bytes)
  await rename(tmpPath, finalPath)
}

export async function readDocumentBytes(id: string): Promise<Uint8Array | null> {
  try {
    const buf = await readFile(docPath(id))
    return new Uint8Array(buf)
  } catch (err) {
    // Both a missing file AND a malformed id (docPath's own validation
    // throwing a plain Error, not a filesystem error) mean "no such
    // document" to every caller -- without treating them the same, a
    // malformed id previously surfaced as an uncaught 500 instead of the
    // clean 404 every caller already expects from a null return.
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    if (err instanceof Error && err.message === 'Invalid document id') return null
    throw err
  }
}

export async function deleteDocumentBytes(id: string): Promise<void> {
  try {
    await unlink(docPath(id))
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
  }
}
