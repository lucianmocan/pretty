import assert from 'node:assert/strict'
import test from 'node:test'
import { resizeGeometry } from '../lib/layout/resize-geometry.ts'

test('east resize changes width without freezing auto height', () => {
  assert.deepEqual(
    resizeGeometry({
      axis: 'e',
      startSize: { width: 200, height: 100 },
      delta: { x: 25, y: 80 },
      trackPosition: false,
    }),
    { size: { width: 225 }, position: undefined }
  )
})

test('south resize changes height without freezing auto width', () => {
  assert.deepEqual(
    resizeGeometry({
      axis: 's',
      startSize: { width: 200, height: 100 },
      delta: { x: 80, y: 25 },
      trackPosition: false,
    }),
    { size: { height: 125 }, position: undefined }
  )
})

test('north-west canvas resize preserves the opposite edges', () => {
  assert.deepEqual(
    resizeGeometry({
      axis: 'nw',
      startSize: { width: 200, height: 100 },
      startPosition: { x: 50, y: 30 },
      delta: { x: -20, y: -10 },
      trackPosition: true,
    }),
    {
      size: { width: 220, height: 110 },
      position: { x: 30, y: 20 },
    }
  )
})

test('north-west canvas resize clamps at the parent origin', () => {
  assert.deepEqual(
    resizeGeometry({
      axis: 'nw',
      startSize: { width: 200, height: 100 },
      startPosition: { x: 10, y: 5 },
      delta: { x: -100, y: -100 },
      trackPosition: true,
    }),
    {
      size: { width: 210, height: 105 },
      position: { x: 0, y: 0 },
    }
  )
})

test('minimum size keeps the far edge anchored', () => {
  assert.deepEqual(
    resizeGeometry({
      axis: 'w',
      startSize: { width: 100, height: 80 },
      startPosition: { x: 40, y: 20 },
      delta: { x: 200, y: 0 },
      trackPosition: true,
    }),
    {
      size: { width: 32 },
      position: { x: 108 },
    }
  )
})
