import { expect, test } from '@playwright/test'

test('active movement count follows station selection and release', async ({ page }) => {
  await page.goto('./')
  await expect(page.locator('canvas').first()).toBeVisible()
  await page.waitForLoadState('networkidle')
  const pause = page.getByRole('button', { name: /^Pause$/ })
  if (await pause.isVisible()) await pause.click()
  const count = page.locator('.active-count').first()
  const readCount = async () => Number((await count.innerText()).replace(/[^0-9]/g, ''))
  const total = await readCount()
  expect(total).toBeGreaterThan(0)
  await page.getByRole('searchbox').fill('Northwest')
  await page.locator('.station-list button').first().click()
  await expect.poll(readCount).toBeLessThan(total)
  expect(await readCount()).toBeGreaterThan(0)
  await page.getByRole('button', { name: 'Clear station selection', exact: true }).click()
  await expect.poll(readCount).toBe(total)
})
