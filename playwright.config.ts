import { PlaywrightTestConfig } from '@playwright/test'
import azureConfig from './azure.config.json'
import { AzureReporterOptions } from './src/playwright-azure-reporter'

/**
 * See https://playwright.dev/docs/test-configuration.
 */
const config: PlaywrightTestConfig = {
  testDir: './tests',
  timeout: 30 * 1000,
  expect: {
    timeout: 5000
  },
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['list'],
    [
      './src/playwright-azure-reporter.ts',
      {
        orgUrl: azureConfig.orgUrl,
        token: azureConfig.token,
        planId: azureConfig.testPlanId,
        projectName: azureConfig.projectName,
        environment: 'AQA',
        testRunTitle: 'Playwright Test Run',
        uploadAttachments: true,
        // attachmentsType: ['screenshot'],
      } as AzureReporterOptions
    ]
  ],
  use: {
    screenshot: 'only-on-failure',
    actionTimeout: 0,
    trace: 'on-first-retry'
  }
}

export default config
