# Auto-Mark Test Cases as Automated - Examples

This document provides examples of how to use the `autoMarkTestCasesAsAutomated` feature to automatically mark test cases as automated when they are executed through the reporter.

## Basic Usage

### Example 1: Enable Auto-Marking with Default Settings

```typescript
import { defineConfig } from '@playwright/test';
import AzureDevOpsReporter from '@alex_neo/playwright-azure-reporter';

export default defineConfig({
  reporter: [
    [
      AzureDevOpsReporter,
      {
        orgUrl: 'https://dev.azure.com/your-organization',
        token: process.env.AZURE_TOKEN,
        planId: 123,
        projectName: 'YourProject',
        logging: true,
        autoMarkTestCasesAsAutomated: {
          enabled: true, // Enable the feature
          updateAutomatedTestName: true, // Will set test name (default)
          updateAutomatedTestStorage: true // Will set test storage file (default)
        }
      }
    ]
  ],
  // ... rest of your config
});
```

### Example 2: Enable Auto-Marking Without Updating Test Details

If you only want to mark test cases as automated without updating the test name and storage:

```typescript
autoMarkTestCasesAsAutomated: {
  enabled: true,
  updateAutomatedTestName: false, // Don't update test name
  updateAutomatedTestStorage: false // Don't update test storage
}
```

### Example 3: Minimal Configuration

```typescript
autoMarkTestCasesAsAutomated: {
  enabled: true
  // updateAutomatedTestName and updateAutomatedTestStorage default to true
}
```

## How It Works

When you run tests with this feature enabled:

1. **For "Not Automated" Test Cases:**
   ```
   Test case 123 automation status: Not Automated
   Marking test case 123 as automated
   Test case 123 marked as automated
   ```

   The reporter will update the following fields in Azure DevOps:
   - `Microsoft.VSTS.TCM.AutomationStatus` → `Automated`
   - `Microsoft.VSTS.TCM.AutomatedTestName` → Test title (e.g., "User login with valid credentials")
   - `Microsoft.VSTS.TCM.AutomatedTestStorage` → Test file name (e.g., "auth.spec.ts")
   - `Microsoft.VSTS.TCM.AutomatedTestId` → New GUID

2. **For Already "Automated" Test Cases:**
   ```
   Test case 456 automation status: Automated
   Test case 456 is already automated, checking if update needed
   Test case 456 automation details updated
   ```

   If the test name or storage has changed, the reporter will update those fields.

3. **For Test Cases That Cannot Be Found:**
   ```
   Work item 789 not found, skipping automation status update
   ```

## Use Cases

### CI/CD Pipeline Integration

Automatically keep test case automation status in sync with your CI/CD pipeline:

```typescript
// playwright.config.ts
export default defineConfig({
  reporter: [
    [
      AzureDevOpsReporter,
      {
        orgUrl: process.env.AZURE_ORG_URL,
        token: process.env.AZURE_TOKEN,
        planId: parseInt(process.env.AZURE_PLAN_ID || '0'),
        projectName: process.env.AZURE_PROJECT,
        logging: true,
        autoMarkTestCasesAsAutomated: {
          enabled: process.env.CI === 'true', // Only in CI
          updateAutomatedTestName: true,
          updateAutomatedTestStorage: true
        }
      }
    ]
  ]
});
```

### Selective Automation Marking

You can control when to enable this feature based on environment:

```typescript
const isProd = process.env.ENVIRONMENT === 'production';

export default defineConfig({
  reporter: [
    [
      AzureDevOpsReporter,
      {
        // ... other config
        autoMarkTestCasesAsAutomated: isProd ? {
          enabled: true,
          updateAutomatedTestName: true,
          updateAutomatedTestStorage: true
        } : undefined
      }
    ]
  ]
});
```

## Sample Test File

```typescript
import { test, expect } from '@playwright/test';

test.describe('Authentication Tests', () => {
  // This test case (ID: 123) will be automatically marked as automated
  test('[123] User can login with valid credentials', async ({ page }) => {
    await page.goto('https://example.com/login');
    await page.fill('[name="username"]', 'user@example.com');
    await page.fill('[name="password"]', 'password123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('https://example.com/dashboard');
  });

  // Multiple test cases will all be marked as automated
  test('[124, 125, 126] User cannot login with invalid credentials', async ({ page }) => {
    await page.goto('https://example.com/login');
    await page.fill('[name="username"]', 'invalid@example.com');
    await page.fill('[name="password"]', 'wrongpassword');
    await page.click('button[type="submit"]');
    await expect(page.locator('.error-message')).toBeVisible();
  });
});
```

## Requirements

- **Permissions:** Your Azure DevOps token or managed identity must have **write access** to work items
- **Authentication:** Works with all authentication types (PAT, Access Token, Managed Identity)
- **Publishing Modes:** Compatible with all publishing modes (`testResult`, `testRun`, `testRunADO`)

## Benefits

✅ **Automated Tracking** - Automatically updates test case automation status in Azure DevOps  
✅ **Reduced Manual Work** - Eliminates need to manually update test case metadata  
✅ **Better Visibility** - Teams can see which test cases are automated directly in Azure DevOps  
✅ **CI/CD Integration** - Seamlessly integrates with automated pipelines  
✅ **Audit Trail** - Azure DevOps tracks who/when automation status was updated  
✅ **Flexibility** - Control which fields get updated based on your needs

## Troubleshooting

### "Failed to mark test case as automated" Error

If you see this error, check:
1. Your token has work item write permissions
2. The test case ID exists in Azure DevOps
3. The test case is in the correct project

### No Updates Happening

Verify:
1. `enabled: true` is set in the configuration
2. Test cases have valid IDs in the test name/tags
3. Logging is enabled to see status messages
4. The reporter is successfully publishing test results

### Permission Denied

Ensure your Azure DevOps token or managed identity has:
- **Work Items (Read & Write)** permission
- Access to the project containing the test cases
