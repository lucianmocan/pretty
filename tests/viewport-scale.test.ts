import assert from 'node:assert/strict'
import test from 'node:test'
import { calculateViewportScale } from '../lib/viewport-scale.ts'

test('keeps ordinary viewports at the authored UI scale', () => {
  assert.equal(calculateViewportScale(1440, 960), 1)
  assert.equal(calculateViewportScale(1280, 800), 1)
})

test('scales the whole UI against both large viewport dimensions', () => {
  assert.equal(calculateViewportScale(1920, 1080), 1.2)
  assert.equal(calculateViewportScale(2560, 1440), 1.6)
  assert.equal(calculateViewportScale(3840, 2160), 2)
  assert.equal(calculateViewportScale(3440, 1440), 1.6)
})

test('caps extreme outscaling and rejects invalid viewport measurements', () => {
  assert.equal(calculateViewportScale(7680, 4320), 2)
  assert.equal(calculateViewportScale(0, 1080), 1)
})
