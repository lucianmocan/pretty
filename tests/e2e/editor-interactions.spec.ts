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
  await percent.click()
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

test('a free-form code block can be re-entered after switching syntax theme', async ({ page }) => {
  await openFreshDocument(page)
  await page.getByRole('button', { name: 'Free-form' }).click()
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
