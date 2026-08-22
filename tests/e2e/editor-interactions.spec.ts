import { expect, test, type Page } from 'playwright/test'

async function openFreshDocument(page: Page) {
  const id = `e2e-${Date.now()}-${Math.random().toString(16).slice(2)}`
  await page.goto('/')
  await page.evaluate((docId) => {
    const now = Date.now()
    localStorage.setItem(
      'scripture:documents',
      JSON.stringify([
        {
          id: docId,
          name: 'Interaction test',
          createdAt: now,
          updatedAt: now,
          pageIds: [docId],
        },
      ])
    )
  }, id)
  await page.goto(`/doc/${id}`)
  await expect(page.getByRole('complementary', { name: 'Pages and layers' })).toBeVisible()
  return id
}

test('Pages panel adds, confirms, and cleans up a page', async ({ page }) => {
  await openFreshDocument(page)
  await page.getByRole('button', { name: 'Add page' }).click()
  await expect(page.getByRole('button', { name: 'Page 2' })).toBeVisible()

  await page.getByRole('button', { name: 'Delete page 2' }).click()
  await expect(page.getByRole('alertdialog')).toContainText('Delete this page?')
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByRole('button', { name: 'Page 2' })).toBeVisible()

  await page.getByRole('button', { name: 'Delete page 2' }).click()
  await page.getByRole('button', { name: 'Delete page' }).click()
  await expect(page.getByRole('button', { name: 'Page 2' })).toHaveCount(0)
})

test('Layers selection, rename, duplicate, and delete stay synchronized', async ({ page }) => {
  await openFreshDocument(page)
  await page.getByRole('button', { name: 'Add code block' }).click()
  await page.keyboard.press('Escape')

  const layerItems = page.getByRole('treeitem')
  await expect(layerItems).toHaveCount(2)
  const codeLabel = layerItems.nth(1).getByRole('button').last()
  await codeLabel.dblclick()
  const nameInput = layerItems.nth(1).getByRole('textbox')
  await nameInput.fill('Hero snippet')
  await nameInput.press('Enter')
  await expect(layerItems.nth(1)).toContainText('Hero snippet')

  await page.keyboard.press('Control+d')
  await expect(layerItems).toHaveCount(3)
  await page.keyboard.press('Delete')
  await expect(layerItems).toHaveCount(2)
})

test('zoom controls and keyboard zoom shortcuts update the canvas scale', async ({ page }) => {
  await openFreshDocument(page)
  const percent = page.locator('.scripture-zoom-percent')
  await expect(percent).toContainText(/\d+(?:\.\d+)?%/)
  await percent.click()
  await page.getByRole('option', { name: '100%' }).click()
  await expect(percent).toHaveText('100%')
  await page.getByRole('button', { name: 'Zoom in' }).click()
  await expect(percent).toHaveText('105%')
  await page.getByRole('button', { name: 'Zoom out' }).click()
  await expect(percent).toHaveText('100%')
  await page.keyboard.press('Control+-')
  await expect(percent).toHaveText('95%')
  await page.keyboard.press('Control+0')
  await expect(percent).toHaveText('100%')
})

test('trackpad and button zoom preserve their respective anchor points', async ({ page }) => {
  await openFreshDocument(page)
  const percent = page.locator('.scripture-zoom-percent')
  await percent.click()
  await page.getByRole('option', { name: '200%' }).click()
  await expect(percent).toHaveText('200%')

  const readCanvasPointAtViewportCenter = () =>
    page.evaluate(() => {
      const area = document.querySelector('.scripture-canvas-area')
      const scaleBox = document.querySelector('.scripture-canvas-scale-box')
      const viewport = document.querySelector('.scripture-canvas-viewport')
      if (!(area instanceof HTMLElement) || !(scaleBox instanceof HTMLElement) || !(viewport instanceof HTMLElement)) {
        throw new Error('Canvas did not mount')
      }
      const areaRect = area.getBoundingClientRect()
      const boxRect = scaleBox.getBoundingClientRect()
      const zoom = new DOMMatrix(getComputedStyle(viewport).transform).a
      return {
        x: (areaRect.left + area.clientLeft + area.clientWidth / 2 - boxRect.left) / zoom,
        y: (areaRect.top + area.clientTop + area.clientHeight / 2 - boxRect.top) / zoom,
      }
    })

  const centerPointBeforeButtonZoom = await readCanvasPointAtViewportCenter()
  await page.getByRole('button', { name: 'Zoom out' }).click()
  await expect(percent).toHaveText('190%')
  const centerPointAfterButtonZoom = await readCanvasPointAtViewportCenter()
  expect(Math.abs(centerPointAfterButtonZoom.x - centerPointBeforeButtonZoom.x)).toBeLessThan(0.01)
  expect(Math.abs(centerPointAfterButtonZoom.y - centerPointBeforeButtonZoom.y)).toBeLessThan(0.01)

  await percent.click()
  await page.getByRole('option', { name: '200%' }).click()
  await expect(percent).toHaveText('200%')

  const maxAnchorError = await page.evaluate(async () => {
    const area = document.querySelector('.scripture-canvas-area')
    const scaleBox = document.querySelector('.scripture-canvas-scale-box')
    const viewport = document.querySelector('.scripture-canvas-viewport')
    if (!(area instanceof HTMLElement) || !(scaleBox instanceof HTMLElement) || !(viewport instanceof HTMLElement)) {
      throw new Error('Canvas did not mount')
    }

    const readZoom = () => new DOMMatrix(getComputedStyle(viewport).transform).a
    const areaRect = area.getBoundingClientRect()
    const boxRect = scaleBox.getBoundingClientRect()
    const cursor = {
      x: areaRect.left + areaRect.width * 0.58,
      y: areaRect.top + areaRect.height * 0.46,
    }
    const initialZoom = readZoom()
    const canvasPoint = {
      x: (cursor.x - boxRect.left) / initialZoom,
      y: (cursor.y - boxRect.top) / initialZoom,
    }
    let maxError = 0

    for (let index = 0; index < 20; index += 1) {
      area.dispatchEvent(
        new WheelEvent('wheel', {
          bubbles: true,
          cancelable: true,
          ctrlKey: true,
          clientX: cursor.x,
          clientY: cursor.y,
          deltaY: 0.5,
          deltaMode: WheelEvent.DOM_DELTA_PIXEL,
        })
      )
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))

      const nextRect = scaleBox.getBoundingClientRect()
      const nextZoom = readZoom()
      maxError = Math.max(
        maxError,
        Math.abs(nextRect.left + canvasPoint.x * nextZoom - cursor.x),
        Math.abs(nextRect.top + canvasPoint.y * nextZoom - cursor.y)
      )
    }

    return maxError
  })

  expect(maxAnchorError).toBeLessThan(1)
})

test('trackpad zoom stays anchored at the right scroll boundary', async ({ page }) => {
  await openFreshDocument(page)
  const percent = page.locator('.scripture-zoom-percent')
  await percent.click()
  await page.getByRole('option', { name: '200%' }).click()
  await expect(percent).toHaveText('200%')

  const result = await page.evaluate(async () => {
    const area = document.querySelector('.scripture-canvas-area')
    const scaleBox = document.querySelector('.scripture-canvas-scale-box')
    const viewport = document.querySelector('.scripture-canvas-viewport')
    if (!(area instanceof HTMLElement) || !(scaleBox instanceof HTMLElement) || !(viewport instanceof HTMLElement)) {
      throw new Error('Canvas did not mount')
    }

    const nextLayout = () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    const readZoom = () => new DOMMatrix(getComputedStyle(viewport).transform).a
    area.scrollLeft = area.scrollWidth
    await nextLayout()

    const areaRect = area.getBoundingClientRect()
    const boxRect = scaleBox.getBoundingClientRect()
    const cursor = {
      x: areaRect.left + areaRect.width * 0.87,
      y: areaRect.top + areaRect.height * 0.48,
    }
    const initialZoom = readZoom()
    const canvasPoint = {
      x: (cursor.x - boxRect.left) / initialZoom,
      y: (cursor.y - boxRect.top) / initialZoom,
    }
    let maxAnchorError = 0
    let maxLayoutWidthError = 0

    for (let index = 0; index < 24; index += 1) {
      area.dispatchEvent(
        new WheelEvent('wheel', {
          bubbles: true,
          cancelable: true,
          ctrlKey: true,
          clientX: cursor.x,
          clientY: cursor.y,
          deltaY: 0.8,
          deltaMode: WheelEvent.DOM_DELTA_PIXEL,
        })
      )
      await nextLayout()

      const nextRect = scaleBox.getBoundingClientRect()
      const nextZoom = readZoom()
      maxAnchorError = Math.max(
        maxAnchorError,
        Math.abs(nextRect.left + canvasPoint.x * nextZoom - cursor.x),
        Math.abs(nextRect.top + canvasPoint.y * nextZoom - cursor.y)
      )
      maxLayoutWidthError = Math.max(maxLayoutWidthError, Math.abs(nextRect.width - parseFloat(scaleBox.style.width)))
    }

    return { maxAnchorError, maxLayoutWidthError }
  })

  expect(result.maxAnchorError).toBeLessThan(1)
  expect(result.maxLayoutWidthError).toBeLessThan(1)
})

test('a free-form code block can be re-entered after switching syntax theme', async ({ page }) => {
  await openFreshDocument(page)
  await page.getByRole('radio', { name: 'Free-form' }).check()
  await page.getByRole('button', { name: 'Add code block' }).click()

  const codeBlock = page.locator('.scripture-code-leaf')
  const liveEditor = codeBlock.locator('[contenteditable="true"]')
  await expect(liveEditor).toBeFocused()
  await page.keyboard.type('const answer = 42')
  await page.keyboard.press('Escape')
  await expect(liveEditor).toHaveCount(0)

  await page.getByRole('button', { name: 'nord' }).click()
  await expect(codeBlock).toHaveCSS('background-color', 'rgb(46, 52, 64)')
  await codeBlock.locator('code').dblclick()

  const reenteredEditor = codeBlock.locator('[contenteditable="true"]')
  await expect(reenteredEditor).toBeFocused()
  await page.keyboard.type('\nconst next = answer + 1')
  await expect(reenteredEditor).toContainText('const next = answer + 1')
})

test('an out-of-view selection stays beneath the docked editor chrome', async ({ page }) => {
  await openFreshDocument(page)
  await page.locator('.scripture-canvas-toolbar').getByRole('button', { name: 'Add code block' }).click()
  await page.keyboard.press('Escape')

  const block = page.locator('.scripture-code-leaf')
  const layersPanel = page.getByRole('complementary', { name: 'Pages and layers' })
  const [blockBox, panelBox] = await Promise.all([block.boundingBox(), layersPanel.boundingBox()])
  expect(blockBox).not.toBeNull()
  expect(panelBox).not.toBeNull()
  if (!blockBox || !panelBox) return

  await page.mouse.move(blockBox.x + blockBox.width / 2, blockBox.y + blockBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(panelBox.x + panelBox.width / 2, blockBox.y + blockBox.height / 2, { steps: 8 })
  await page.mouse.up()

  const outline = page.locator('.scripture-selection-outline')
  await expect(outline).toHaveClass(/is-clipped/)
  const outlineBox = await outline.boundingBox()
  expect(outlineBox).not.toBeNull()
  if (!outlineBox) return

  const overlap = {
    left: Math.max(outlineBox.x, panelBox.x),
    right: Math.min(outlineBox.x + outlineBox.width, panelBox.x + panelBox.width),
    top: Math.max(outlineBox.y, panelBox.y),
    bottom: Math.min(outlineBox.y + outlineBox.height, panelBox.y + panelBox.height),
  }
  expect(overlap.right).toBeGreaterThan(overlap.left)
  expect(overlap.bottom).toBeGreaterThan(overlap.top)

  const panelOwnsOverlap = await page.evaluate(({ x, y }) => {
    const panel = document.querySelector('.scripture-layers-panel')
    const topmost = document.elementFromPoint(x, y)
    return Boolean(panel && topmost && panel.contains(topmost))
  }, {
    x: (overlap.left + overlap.right) / 2,
    y: (overlap.top + overlap.bottom) / 2,
  })
  expect(panelOwnsOverlap).toBe(true)
})

test('device fonts can be granted, searched, and applied to text', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'queryLocalFonts', {
      configurable: true,
      value: async () => [
        {
          family: 'Studio Sans',
          fullName: 'Studio Sans Regular',
          postscriptName: 'StudioSans-Regular',
          style: 'Regular',
        },
        {
          family: 'Studio Sans',
          fullName: 'Studio Sans Bold',
          postscriptName: 'StudioSans-Bold',
          style: 'Bold',
        },
        {
          family: 'Workstation Serif',
          fullName: 'Workstation Serif',
          postscriptName: 'WorkstationSerif-Regular',
          style: 'Regular',
        },
      ],
    })
  })
  await openFreshDocument(page)
  await page.locator('.scripture-canvas-toolbar').getByRole('button', { name: 'Add text block' }).click()
  await page.keyboard.press('Escape')

  const fontPicker = page.locator('.scripture-inspector .scripture-font-picker-trigger')
  await fontPicker.click()
  await page.getByRole('button', { name: 'Use fonts from this device' }).click()

  await expect(page.locator('.scripture-font-picker-row[data-font-source="system"]')).toHaveCount(2)
  await page.getByRole('textbox', { name: 'Search fonts' }).fill('Studio Sans')
  const studioSans = page.locator(
    '.scripture-font-picker-row[data-font-source="system"][data-font-family="Studio Sans"]'
  )
  await expect(studioSans).toContainText('2 styles')
  await studioSans.click()

  await expect(fontPicker).toContainText('Studio Sans')
  const resolvedFont = await page.locator('.scripture-editor-wrapper').evaluate((element) =>
    element.style.getPropertyValue('--scripture-text-font')
  )
  expect(resolvedFont).toBe("'Studio Sans', var(--font-geist-sans), sans-serif")
})

test('inspector formatting targets the whole text block unless text is selected', async ({ page }) => {
  await openFreshDocument(page)
  await page.locator('.scripture-canvas-toolbar').getByRole('button', { name: 'Add text block' }).click()

  const editor = page.locator('.scripture-text-editor')
  await expect(editor).toBeFocused()
  await page.keyboard.type('Alpha Beta')

  const inspectorBold = page.locator('.scripture-inspector').getByRole('button', { name: 'Bold' })
  await inspectorBold.click()
  await expect(editor.locator('span[data-format]')).toHaveText('Alpha Beta')
  await expect(editor.locator('span[data-format]')).toHaveCSS('font-weight', '700')

  await expect(editor).toBeFocused()
  for (let index = 0; index < 4; index += 1) await page.keyboard.press('Shift+ArrowLeft')
  await inspectorBold.click()

  const formattedRuns = editor.locator('span[data-format]')
  await expect(formattedRuns).toHaveCount(2)
  await expect(formattedRuns.nth(0)).toHaveText('Alpha ')
  await expect(formattedRuns.nth(0)).toHaveCSS('font-weight', '700')
  await expect(formattedRuns.nth(1)).toHaveText('Beta')
  await expect(formattedRuns.nth(1)).toHaveCSS('font-weight', '400')
})

test('a selected free-form text block exposes formatting before text-editing', async ({ page }) => {
  await openFreshDocument(page)
  await page.getByRole('radio', { name: 'Free-form' }).check()
  await page.locator('.scripture-canvas-toolbar').getByRole('button', { name: 'Add text block' }).click()

  const editor = page.locator('.scripture-text-editor')
  await expect(editor).toBeFocused()
  await page.keyboard.type('Format without editing')
  await page.keyboard.press('Escape')

  await expect(editor).toHaveAttribute('contenteditable', 'false')
  await expect(page.getByRole('button', { name: 'Edit text to format' })).toHaveCount(0)
  await expect(page.getByText('Content formatting', { exact: true })).toHaveCount(0)

  const textSection = page.locator('.scripture-inspector-section').filter({
    has: page.getByRole('button', { name: 'Text block' }),
  })
  await expect(textSection.locator('label').first()).toHaveText('Paragraph')

  const inspectorBold = page.locator('.scripture-inspector').getByRole('button', { name: 'Bold' })
  await expect(inspectorBold).toBeVisible()
  await inspectorBold.click()
  await expect(editor.locator('span[data-format]')).toHaveText('Format without editing')
  await expect(editor.locator('span[data-format]')).toHaveCSS('font-weight', '700')
  await expect(editor).toHaveAttribute('contenteditable', 'false')
})
