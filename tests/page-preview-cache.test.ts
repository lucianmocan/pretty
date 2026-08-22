import assert from 'node:assert/strict'
import test from 'node:test'
import {
  clearPagePreview,
  peekPagePreview,
  savePagePreview,
  type PagePreviewSnapshot,
} from '../lib/documents/preview.ts'

function preview(pageId: string, variant = 'default'): PagePreviewSnapshot {
  return {
    pageId,
    variant,
    html: '<div id="canvas-root">Preview</div>',
    pageWidth: 640,
    pageHeight: 480,
  }
}

test('saved page previews are synchronously available for page-switch handoff', async () => {
  const snapshot = preview('memory-preview-page')
  await savePagePreview(snapshot)
  const cached = peekPagePreview(snapshot.pageId, snapshot.variant)
  assert.ok(cached)
  assert.equal(cached.pageId, snapshot.pageId)
  assert.equal(cached.variant, snapshot.variant)
  assert.equal(cached.html, snapshot.html)
  assert.equal(cached.pageWidth, snapshot.pageWidth)
  assert.equal(cached.pageHeight, snapshot.pageHeight)

  await clearPagePreview(snapshot.pageId)
  assert.equal(peekPagePreview(snapshot.pageId, snapshot.variant), null)
})

test('the synchronous preview cache rejects stale variants', async () => {
  const snapshot = preview('variant-preview-page', 'page-number-1')
  await savePagePreview(snapshot)
  assert.equal(peekPagePreview(snapshot.pageId, 'page-number-2'), null)
  await clearPagePreview(snapshot.pageId)
})
