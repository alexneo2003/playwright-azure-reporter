# Playwright Azure Reporter

![GitHub](https://img.shields.io/github/license/alexneo2003/playwright-azure-reporter) ![npm (scoped)](https://img.shields.io/npm/v/@alex_neo/playwright-azure-reporter) ![npm](https://img.shields.io/npm/dw/@alex_neo/playwright-azure-reporter) ![npm](https://img.shields.io/npm/dt/@alex_neo/playwright-azure-reporter)

A Playwright reporter that publishes test results to Azure DevOps Test Plans.

## Table of Contents

- [Quick Start](#quick-start)
- [Defining Test Case IDs](#defining-test-case-ids)
  - [In Test Title](#in-test-title)
  - [Using Tags](#using-tags)
  - [Using Annotations](#using-annotations)
- [Configuration](#configuration)
  - [Required Options](#required-options)
  - [General Options](#general-options)
  - [Authentication](#authentication)
  - [Publishing Modes](#publishing-modes)
  - [Retry Results](#retry-results)
  - [Attachments & Logs](#attachments--logs)
  - [Test Point Mapping](#test-point-mapping)
  - [Test Case ID Matching](#test-case-id-matching)
  - [Test Case Summary](#test-case-summary)
  - [Auto-Mark as Automated](#auto-mark-as-automated)
- [CI/CD Integration](#cicd-integration)
- [Releases](#releases)

## Quick Start

Install the package:

```bash
npm install @alex_neo/playwright-azure-reporter
```

Add the reporter to your `playwright.config.ts`:

```typescript
import { defineConfig } from '@playwright/test';
import type { AzureReporterOptions } from '@alex_neo/playwright-azure-reporter';

export default defineConfig({
  reporter: [
    ['list'],
    [
      '@alex_neo/playwright-azure-reporter',
      {
        orgUrl: 'https://dev.azure.com/your-organization-name',
        token: process.env.AZURE_TOKEN,
        planId: 44,
        projectName: 'SampleProject',
        publishTestResultsMode: 'testRun',
      } as AzureReporterOptions,
    ],
  ],
});
```

Each test must reference an existing Azure DevOps test case ID. See [Defining Test Case IDs](#defining-test-case-ids) for all supported formats.

## Defining Test Case IDs

You must link each test to an existing test case in Azure DevOps before running tests. There are three ways to do this.

### In Test Title

Wrap test case IDs in square brackets inside the test name:

- `[1] Test name` - single test case
- `[1,2,3] Test name` - multiple test cases
- `[1, 2, 3] Test name [4] another [5][6] combined` - mixed formats

```typescript
test.describe('Test suite', () => {
  test('[1] First Test', () => {
    expect(true).toBe(true);
  });

  test('[10,11,12] Multiple test cases', () => {
    expect(true).toBe(true);
  });
});
```

### Using Tags

Use Playwright's [tag syntax](https://playwright.dev/docs/test-annotations#tag-tests) with the format `@[ID]`:

```typescript
test.describe('Test suite', () => {
  test('Test name', {
    tag: ['@[1]', '@smoke', '@slow'],
  }, () => {
    expect(true).toBe(true);
  });
});
```

The `@` prefix is required by Playwright. Non-ID tags (like `@smoke`) are ignored by the reporter.

### Using Annotations

Use Playwright's [annotation API](https://playwright.dev/docs/test-annotations) with `testCaseIdZone: 'annotation'`:

```typescript
test('Test case', {
  annotation: { type: 'TestCase', description: '12345' },
}, () => {
  expect(true).toBe(true);
});
```

See [Test Case ID Matching](#test-case-id-matching) for advanced matching patterns with annotations.

## Configuration

### Required Options

| Option | Type | Description |
|--------|------|-------------|
| `orgUrl` | `string` | Full URL for your organization. Example: `https://dev.azure.com/your-organization-name` |
| `projectName` | `string` | Name of your Azure DevOps project |
| `planId` | `number` | ID of the test plan (from the test plan URL: `planId=4`) |

> **Note:** Some APIs (e.g. ProfileApi) must be hit at the deployment level: `https://vssps.dev.azure.com/{yourorgname}`

### General Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `isDisabled` | `boolean` | `false` | Disable the reporter entirely |
| `environment` | `string` | `undefined` | Prefix for test run names (e.g. `'QA'`) |
| `logging` | `boolean` | `false` | Enable debug logging |
| `testRunTitle` | `string` | `'Playwright Test Run'` | Title for newly created test runs |
| `testRunConfig` | `object` | `undefined` | Extra data passed when creating a test run. See [API docs](https://learn.microsoft.com/en-us/rest/api/azure/devops/test/runs/create?view=azure-devops-rest-7.1&tabs=HTTP#request-body) |

### Authentication

The reporter supports three authentication methods:

#### Personal Access Token (PAT) - Default

```typescript
{
  token: 'your-personal-access-token',
  authType: 'pat' // Optional, this is the default
}
```

#### Access Token

```typescript
{
  token: 'your-access-token',
  authType: 'accessToken'
}
```

#### Azure Managed Identity

```typescript
{
  token: 'not-used', // Token field is required but ignored for managedIdentity
  authType: 'managedIdentity',
  applicationIdURI: '499b84ac-1321-427f-aa17-267ca6975798/.default'
}
```

**When to use each:**

- **PAT**: Personal Access Token from Azure DevOps. Suitable for most use cases.
- **Access Token**: OAuth access token. Suitable for CI/CD environments with token-based authentication.
- **Managed Identity**: Azure environments with managed identity. Uses `DefaultAzureCredential` supporting Azure CLI, managed identity, environment variables, etc.

For more examples, see [Authentication Examples](tests/examples/authType-examples.md).

#### Required Token Scopes

| Scope | Access | Purpose |
|-------|--------|---------|
| Test Management | Read & Write | Creating/updating test runs, publishing results, uploading attachments |
| Work Items | Read & Write | Marking test cases as automated (only if `autoMarkTestCasesAsAutomated` is enabled) |
| Project and Team | Read | Accessing project information |

Alternatively, use a token with **Full access** scope.

> **Note:** If your token lacks Work Items write permissions but `autoMarkTestCasesAsAutomated` is enabled, the reporter will log errors for automation updates but continue publishing test results normally.

### Publishing Modes

Control how and when test results are sent to Azure DevOps with `publishTestResultsMode`:

| Mode | Default | Description |
|------|---------|-------------|
| `'testResult'` | Yes | Results published after each test completes, in parallel with test execution |
| `'testRun'` | | Results batched and published at the end of the test run |
| `'testRunADO'` | | Updates existing results in an Azure DevOps test run (requires `isExistingTestRun: true` and `testRunId`) |

> **Note:** In `testRun` mode, if the same test case ID appears in multiple tests, only the last result is kept.

#### Existing Test Runs

To publish results to an existing test run instead of creating a new one:

```typescript
{
  publishTestResultsMode: 'testRunADO',
  isExistingTestRun: true,
  testRunId: 12345, // or set AZURE_PW_TEST_RUN_ID env variable
}
```

- `isExistingTestRun` [`boolean`] - Publish to an existing test run without creating/completing it. Default: `false`.
- `testRunId` [`number`] - ID of the existing test run. Can also be set via `AZURE_PW_TEST_RUN_ID` env variable. Reporter options take precedence over the env variable.

> **Note:** When using `isExistingTestRun`, the test run is not completed automatically. You must complete it manually.

### Retry Results

Control how retry attempts are published with `publishRetryResults`:

| Mode | Description |
|------|-------------|
| `'all'` | Every retry attempt is published as a separate test result (default) |
| `'last'` | Only the final attempt is published. Intermediate failures are skipped |

```typescript
{
  publishRetryResults: 'last',
  // works with Playwright's retries setting
}
```

### Attachments & Logs

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `uploadAttachments` | `boolean` | `false` | Upload attachments (screenshots/video) after each test |
| `attachmentsType` | `(string\|RegExp)[]` | `['screenshot']` | Filter which attachments to upload by type or name pattern |
| `uploadLogs` | `boolean` | `false` | Upload stdout/stderr logs (independent of `uploadAttachments`) |

### Test Point Mapping

#### `testPointMapper`

A callback to map tests to specific test configurations (e.g. by browser):

```typescript
import { TestCase } from '@playwright/test/reporter';
import { TestPoint } from 'azure-devops-node-api/interfaces/TestInterfaces';

{
  testPointMapper: async (testCase: TestCase, testPoints: TestPoint[]) => {
    switch (testCase.parent.project()?.use.browserName) {
      case 'chromium':
        return testPoints.filter((tp) => tp.configuration.id === '3');
      case 'firefox':
        return testPoints.filter((tp) => tp.configuration.id === '4');
      case 'webkit':
        return testPoints.filter((tp) => tp.configuration.id === '5');
      default:
        throw new Error('invalid test configuration!');
    }
  },
  testRunConfig: {
    // Get configuration IDs from:
    // https://dev.azure.com/{organization}/{project}/_apis/test/configurations
    configurationIds: [3, 4, 5],
  },
}
```

> **Important:** Define `testRunConfig.configurationIds` and/or `testPointMapper`, otherwise results are published for all configurations.

#### `rootSuiteId`

Restricts test point resolution to a specific suite. Useful when different suites (e.g. `smoke`, `integration`) contain the same test case IDs. Can also be set via `AZURE_PW_ROOT_SUITE_ID` env variable. Reporter options take precedence.

```
Automation Tests
  - Smoke Tests (suiteId: 5)
    - Test 1 (caseId: 1)
    - Test 2 (caseId: 2)
  - Integration Tests (suiteId: 6)
    - Test 1 (caseId: 1)
    - Test 2 (caseId: 2)
```

Without `rootSuiteId`, running smoke tests would also match test points in Integration Tests. Set `rootSuiteId: 5` to scope results to Smoke Tests only.

### Test Case ID Matching

#### `testCaseIdMatcher`

A string, RegExp, or array of either, used to extract test case IDs. Default: `/\[([\d,\s]+)\]/`

**Examples with test titles:**

| Test Title | Matcher | Extracted IDs |
|-----------|---------|---------------|
| `Test case @tag1=123` | `/@tag1=(\d+)/` | `['123']` |
| `Test case @TC=123 [@TC=456]` | `/@TC=(\d+)/` | `['123', '456']` |
| `Test case test123 TEST456` | `[/[a-z]+(\d+)/, /[A-Z]+(\d+)/]` | `['123', '456']` |

If an invalid matcher is provided (e.g. a number), an error is thrown: `"Invalid testCaseIdMatcher. Must be a string or RegExp."`.

#### `testCaseIdZone`

Specifies where to look for test case IDs: `'title'` (default) or `'annotation'`.

- `'title'` - Extracts IDs from the test title and tags
- `'annotation'` - Extracts IDs from test annotations only

> **Important:** When using `testCaseIdZone: 'annotation'`, you must also define `testCaseIdMatcher`.

**When using annotation zone**, the matcher works in two steps:
1. First matcher matches the annotation **type** (e.g. `/(TestCase)/`)
2. Subsequent matchers extract IDs from the annotation **description**

**Annotation examples:**

Simple description:

```typescript
// testCaseIdZone: 'annotation', testCaseIdMatcher: /(TestCase)/
test('Test case', {
  annotation: { type: 'TestCase', description: '12345' },
}, () => { /* ... */ });
// Extracted: ['12345']
```

Azure DevOps URLs:

```typescript
// testCaseIdZone: 'annotation', testCaseIdMatcher: [/(Test Case)/, /\/(\d+)/]
test('Test case', {
  annotation: {
    type: 'Test Case',
    description: 'https://dev.azure.com/org/project/_workitems/edit/12345, https://dev.azure.com/org/project/_workitems/edit/54321',
  },
}, () => { /* ... */ });
// Extracted: ['12345', '54321']
```

Bracketed format:

```typescript
// testCaseIdZone: 'annotation', testCaseIdMatcher: [/(Test Case)/, /\[([\d,\s]+)\]/]
test('Test case', {
  annotation: { type: 'Test Case', description: '[12345, 67890]' },
}, () => { /* ... */ });
// Extracted: ['12345', '67890']
```

### Test Case Summary

Generate a report of test cases that don't match the test plan. Helps identify missing, misconfigured, or unassigned test cases.

```typescript
{
  testCaseSummary: {
    enabled: true,
    outputPath: './test-case-summary.md',
    consoleOutput: true,
    publishToRun: true,
  },
}
```

| Sub-option | Type | Default | Description |
|------------|------|---------|-------------|
| `enabled` | `boolean` | `false` | Enable summary generation |
| `outputPath` | `string` | `undefined` | File path for the summary report |
| `consoleOutput` | `boolean` | `true` | Print summary to console |
| `publishToRun` | `boolean` | `false` | Upload summary as a Markdown attachment to the ADO test run |

**Output channels** work independently - enable any combination:

| `consoleOutput` | `outputPath` | `publishToRun` | Result |
|:-:|:-:|:-:|--------|
| true | - | - | Console only |
| true | set | - | Console + file |
| - | - | true | ADO attachment only |
| true | set | true | All three channels |

When all test cases match, a success message is logged instead.

> **Note:** When `publishToRun: true`, the attachment is only uploaded if unmatched test points exist. Key summary lines are always logged regardless of the `logging` setting to ensure CI visibility.

**Example output:**

```markdown
# Test Case Summary

Found 1 test(s) with test case IDs that don't match the test plan:

## Tests with No Matching Test Points (1)

- **[777] Test with file output**
  - File: tests/example.spec.ts:3
  - Test Case IDs: [777]

## Recommendations

- Verify test case IDs exist in Azure DevOps test plan 4
- Check that test cases are assigned to configurations: [10, 20] (Firefox, Safari)
- Ensure test cases are included in the test plan suite structure
```

### Auto-Mark as Automated

Automatically update Azure DevOps test case work items to reflect their automation status when tests are executed.

```typescript
{
  autoMarkTestCasesAsAutomated: {
    enabled: true,
    updateAutomatedTestName: true,
    updateAutomatedTestStorage: true,
  },
}
```

| Sub-option | Type | Default | Description |
|------------|------|---------|-------------|
| `enabled` | `boolean` | `false` | Enable automatic marking |
| `updateAutomatedTestName` | `boolean` | `true` | Set `AutomatedTestName` field |
| `updateAutomatedTestStorage` | `boolean` | `true` | Set `AutomatedTestStorage` field |
| `automatedTestNameFormat` | `string` | `'title'` | `'title'` or `'titleWithParent'` (includes parent suite name) |
| `automatedTestStoragePath` | `boolean \| function` | `false` | `false`: filename only, `true`: full path, `function`: custom callback |
| `automatedTestType` | `function` | `undefined` | Callback to set `AutomatedTestType` (e.g. `'Unit Test'`, `'E2E Test'`) |

**What it does:**

1. Checks each test case's automation status in Azure DevOps
2. If "Not Automated": sets `AutomationStatus` to "Automated", updates name/storage/type fields, generates a new `AutomatedTestId` GUID
3. If already "Automated": optionally updates name and storage fields if they differ

**Advanced example:**

```typescript
{
  autoMarkTestCasesAsAutomated: {
    enabled: true,
    updateAutomatedTestName: true,
    updateAutomatedTestStorage: true,
    automatedTestNameFormat: 'titleWithParent',
    automatedTestStoragePath: (testCase) => {
      // Use relative path from project root
      const parts = testCase.location.file.split('/');
      const idx = parts.indexOf('my-project');
      return idx >= 0 ? parts.slice(idx + 1).join('/') : testCase.location.file;
    },
    automatedTestType: (testCase) => {
      if (testCase.location.file.includes('/e2e/')) return 'End-to-End Test';
      if (testCase.location.file.includes('/integration/')) return 'Integration Test';
      return 'Functional Test';
    },
  },
}
```

> **Tip:** Use `automatedTestNameFormat: 'titleWithParent'` to prevent name collisions across suites. Use `automatedTestStoragePath` callback to avoid exposing absolute paths.

> **Note:** Requires Work Items write permissions. Works in all publishing modes (`testResult`, `testRun`, `testRunADO`).

## CI/CD Integration

### Environment Variables

| Variable | Description |
|----------|-------------|
| `AZURE_PW_TEST_RUN_ID` | Set automatically after the test run is created. Available as `process.env.AZURE_PW_TEST_RUN_ID`. In `testResult` mode it's set at the start; in `testRun` mode at the end; in `testRunADO` mode it contains the existing run ID. |
| `AZURE_PW_ROOT_SUITE_ID` | Alternative to the `rootSuiteId` option |
| `AZUREPWDEBUG` | Enable debug logging: `'1'` = enabled, `'0'` = disabled (default) |

### Azure DevOps Pipeline Example

```yaml
- script: npx playwright test
  displayName: 'Run Playwright tests'
  name: 'playwright'
  env:
    CI: 'true'
    AZUREPWDEBUG: '1'

# Access the test run ID from subsequent steps (since v1.10.0)
- script: echo $(playwright.AZURE_PW_TEST_RUN_ID)
  displayName: 'Print test run id'
```

## Releases

For detailed information about stable releases, beta releases, and version management, see [RELEASES.md](RELEASES.md).
