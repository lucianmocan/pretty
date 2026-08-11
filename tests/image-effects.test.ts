import assert from 'node:assert/strict'
import test from 'node:test'
import { imageEffectStyles, normalizeImageEffects } from '../lib/layout/image-effects.ts'

test('image adjustments default to a visually neutral state', () => {
  assert.deepEqual(normalizeImageEffects({}), {
    opacity: 100,
    brightness: 100,
    contrast: 100,
    saturation: 100,
    hue: 0,
    grayscale: 0,
    blur: 0,
  })
  assert.deepEqual(imageEffectStyles({}), { frame: {}, image: {} })
})

test('image adjustments produce non-destructive CSS shared by canvas and export', () => {
  assert.deepEqual(
    imageEffectStyles({
      opacity: 45,
      brightness: 120,
      contrast: 90,
      saturation: 140,
      hue: -20,
      grayscale: 15,
      blur: 2.5,
    }),
    {
      frame: { opacity: 0.45 },
      image: {
        filter: 'brightness(120%) contrast(90%) saturate(140%) hue-rotate(-20deg) grayscale(15%) blur(2.5px)',
      },
    }
  )
})

test('invalid image adjustments are clamped before reaching CSS', () => {
  assert.deepEqual(normalizeImageEffects({ opacity: -5, brightness: 900, hue: Number.NaN, blur: 40 }), {
    opacity: 0,
    brightness: 200,
    contrast: 100,
    saturation: 100,
    hue: 0,
    grayscale: 0,
    blur: 20,
  })
})
