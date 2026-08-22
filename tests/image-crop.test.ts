import assert from 'node:assert/strict'
import test from 'node:test'
import {
  croppedImageAspectRatio,
  croppedImageFrameSize,
  imageSourceDimensions,
  normalizeImageCrop,
} from '../lib/layout/image-crop.ts'

test('normalizes invalid persisted crop coordinates before rendering', () => {
  assert.deepEqual(
    normalizeImageCrop({ cropX: -3, cropY: Number.NaN, cropWidth: 0, cropHeight: 4 }),
    { cropX: 0, cropY: 0, cropWidth: 0.0001, cropHeight: 1 }
  )
})

test('calculates the visible crop ratio instead of the full image ratio', () => {
  assert.equal(
    croppedImageAspectRatio({
      naturalWidth: 1200,
      naturalHeight: 800,
      crop: { cropX: 0.25, cropY: 0, cropWidth: 0.5, cropHeight: 1 },
    }),
    0.75
  )
})

test('sizes a high-resolution crop from rendered CSS pixels', () => {
  const crop = normalizeImageCrop({ cropX: 0.25, cropY: 0.25, cropWidth: 0.5, cropHeight: 0.5 })
  assert.deepEqual(
    croppedImageFrameSize({
      renderedWidth: 600,
      renderedHeight: 400,
      naturalWidth: 6000,
      naturalHeight: 4000,
      crop,
    }),
    { width: 300, height: 200 }
  )
})

test('recovers the source aspect ratio for legacy cropped images', () => {
  const crop = normalizeImageCrop({ cropX: 0, cropY: 0, cropWidth: 0.5, cropHeight: 0.25 })
  assert.deepEqual(
    imageSourceDimensions({ frameWidth: 400, frameHeight: 100, crop }),
    { width: 2, height: 1 }
  )
})

test('prefers persisted intrinsic dimensions for crop rendering', () => {
  const crop = normalizeImageCrop({ cropX: 0, cropY: 0, cropWidth: 0.5, cropHeight: 0.5 })
  assert.deepEqual(
    imageSourceDimensions({
      intrinsicWidth: 6000,
      intrinsicHeight: 4000,
      frameWidth: 200,
      frameHeight: 200,
      crop,
    }),
    { width: 6000, height: 4000 }
  )
})
