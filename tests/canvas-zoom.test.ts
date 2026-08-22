import assert from 'node:assert/strict'
import test from 'node:test'
import {
  MIN_CANVAS_ZOOM,
  clampCanvasZoom,
  formatCanvasZoom,
} from '../lib/layout/canvas-zoom.ts'

test('keeps the tiny positive zoom needed to fit an extremely large frame', () => {
  const requiredZoom = 800 / 100_000_000
  assert.equal(clampCanvasZoom(requiredZoom), requiredZoom)
})

test('prevents zero or negative scale factors from mirroring the canvas', () => {
  assert.equal(clampCanvasZoom(0), MIN_CANVAS_ZOOM)
  assert.equal(clampCanvasZoom(-1), MIN_CANVAS_ZOOM)
})

test('shows useful precision below one percent', () => {
  assert.equal(formatCanvasZoom(0.0095), '0.95%')
  assert.equal(formatCanvasZoom(0.00008), '0.008%')
  assert.equal(formatCanvasZoom(MIN_CANVAS_ZOOM), '<0.0001%')
})
