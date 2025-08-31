# Playwright Azure Reporter

![GitHub](https://img.shields.io/github/license/alexneo2003/playwright-azure-reporter) ![npm (scoped)](https://img.shields.io/npm/v/@alex_neo/playwright-azure-reporter) ![npm](https://img.shields.io/npm/dw/@alex_neo/playwright-azure-reporter) ![npm](https://img.shields.io/npm/dt/@alex_neo/playwright-azure-reporter)

## A must read!

**Since version 1.5.0 reporter allows using configurationIds to publish results for different configurations e.g. different browsers**
**Necessarily defining `testRun.configurationIds` or/and `testPointMapper` function in reporter config, otherwise reporter will be publishing results for all configurations**

**Since version 1.9.0 reporter allows you to use test tags as Playwright it implemented in version [1.42.0](https://playwright.dev/docs/test-annotations#tag-tests)**
**You can define test cases ids in new format, but you still can use old format with test case id in test name**

**Example:**

```typescript
test.describe('Test suite', () => {
  test('Test name @tag1 @tag2', {
    tag: ['@[1]'] // <<-- test case id
  } () => {
    expect(true).toBe(true);
  });
});
```

**but you should define your Azure DevOps test case id in format `@[1]` where `1` is your test case id in square brackets and `@` is required prefix for playwright to recognize tags**

## How to integrate

Install package

```bash
npm install @alex_neo/playwright-azure-reporter
```

or

```bash
yarn add @alex_neo/playwright-azure-reporter
```

## Usage

You must register an ID already existing test cases from Azure DevOps before running tests.

> **You need write testCaseId wraped in square brackets at the test name.**

You can define multiple test cases for a single test with next format:

- `[1] Test name` - single test case
- `[1,2,3] Test name` - multiple test cases
- `[16, 17, 18] Test name` - multiple test cases with spaces
- `[1, 2, 3] Test name [4] Test name [5][6] Test name` - with combined format

For example:

```typescript
describe('Test suite', () => {
  test('[1] First Test', () => {
    expect(true).toBe(true);
  });

  test('Correct test [3]', () => {
    expect(true).toBe(true);
  });

  test.skip('Skipped test [4]', () => {
    expect(true).toBe(true);
  });

  test('[6] Failed test', () => {
    expect(true).toBe(false);
  });

  test('[7] Test seven [8] Test eight [9] Test nine', () => {
    expect(true).toBe(true);
  });

  test('[10,11,12] Test ten, eleven, twelve', () => {
    expect(true).toBe(true);
  });

  test('[13, 14, 15] Test thirteen, fourteen, fifteen', () => {
    expect(true).toBe(true);
  });

  test('[16, 17, 18] Test sixteen, seventeen, eighteen [19] Test nineteen', () => {
    expect(true).toBe(true);
  });
});
```

Or you can use tags to define test cases ids (since v1.9.0) (read more [here](https://playwright.dev/docs/test-annotations#tag-tests)):

```typescript
test.describe('Test suite', () => {
  test('Test name', {
    tag: ['@[1]', '@smoke', '@slow']
  } () => {
    expect(true).toBe(true);
  });
});
```

Configure Playwright Azure Reporter with `playwright-azure-reporter` package.

`playwright.config.ts`

```typescript
import type { PlaywrightTestConfig } from '@playwright/test';
import type { AzureReporterOptions } from '@alex_neo/playwright-azure-reporter/dist/playwright-azure-reporter';

/**
 * See https://playwright.dev/docs/test-configuration.
 */
const config: PlaywrightTestConfig = {
  testDir: './tests',
  timeout: 30 * 1000,
  expect: {
    timeout: 5000,
  },
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['list'],
    [
      '@alex_neo/playwright-azure-reporter',
      {
        orgUrl: 'https://dev.azure.com/your-organization-name',
        token: process.env.AZURE_TOKEN,
        planId: 44,
        projectName: 'SampleSample',
        environment: 'AQA',
        logging: true,
        testRunTitle: 'Playwright Test Run',
        publishTestResultsMode: 'testRun',
        uploadAttachments: true,
        attachmentsType: ['screenshot', 'video', 'trace'],
        testCaseIdMatcher: /@\[(\d+)\]/, // please use this pattern to extract test case id from test name, be careful with the pattern!!!
        testRunConfig: {
          owner: {
            displayName: 'Alex Neo',
          },
          comment: 'Playwright Test Run',
          // the configuration ids of this test run, use
          // https://dev.azure.com/{organization}/{project}/_apis/test/configurations to get the ids of  your project.
          // if multiple configuration ids are used in one run a testPointMapper should be used to pick the correct one,
          // otherwise the results are pushed to all.
          configurationIds: [1],
        },
      } as AzureReporterOptions,
    ],
  ],
  use: {
    screenshot: 'only-on-failure',
    actionTimeout: 0,
    trace: 'on-first-retry',
  },
};

export default config;
```

## Configuration

Reporter options (\* - required):

- \*`token` [string] - Azure DevOps token, you can find more information [here](https://docs.microsoft.com/en-us/azure/devops/organizations/accounts/use-personal-access-tokens-to-authenticate?view=azure-devops&tabs=Windows)
- \*`orgUrl` [string] - Full url for your organization space. Example: `https://dev.azure.com/your-organization-name`

  > **Note:** some API's (e.g. ProfileApi) can't be hit at the org level, and has to be hit at the deployment level, so url should be structured like https://vssps.dev.azure.com/{yourorgname}

- \*`projectName` [string] - Name of your project (also can be got from run URL). Example: `https://dev.azure.com/alex-neo/SampleProject/` - **SampleProject**
- \*`planId` [number] - Id of test plan. You can find it in test plan URL. Example: `https://dev.azure.com/alex-neo/SampleProject/_testPlans/execute?planId=4&suiteId=6` - **planId=4**
- `environment` [any] - Any string that will be used as environment name. Will be used as prefix for all test runs. Default: `undefined`. Example: `QA`
- `logging` [boolean] - Enabled debug logging from reporter or not. Default: `false`.
- `uploadAttachments` [boolean] - Uploading attachments (screenshot/video) after test ended. Default: `false`.
- `attachmentsType` [(string|RegExp)[]] - List of attachments types or a RegEx to match the name of the attachment that will be uploaded. Default: `['screenshot']`
- `uploadLogs` [boolean] - Uploading logs that were created during test execution like stdout/stderr. Doesn't depend on `uploadAttachments` option. Default: `false`.
- `isDisabled` [boolean] - Disable reporter. Default: `false`.
- `testRunTitle` [string] - Title of test run using to create new test run. Default: `Playwright Test Run`.
- `testRunConfig` - Extra data to pass when Test Run creating. Read [doc](https://learn.microsoft.com/en-us/rest/api/azure/devops/test/runs/create?view=azure-devops-rest-7.1&tabs=HTTP#request-body) from more information. Default: `empty`.
- `testPointMapper` [function] - A callback to map the test runs to test configurations, e.g. by browser

```
  import { TestCase } from '@playwright/test/reporter'
  import { TestPoint } from 'azure-devops-node-api/interfaces/TestInterfaces'

  testPointMapper: async (testCase: TestCase, testPoints: TestPoint[]) => {
    switch(testCase.parent.project()?.use.browserName) {
      case 'chromium':
        return testPoints.filter((testPoint) => testPoint.configuration.id === '3');
      case 'firefox':
        return testPoints.filter((testPoint) => testPoint.configuration.id === '4');
      case 'webkit':
        return testPoints.filter((testPoint) => testPoint.configuration.id === '5');
      default:
        throw new Error("invalid test configuration!");
    }
  }
```

- `publishTestResultsMode` - Mode of publishing test results. Default: `'testResult'`. Available options:
  - `testResult` - Published results of tests, at the end of each test, parallel to test run..
  - `testRun` - Published test results to test run, at the end of test run.
    > **Note:** If you use `testRun` mode and using same test cases in different tests (yes i know it sounds funny), it will be overwritten with last test result.
- `isExistingTestRun` [boolean] - Published test results to the existing test run. In this mode test results only added to the existing test run without its creation and completion. Default: `false`.
  > **Note:** If you use `isExistingTestRun` mode, `testRunId` should be specified.
- `testRunId` [number] - Id of test run. Used only for `existingTestRun` publishing mode. Also can be set by `AZURE_PW_TEST_RUN_ID` environment variable. Default: `undefined`.

  > **Note:** If you set existing test run ID from reporter options and from environment variable - reporter options will be used

  > **Note:** If you use `isExistingTestRun` mode, test run doesn't complete automatically. You should complete it manually.

- `testCaseIdMatcher` [string|RegExp|string[]|RegExp[]] - A string or a regular expression to match the name of the test case to extract the test case id. Default: `/\[([\d,\s]+)\]/`

  #### Example Test Titles

  - Test title: `Test case @tag1=123`

    - `testCaseIdMatcher: /@tag1=(\d+)/`
    - Extracted tags: `['123']`

  - Test title: `Test case @TestCase=123 [@TestCase=456]`

    - `testCaseIdMatcher: /@TestCase=(\d+)/`
    - Extracted tags: `['123', '456']`

  - Test title: `Test case test123 TEST456`
    - `testCaseIdMatcher: [/[a-z]+(\d+)/, /[A-Z]+(\d+)/]`
    - Extracted tags: `['123', '456']`
  - Test title: `Test case @tag1=123 @tag2=456`
    - `testCaseIdMatcher: ['@tag1=(\\d+)', '@tag2=(\\d+)']`
    - Extracted tags: `['123', '456']`

  #### Error Handling

  If an invalid `testCaseIdMatcher` is provided, an error will be thrown. For example:

  ```typescript
   reporter: [
    ['list'],
    [
      '@alex_neo/playwright-azure-reporter',
      {
        orgUrl: 'http://localhost:4000',
        projectName: 'SampleProject',
        planId: 4,
        token: 'your-token',
        isDisabled: false,
        testCaseIdMatcher: 1234, // Invalid pattern
      }
    ],
  // This will throw an error: "Invalid testCaseIdMatcher. Must be a string or RegExp. Actual: 1234"
  ```

- `testCaseIdZone` [string] - Specifies where to look for the test case IDs. It can be either `'title'` or `'annotation'`. When set to `'title'`, the reporter will extract test case IDs from the test title and tag test section also. When set to `'annotation'`, it will extract test case IDs only from the test annotations. Default: `'title'`.

  **Pay attention that if you use `testCaseIdZone: 'annotation'` and `testCaseIdMatcher` is not defined, the reporter will not extract test case IDs from the test annotations. You should define `testCaseIdMatcher` to extract test case IDs from the test annotations. Matcher should match the annotation type not the annotation description!**

  #### Example Usage

  - Test title: `Test case [12345]`

    - `testCaseIdZone: 'title'`
    - Extracted tags: `['12345']`

  - Test annotations:
    ```typescript
    test('Test case', { annotations: [{ type: 'TestCase', description: '12345' }] }, () => {
      expect(true).toBe(true);
    });
    ```
    - `testCaseIdZone: 'annotation'`
    - `testCaseIdMatcher: /(TestCase)/`
    - Extracted tags: `['12345']`]

- `rootSuiteId` [number] - The ID of the root test suite under which the test results will be published. This can be useful when you have some test suites for different test packages, like `smoke`, `integration`, `e2e`, etc., with the same test cases. In this case, you can specify the root suite ID to publish test results under the root suite. Also can be defined by the `AZURE_PW_ROOT_SUITE_ID` environment variable. Default: `undefined`.

  > **Note:** If you set root suite ID from reporter options and from environment variable - reporter options will be used

  > **Example:**
  > Let's say you have the following test suites/cases structure
  >
  > ```
  > Automation Tests
  >   - Smoke Tests (suiteId: 5)
  >     - Test 1 (caseId: 1)
  >     - Test 2 (caseId: 2)
  >   - Integration Tests (suiteId: 6)
  >     - Test 1 (caseId: 1)
  >     - Test 2 (caseId: 2)
  >     - Test 3 (caseId: 3)
  >     - Test 4 (caseId: 4)
  > ```
  >
  > And when you run tests with the `Smoke Tests` project without specifying the `rootSuiteId`, the test results will be published under the root suite `Automation Tests` for test cases in the `Smoke Tests` suite and `Integration Tests` suite. It will look like you have redundant results inside the test run for the same test cases in different suites. To avoid this, you can specify the `rootSuiteId: 5` to publish test results only under the `Smoke Tests` suite.

## Usefulness

- **AZURE_PW_TEST_RUN_ID** - Id of current test run. It will be set in environment variables after test run created. Can be accessed by `process.env.AZURE_PW_TEST_RUN_ID`. Pay attention what `publishTestResultsMode` configuration you use. If you use `testResult` mode - this variable will be set when test run created, at the start of tests execution, if you use `testRun` mode - this variable will be set when test run completed, at the end of tests execution.

  > **Since version 1.10.0 you have access to `AZURE_PW_TEST_RUN_ID` environment variable in your ADO pipeline. You can get it from the Task Variables.**

  Example of usage in Azure DevOps pipeline:

  ```yaml
  - script: npx playwright test
    displayName: 'Run Playwright tests'
    name: 'playwright'
    env:
      CI: 'true'

  - script: echo $(playwright.AZURE_PW_TEST_RUN_ID)
    displayName: 'Print test run id'
  ```

- **AZUREPWDEBUG** - Enable debug logging from reporter `0` - disabled, `1` - enabled. Default: `0`.

  Example of usage in Azure DevOps pipeline:

  ```yaml
  - script: npx playwright test
    displayName: 'Run Playwright tests'
    name: 'playwright'
    env:
      CI: 'true'
      AZUREPWDEBUG: '1'
  ```

## Beta Releases

This project supports two types of beta releases to help test new features and bug fixes before they are included in stable releases:

1. **Merge Beta Releases**: Automatically triggered when pull requests are merged
2. **PR Beta Releases**: Manually triggered for individual pull requests

### Merge Beta Releases

- **Automatic Triggering**: Beta releases are automatically triggered when pull requests are merged into the main branch (or other configured branches)
- **Version Strategy**: Beta versions follow semantic versioning with a `-beta.X` suffix (e.g., `1.13.2-beta.0`)
- **Installation**: Install beta releases using the beta tag: `npm install @alex_neo/playwright-azure-reporter@beta`

### PR Beta Releases

PR beta releases allow you to test changes from a specific pull request before it's merged:

- **Manual Triggering**: Comment `/beta-release` on any open pull request to create a beta version
- **Source Branch**: The beta is built from the PR's source branch, not the target branch
- **Unique Versioning**: Each PR beta gets a unique version like `1.13.3-pr42.feature-branch.a1b2c3d`
- **Installation**: Install with the pr-beta tag: `npm install @alex_neo/playwright-azure-reporter@pr-beta`

### Configuration

You can customize beta release behavior by creating a `.beta-release.json` file in your project root:

```json
{
  "betaRelease": {
    "enabled": true,
    "branches": ["main", "develop"],
    "versionStrategy": "patch",
    "publishTag": "beta",
    "createGitHubRelease": true,
    "prBetaRelease": {
      "enabled": true,
      "versionStrategy": "patch",
      "publishTag": "pr-beta",
      "createGitHubRelease": false
    }
  }
}
```

**Configuration Options:**

**Merge Beta Releases:**
- `enabled` (boolean): Enable or disable automatic beta releases. Default: `true`
- `branches` (string[]): List of branches that trigger beta releases when PRs are merged. Default: `["main"]`
- `versionStrategy` (string): Version increment strategy - `"patch"`, `"minor"`, or `"major"`. Default: `"patch"`
- `publishTag` (string): npm dist-tag for publishing beta releases. Default: `"beta"`
- `createGitHubRelease` (boolean): Whether to create GitHub releases for beta versions. Default: `true`

**PR Beta Releases:**
- `prBetaRelease.enabled` (boolean): Enable or disable PR beta releases. Default: `false`
- `prBetaRelease.versionStrategy` (string): Version increment strategy for PR betas. Default: `"patch"`
- `prBetaRelease.publishTag` (string): npm dist-tag for PR beta releases. Default: `"pr-beta"`
- `prBetaRelease.createGitHubRelease` (boolean): Whether to create GitHub releases for PR betas. Default: `false`

### Installing Beta Releases

**Install the latest merge beta release:**

```bash
npm install @alex_neo/playwright-azure-reporter@beta
```

**Install the latest PR beta release:**

```bash
npm install @alex_neo/playwright-azure-reporter@pr-beta
```

**Install a specific beta version:**

```bash
npm install @alex_neo/playwright-azure-reporter@1.13.2-beta.0
```

**Install a specific PR beta version:**

```bash
npm install @alex_neo/playwright-azure-reporter@1.13.3-pr42.feature-branch.a1b2c3d
```

### Manual Beta Release

**Merge Beta Releases:**

You can trigger merge beta releases manually using the GitHub Actions workflow:

1. Go to the Actions tab in the repository
2. Select "Beta Release" workflow
3. Click "Run workflow"
4. Optionally specify a different branch

**PR Beta Releases:**

To create a beta release for a specific pull request:

1. **Open the pull request** you want to test
2. **Comment `/beta-release`** on the PR
3. **Wait for the workflow** to build and publish the beta version
4. **Follow the installation instructions** posted back to the PR

The PR beta release will include all changes from the PR's source branch and create a unique version identifier.

**Note:** Beta releases are for testing purposes and may contain experimental features. For production use, always use the latest stable release.
