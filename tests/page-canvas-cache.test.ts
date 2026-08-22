import assert from 'node:assert/strict'
import test from 'node:test'
import { removePageCanvas, retainPageCanvas } from '../lib/page-canvas-cache.ts'

test('page canvas cache retains three most recently visited pages', () => {
  let pages: string[] = []
  pages = retainPageCanvas(pages, 'one')
  pages = retainPageCanvas(pages, 'two')
  pages = retainPageCanvas(pages, 'three')
  pages = retainPageCanvas(pages, 'four')
  assert.deepEqual(pages, ['two', 'three', 'four'])
})

test('revisiting a cached page promotes it without duplicating it', () => {
  assert.deepEqual(retainPageCanvas(['one', 'two', 'three'], 'one'), ['two', 'three', 'one'])
})

test('removed pages leave the cache', () => {
  assert.deepEqual(removePageCanvas(['one', 'two', 'three'], 'two'), ['one', 'three'])
})
