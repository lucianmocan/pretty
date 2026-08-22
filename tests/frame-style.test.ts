import assert from 'node:assert/strict'
import test from 'node:test'
import {
  contentOverflowStyle,
  frameInnerStyle,
} from '../lib/layout/frame-style.ts'
import type { LayoutNode } from '../lib/layout/types.ts'

function node(overrides: Partial<LayoutNode> = {}): LayoutNode {
  return { id: 'node', kind: 'text', ...overrides }
}

test('resized interactive leaves scroll while export copies clip', () => {
  const resized = node({ width: 240, height: 120 })

  assert.equal(contentOverflowStyle(resized).overflow, 'auto')
  assert.equal(contentOverflowStyle(resized, 'clip').overflow, 'hidden')
})

test('resized flex frames clip only in export copies', () => {
  const resized = node({ kind: 'frame', width: 320, childLayout: 'flex' })

  assert.equal(frameInnerStyle(resized).overflow, 'auto')
  assert.equal(frameInnerStyle(resized, 'clip').overflow, 'hidden')
})

test('canvas frames always clip children at their authored bounds', () => {
  const canvas = node({ kind: 'frame', childLayout: 'canvas' })

  assert.equal(frameInnerStyle(canvas).overflow, 'hidden')
  assert.equal(frameInnerStyle(canvas, 'clip').overflow, 'hidden')
})
