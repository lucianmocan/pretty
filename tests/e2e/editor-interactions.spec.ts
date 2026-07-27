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
