import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('https://playwright.dev/')
})

test.describe('Describe', () => {
  test('[3] Should page opened', async ({ page }) => {
    await page.locator('text=Get started').click()
    await expect(page).toHaveTitle(/Getting started/)
  })
  test('[7] Should page closed', async ({ page }) => {
    await page.locator('text=Get started').click()
    await expect(page).toHaveTitle(/Getting started/)
  })
  test('[8] Awaiting for user input', async ({ page }) => {
    await page.locator('text=Get started').click()
    await expect(page).toHaveTitle(/Getting started/)
  })
})
