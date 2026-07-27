import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_APP_THEME,
  DEFAULT_EXPORT_MARGIN,
  exportRasterScale,
  normalizeAppTheme,
  normalizeExportMargin,
  normalizeExportQuality,
  normalizeMotionPreference,
  normalizeUiDensity,
} from '../lib/app-preferences.ts'

test('normalizes appearance preferences', () => {
  assert.equal(normalizeAppTheme('system'), 'system')
  assert.equal(normalizeAppTheme('unknown'), DEFAULT_APP_THEME)
  assert.equal(normalizeUiDensity('compact'), 'compact')
  assert.equal(normalizeUiDensity('tiny'), 'comfortable')
  assert.equal(normalizeMotionPreference('reduced'), 'reduced')
})

test('normalizes export preferences', () => {
  assert.equal(normalizeExportQuality('maximum'), 'maximum')
  assert.equal(normalizeExportQuality('huge'), 'standard')
  assert.equal(normalizeExportMargin('64'), 64)
  assert.equal(normalizeExportMargin(12), 12)
  assert.equal(normalizeExportMargin(512), 512)
  assert.equal(normalizeExportMargin(-1), DEFAULT_EXPORT_MARGIN)
  assert.equal(normalizeExportMargin(513), DEFAULT_EXPORT_MARGIN)
  assert.equal(normalizeExportMargin(12.5), DEFAULT_EXPORT_MARGIN)
  assert.equal(normalizeExportMargin(null), DEFAULT_EXPORT_MARGIN)
  assert.equal(normalizeExportMargin(''), DEFAULT_EXPORT_MARGIN)
})

test('preserves existing standard raster quality per format', () => {
  assert.equal(exportRasterScale('png', 'standard'), 1)
  assert.equal(exportRasterScale('pdf', 'standard'), 2)
  assert.equal(exportRasterScale('png', 'high'), 2)
  assert.equal(exportRasterScale('pdf', 'high'), 2.5)
  assert.equal(exportRasterScale('pdf', 'maximum'), 3)
})
