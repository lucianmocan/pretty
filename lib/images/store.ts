import { mkdir, readFile, writeFile, unlink, readdir } from 'fs/promises'
import path from 'path'

const IMAGES_DIR = path.join(process.cwd(), '.data', 'images')

// Same filesystem-bridge pattern as lib/documents/store.ts: the live browser
// session and Playwright's separate headless context both need to read the
// same bytes, and this is a personal, single-user local tool, so plain
// filesystem storage (not a database) is the right amount of infrastructure.
function assertValidId(id: string) {
  if (!/^[a-zA-Z0-9-]+$/.test(id)) throw new Error('Invalid image id')
}

function assertValidExt(ext: string) {
  if (!/^[a-z0-9]+$/.test(ext)) throw new Error('Invalid image extension')
}

export async function writeImageBytes(id: string, ext: string, bytes: Buffer): Promise<void> {
  assertValidId(id)
  assertValidExt(ext)
  await mkdir(IMAGES_DIR, { recursive: true })
  await writeFile(path.join(IMAGES_DIR, `${id}.${ext}`), bytes)
}

// The id alone doesn't carry its extension (the API route's URL is just
// /api/images/{id}), so this looks up whichever file starts with that id --
// there's always at most one, since writeImageBytes is only ever called once
// per freshly-generated id.
export async function readImageBytes(id: string): Promise<{ bytes: Buffer; ext: string } | null> {
  assertValidId(id)
  const filename = await findFile(id)
  if (!filename) return null
  const bytes = await readFile(path.join(IMAGES_DIR, filename))
  return { bytes, ext: filename.split('.').pop() ?? '' }
}

export async function deleteImageBytes(id: string): Promise<void> {
  assertValidId(id)
  const filename = await findFile(id)
  if (!filename) return
  try {
    await unlink(path.join(IMAGES_DIR, filename))
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
  }
}

async function findFile(id: string): Promise<string | null> {
  let entries: string[]
  try {
    entries = await readdir(IMAGES_DIR)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
  return entries.find((f) => f.startsWith(`${id}.`)) ?? null
}
