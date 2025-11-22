# Playwright Azure Reporter

![GitHub](https://img.shields.io/github/license/alexneo2003/playwright-azure-reporter) ![npm (scoped)](https://img.shields.io/npm/v/@alex_neo/playwright-azure-reporter) ![npm](https://img.shields.io/npm/dw/@alex_neo/playwright-azure-reporter) ![npm](https://img.shields.io/npm/dt/@alex_neo/playwright-azure-reporter)

## A must read!

**Since version 1.5.0 reporter allows using configurationIds to publish results for different configurations e.g. different browsers**
**Necessarily defining `testRun.configurationIds` or/and `testPointMapper` function in reporter config, otherwise reporter will be publishing results for all configurations**

**Since version 1.9.0 reporter allows you to use test tags as Playwright it implemented in version [1.42.0](https://playwright.dev/docs/test-annotations#tag-tests)**
**You can define test cases ids in new format, but you still can use old format with test case id in test name**

**Since version 1.11.0 reporter supports different authentication types via the `authType` option**
**You can now specify `authType: 'pat'` for Personal Access Token (default) or `authType: 'accessToken'` for OAuth Access Token authentication. Existing configurations continue to work without changes.**

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
        authType: 'pat', // 'pat', 'accessToken', or 'managedIdentity'
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

## Authentication

The reporter supports three authentication methods to connect to Azure DevOps:

### Personal Access Token (PAT) - Default

```typescript
{
  token: 'your-personal-access-token',
  authType: 'pat' // Optional, this is the default
}
```

### Access Token

```typescript
{
  token: 'your-access-token',
  authType: 'accessToken'
}
```

### Azure Managed Identity

```typescript
{
  token: 'not-used', // Token field is required but ignored for managedIdentity
  authType: 'managedIdentity',
  applicationIdURI: '499b84ac-1321-427f-aa17-267ca6975798/.default'
}
```

**When to use each:**

- **PAT**: Use when you have a Personal Access Token generated from Azure DevOps. Suitable for most individual use cases.
- **Access Token**: Use when you have an OAuth access token. Suitable for applications using Azure DevOps OAuth flows or CI/CD environments with token-based authentication.
- **Managed Identity**: Use when running in Azure environments with managed identity configured. Automatically handles authentication using Azure DefaultAzureCredential, supporting multiple auth methods like Azure CLI (`az login`), managed identity, environment variables, etc.

For more detailed examples, see [Authentication Examples](tests/examples/authType-examples.md).

### Required Token Scopes

Regardless of the authentication type you choose, your token must have the following Azure DevOps scopes:

**Required Scopes:**

- **Test Management (Read & Write)** - Required for:
  - Creating and updating test runs
  - Publishing test results
  - Querying test points and configurations
  - Uploading test attachments
- **Project and Team (Read)** - Required for:
  - Accessing project information
  - Validating project existence

**Minimal Scope Configuration:**
When creating a Personal Access Token in Azure DevOps, ensure you select at least:

- `Test Management: Read & write`
- `Project and Team: Read`

**Full Access (Alternative):**
If you prefer, you can use a token with `Full access` scope, which includes all required permissions.

> **Note:** The reporter will fail with authentication errors if the token doesn't have sufficient permissions to perform test management operations.

## Configuration

Reporter options (\* - required):

- `token` [string] - Azure DevOps token, you can find more information [here](https://docs.microsoft.com/en-us/azure/devops/organizations/accounts/use-personal-access-tokens-to-authenticate?view=azure-devops&tabs=Windows). Required for `'pat'` and `'accessToken'` authTypes, not needed for `'managedIdentity'`.
- `authType` [string] - Specifies the authentication type to use with Azure DevOps. Available options:
  - `'pat'` - Personal Access Token (default)
  - `'accessToken'` - Access Token from Azure DevOps API
  - `'managedIdentity'` - Azure Managed Identity authentication

  Default: `'pat'`. For backward compatibility, existing configurations without `authType` will continue to work unchanged. See [Authentication Examples](tests/examples/authType-examples.md) for detailed usage.

- `applicationIdURI` [string] - Required when `authType` is `'managedIdentity'`. Specifies the application ID URI for Azure DevOps. Typically `'499b84ac-1321-427f-aa17-267ca6975798/.default'`.

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
  - `testRunADO` - Updates existing test results in Azure DevOps test run instead of creating new results. Requires `isExistingTestRun: true` and `testRunId` to be specified.
    > **Note:** This mode is designed for updating test results in an existing Azure DevOps test run. It will update the status and outcome of existing test results rather than creating new ones. This is useful when you want to update pre-existing test results with actual execution outcomes.
- `isExistingTestRun` [boolean] - Published test results to the existing test run. In this mode test results only added to the existing test run without its creation and completion. Default: `false`.
  > **Note:** If you use `isExistingTestRun` mode or `testRunADO` mode, `testRunId` should be specified.
- `testRunId` [number] - Id of test run. Used for `existingTestRun` publishing mode and `testRunADO` mode. Also can be set by `AZURE_PW_TEST_RUN_ID` environment variable. Default: `undefined`.

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

  **Pay attention that if you use `testCaseIdZone: 'annotation'` and `testCaseIdMatcher` is not defined, the reporter will not extract test case IDs from the test annotations. You should define `testCaseIdMatcher` to extract test case IDs from the test annotations.**

  **When using annotation zone:** The `testCaseIdMatcher` is applied in two steps:
  1. First matcher in the array should match the annotation **type** (e.g., `/(TestCase)/`)
  2. Subsequent matchers extract test case IDs from the annotation **description**
  
  This allows extracting IDs from complex patterns like URLs, bracketed formats, or any custom format.

  #### Example Usage
  - Test title: `Test case [12345]`
    - `testCaseIdZone: 'title'`
    - Extracted tags: `['12345']`

  - Test annotations with simple description:

    ```typescript
    test('Test case', { annotation: { type: 'TestCase', description: '12345' } }, () => {
      expect(true).toBe(true);
    });
    ```

    - `testCaseIdZone: 'annotation'`
    - `testCaseIdMatcher: /(TestCase)/`
    - Extracted IDs: `['12345']`

  - Test annotations with Azure DevOps URLs:

    ```typescript
    test('Test case', {
      annotation: {
        type: 'Test Case',
        description: 'https://dev.azure.com/myOrg/myProject/_workitems/edit/12345, https://dev.azure.com/myOrg/myProject/_workitems/edit/54321'
      }
    }, () => {
      expect(true).toBe(true);
    });
    ```

    - `testCaseIdZone: 'annotation'`
    - `testCaseIdMatcher: [/(Test Case)/, /\/(\d+)/]`
    - Extracted IDs: `['12345', '54321']`
    - The first matcher `/(Test Case)/` matches the annotation type
    - The second matcher `/\/(\d+)/` extracts numeric IDs from the URLs

  - Test annotations with bracketed format:

    ```typescript
    test('Test case', {
      annotation: {
        type: 'Test Case',
        description: '[12345, 67890]'
      }
    }, () => {
      expect(true).toBe(true);
    });
    ```

    - `testCaseIdZone: 'annotation'`
    - `testCaseIdMatcher: [/(Test Case)/, /\[([\d,\s]+)\]/]`
    - Extracted IDs: `['12345', '67890']`

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

- `testCaseSummary` [object] - Configuration for generating a summary report of test cases that don't match the test plan. Default: `undefined`.
  - `enabled` [boolean] - Enable test case summary generation. Default: `false`.
  - `outputPath` [string] - File path where the summary report will be written. If not specified, no file will be created. Default: `undefined`.
  - `consoleOutput` [boolean] - Whether to output the summary to console. Default: `true`.
  - `publishToRun` [boolean] - When `true`, the generated summary (Markdown) is uploaded as an attachment to the Azure DevOps test run (if a run ID exists). Default: `false`. Works together with `outputPath` (file still written if specified) and `consoleOutput` (console printing still occurs unless you explicitly set `consoleOutput: false`).

  **Example:**

  ```typescript
  testCaseSummary: {
    enabled: true,
    outputPath: './test-case-summary.md',
    consoleOutput: true,
    publishToRun: true
  }
  ```

  When enabled, the reporter will track test cases that have test case IDs but no matching test points in the Azure DevOps test plan. This helps identify:
  - Test cases that don't exist in the specified test plan
  - Test cases that are not assigned to the correct configurations
  - Test cases that are not included in the test plan suite structure

  The summary includes recommendations for resolving issues, including specific configuration IDs and names when available.

  **Behavior matrix:**
  - Only `consoleOutput: true`: Printed to console only
  - `outputPath` + `consoleOutput: true`: Printed and written to file
  - `publishToRun: true` + (optional `outputPath`): Uploaded as run attachment; also printed and/or written depending on the other flags
  - Set any channel off explicitly by setting its flag to `false` (e.g. `consoleOutput: false` to suppress console)

  **Example summary (actual generated format):**

  ```markdown
  # Test Case Summary

  ⚠️ Found 1 test(s) with test case IDs that don't match the test plan:

  ## Tests with No Matching Test Points (1)

  These tests have valid test case IDs but no matching test points in the test plan:

  - **[777] Test with file output**
    - File: /path/to/project/test-results/.../a.spec.js:3
    - Test Case IDs: [777]

  ## Recommendations

  - Verify test case IDs exist in Azure DevOps test plan 4
  - Check that test cases are assigned to configurations: [10, 20] (Firefox on Ubuntu, Safari on macOS)
  - Ensure test cases are included in the test plan suite structure
  - Add missing test cases to the test plan or assign them to the correct configurations
  ```

  When `outputPath` is set you'll see a log line:

  ```text
  Test case summary written to: ./test-case-summary.md
  ```

  And if `publishToRun: true` a Markdown attachment with the same content is uploaded to the run.

  When all tests with IDs are matched you'll instead see:

  ```text
  Test case summary: All tests with test case IDs found matching test points in the test plan.
  ```

  > Note: Key summary lines are force-logged so they appear even when general reporter logging is disabled; this ensures visibility in CI logs.

  > **Important:** When `publishToRun: true` is enabled, the test case summary file will only be uploaded as an attachment to the Azure DevOps test run if there are unmatched test points (i.e., `this._unmatched.noTestPoints.length > 0`). If all tests with test case IDs match the test plan, no attachment will be uploaded to avoid unnecessary file uploads, though the summary will still be displayed in console and/or written to file if those options are enabled.

## Usefulness

- **AZURE_PW_TEST_RUN_ID** - Id of current test run. It will be set in environment variables after test run created. Can be accessed by `process.env.AZURE_PW_TEST_RUN_ID`. Pay attention what `publishTestResultsMode` configuration you use. If you use `testResult` mode - this variable will be set when test run created, at the start of tests execution, if you use `testRun` mode - this variable will be set when test run completed, at the end of tests execution. For `testRunADO` mode, this variable will contain the existing test run ID that is being updated.

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

## Releases

For detailed information about stable releases, beta releases, and version management, see [RELEASES.md](RELEASES.md).
