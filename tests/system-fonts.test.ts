import assert from 'node:assert/strict'
import test from 'node:test'
import { groupSystemFontFamilies } from '../lib/system-fonts.ts'

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
