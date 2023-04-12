import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: __dirname,
  testIgnore: ['assets/**'],
  timeout: 30000,
  forbidOnly: !!process.env.CI,
  workers: process.env.CI ? 2 : undefined,
  preserveOutput: process.env.CI ? 'failures-only' : 'always',
  fullyParallel: true,
  projects: [
    {
      name: 'playwright-azure-reporter-test'
    },
  ],
  reporter: process.env.CI ? [['dot']] : [['list']],
})
