# Playwright Azure Reporter

## How to integrate

```
npm install @alex-neo/playwright-azure-reporter
```

## Usage
You must register an ID already existing test cases from Azure DevOps before running tests.

**You need write testCaseId inside square brackets at the test name.**

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
You can use external file with Azure DevOps config values

```azure.config.json```
```json
{
  "token": "AZURE-TOKEN",
  "orgUrl": "https://dev.azure.com/alex-neo",
  "projectName": "SampleProject",
  "testPlanId": 4
}
```

Configure Playwright Azure Reporter with `playwright-azure-reporter` package.

```playwright.config.ts```
```typescript
import { PlaywrightTestConfig } from '@playwright/test'
import azureConfig from './azure.config.json'

const config: PlaywrightTestConfig = {
  testDir: './tests',
  timeout: 30 * 1000,
  reporter: [
    ['list'],
    [
      '@alex-neo/playwright-azure-reporter',
      {
        token: azureConfig.token,
        orgUrl: azureConfig.orgUrl,
        projectName: azureConfig.projectName,
        planId: azureConfig.testPlanId,
        environment: 'QA',
        testRunTitle: 'Playwright Test Run',
        uploadAttachments: true
        isDisabled: false,
      }
    ]
  ],
  use: {
    screenshot: 'only-on-failure',
  }

}

export default config

```

## Configuration

Reporter options (* - required):

- *`token` - Azure DevOps token, you can find more information [here](https://docs.microsoft.com/en-us/azure/devops/organizations/accounts/use-personal-access-tokens-to-authenticate?view=azure-devops&tabs=Windows)
- *`orgUrl` - Full url for your organization space. Example: `https://dev.azure.com/alex-neo`
- *`projectName` - Name of your project (also can be got from run URL). Example: `https://dev.azure.com/alex-neo/SampleProject/` - __SampleProject__
- *`planId` - Id of test plan. You can find it in test plan URL. Example: `https://dev.azure.com/alex-neo/SampleProject/_testPlans/execute?planId=4&suiteId=6` - __planId=4__
- `environment` - Any string that will be used as environment name. Will be used as prefix for all test runs. Default: `undefined`. Example: `QA`
- `logging` [true/false] - Enabled debug logging from reporter or not. Default: `true`.
- `uploadAttachments` [true/false] - Uploading attachments (screenshot/video) after test ended. Default: `false`.
- `isDisabled` [true/false] - Disable reporter. Default: `false`.
- `testRunTitle` - Title of test run. Default: `Playwright Test Run`.
