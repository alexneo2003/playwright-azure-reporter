# Playwright Azure Reporter

## How to integrate

```
npm install @alex_neo/playwright-azure-reporter
```

## Usage
You must register an ID already existing test cases from Azure DevOps before running tests.

> **You need write testCaseId wraped in square brackets at the test name.**

For example:

```typescript
describe('Test suite', () => {
  test('[1] First Test', () => {
    expect(true).toBe(true);
  })

  test('[3] Correct test', () => {
    expect(true).toBe(true);
  })

  test.skip('[4] Skipped test', () => {
    expect(true).toBe(true);
  })

  test('[6] Failed test', () => {
    expect(true).toBe(false);
  })
});

```

Configure Playwright Azure Reporter with `playwright-azure-reporter` package.

```playwright.config.ts```
```typescript
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
      '@alex_neo/playwright-azure-reporter',
      {
        orgUrl: "https://dev.azure.com/your-organization-name",
        token: "AZURE-TOKEN",
        planId: 44,
        projectName: "SampleSample",
        environment: 'AQA',
        testRunTitle: 'Playwright Test Run',
        uploadAttachments: true,
        attachmentsType: ['screenshot', 'video', 'trace'],
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

```

## Configuration

Reporter options (* - required):

- *`token` - Azure DevOps token, you can find more information [here](https://docs.microsoft.com/en-us/azure/devops/organizations/accounts/use-personal-access-tokens-to-authenticate?view=azure-devops&tabs=Windows)
- *`orgUrl` - Full url for your organization space. Example: `https://dev.azure.com/your-organization-name`

> Please note that some API's (e.g. ProfileApi) can't be hit at the org level, and has to be hit at the deployment level, so url should be structured like https://vssps.dev.azure.com/{yourorgname}
- *`projectName` - Name of your project (also can be got from run URL). Example: `https://dev.azure.com/alex-neo/SampleProject/` - __SampleProject__
- *`planId` - Id of test plan. You can find it in test plan URL. Example: `https://dev.azure.com/alex-neo/SampleProject/_testPlans/execute?planId=4&suiteId=6` - __planId=4__
- `environment` - Any string that will be used as environment name. Will be used as prefix for all test runs. Default: `undefined`. Example: `QA`
- `logging` [true/false] - Enabled debug logging from reporter or not. Default: `true`.
- `uploadAttachments` [true/false] - Uploading attachments (screenshot/video) after test ended. Default: `false`.
- `attachmentsType` - List of attachments types that will be uploaded. Default: `['screenshot']`.
- `isDisabled` [true/false] - Disable reporter. Default: `false`.
- `testRunTitle` - Title of test run using to create new test run. Default: `Playwright Test Run`.
