import assert from 'node:assert/strict'
import test from 'node:test'
import { embedSystemFontFaces, groupSystemFontFamilies } from '../lib/system-fonts.ts'

test('groups device font faces by family and sorts families and styles', () => {
  const grouped = groupSystemFontFamilies([
    { family: 'Zed Sans', fullName: 'Zed Sans Bold', postscriptName: 'ZedSans-Bold', style: 'Bold' },
    { family: 'Alpha Serif', fullName: 'Alpha Serif', postscriptName: 'AlphaSerif', style: 'Regular' },
    { family: 'Zed Sans', fullName: 'Zed Sans', postscriptName: 'ZedSans', style: 'Regular' },
    { family: 'Zed Sans', fullName: 'Zed Sans Bold', postscriptName: 'ZedSans-Bold', style: 'Bold' },
  ])

  assert.deepEqual(grouped, [
    { family: 'Alpha Serif', styles: ['Regular'] },
    { family: 'Zed Sans', styles: ['Bold', 'Regular'] },
  ])
})

test('embeds only requested device fonts with their real MIME type and caches the result', async () => {
  let queryCount = 0
  let blobCount = 0
  const previousWindow = globalThis.window
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      queryLocalFonts: async () => {
        queryCount += 1
        return [
          {
            family: 'Alpha Serif',
            fullName: 'Alpha Serif Bold Italic',
            postscriptName: 'AlphaSerif-BoldItalic',
            style: 'Bold Italic',
            blob: async () => {
              blobCount += 1
              return new Blob([new Uint8Array([0, 1, 2, 3])], { type: 'font/otf' })
            },
          },
          {
            family: 'Unused Sans',
            fullName: 'Unused Sans',
            postscriptName: 'UnusedSans-Regular',
            style: 'Regular',
            blob: async () => {
              throw new Error('An unrequested family must not be read')
            },
          },
        ]
      },
    },
  })

  try {
    const first = await embedSystemFontFaces(['Alpha Serif'])
    const second = await embedSystemFontFaces(['Alpha Serif'])

    assert.equal(second, first)
    assert.match(first ?? '', /font-family: 'Alpha Serif'/)
    assert.match(first ?? '', /font-weight: 700/)
    assert.match(first ?? '', /font-style: italic/)
    assert.match(first ?? '', /data:font\/otf;base64,AAECAw==/)
    assert.doesNotMatch(first ?? '', /Unused Sans/)
    assert.equal(queryCount, 1)
    assert.equal(blobCount, 1)
  } finally {
    if (previousWindow === undefined) delete (globalThis as { window?: Window }).window
    else Object.defineProperty(globalThis, 'window', { configurable: true, value: previousWindow })
  }
})
