import assert from 'node:assert/strict'
import test from 'node:test'
import { calculateCanvasCentering } from '../lib/layout/canvas-centering.ts'

test('fitting canvases use zero-offset safe centering', () => {
  assert.deepEqual(calculateCanvasCentering({
    renderedWidth: 800,
    renderedHeight: 600,
    availableWidth: 1000,
    availableHeight: 700,
  }), {
    overflows: false,
    scrollLeft: 0,
    scrollTop: 0,
  })
})

test('residual layout overflow is centered on each overflowing axis', () => {
  assert.deepEqual(calculateCanvasCentering({
    renderedWidth: 1200,
    renderedHeight: 650,
    availableWidth: 1000,
    availableHeight: 700,
  }), {
    overflows: true,
    scrollLeft: 100,
    scrollTop: 0,
  })
})

test('subpixel geometry differences do not count as overflow', () => {
  assert.deepEqual(calculateCanvasCentering({
    renderedWidth: 1000.75,
    renderedHeight: 700.5,
    availableWidth: 1000,
    availableHeight: 700,
  }), {
    overflows: false,
    scrollLeft: 0,
    scrollTop: 0,
  })
})
