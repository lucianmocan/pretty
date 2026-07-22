import { mkdir, readFile, writeFile, unlink } from 'fs/promises'
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
  await writeFile(docPath(id), bytes)
}

export async function readDocumentBytes(id: string): Promise<Uint8Array | null> {
  try {
    const buf = await readFile(docPath(id))
    return new Uint8Array(buf)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
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
