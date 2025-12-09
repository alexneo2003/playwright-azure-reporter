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

## Advanced Configuration

### Example 4: Custom Storage Path with Callback Function

Use a callback function to control exactly how the test file path is stored. This is useful for:
- Creating relative paths instead of absolute paths
- Avoiding exposure of sensitive information (like usernames) in file paths
- Ensuring consistent paths across different environments (local, CI/CD)

```typescript
autoMarkTestCasesAsAutomated: {
  enabled: true,
  updateAutomatedTestName: true,
  updateAutomatedTestStorage: true,
  automatedTestNameFormat: 'titleWithParent',
  // Use callback to create relative path from project root
  automatedTestStoragePath: (testCase) => {
    const fullPath = testCase.location.file;
    const parts = fullPath.split('/');
    
    // Find project folder and return path relative to it
    const projectIdx = parts.indexOf('my-project');
    if (projectIdx >= 0) {
      return parts.slice(projectIdx + 1).join('/');
    }
    
    // Fallback to just filename
    return parts[parts.length - 1];
  }
}
```

**Result:** Instead of `/Users/johndoe/projects/my-project/tests/auth.spec.ts`, stores `tests/auth.spec.ts`

### Example 5: Setting Test Type Based on File Location

Use the `automatedTestType` callback to automatically categorize tests:

```typescript
autoMarkTestCasesAsAutomated: {
  enabled: true,
  updateAutomatedTestName: true,
  updateAutomatedTestStorage: true,
  // Automatically set test type based on folder structure
  automatedTestType: (testCase) => {
    const filePath = testCase.location.file;
    
    if (filePath.includes('/e2e/')) return 'End-to-End Test';
    if (filePath.includes('/integration/')) return 'Integration Test';
    if (filePath.includes('/unit/')) return 'Unit Test';
    if (filePath.includes('/api/')) return 'API Test';
    
    return 'Functional Test'; // default
  }
}
```

### Example 6: Combining Custom Path and Test Type

```typescript
autoMarkTestCasesAsAutomated: {
  enabled: true,
  updateAutomatedTestName: true,
  updateAutomatedTestStorage: true,
  automatedTestNameFormat: 'titleWithParent',
  // Custom storage path for relative paths
  automatedTestStoragePath: (testCase) => {
    const parts = testCase.location.file.split('/');
    const testsIdx = parts.indexOf('tests');
    return testsIdx >= 0 ? parts.slice(testsIdx).join('/') : parts[parts.length - 1];
  },
  // Custom test type based on file patterns
  automatedTestType: (testCase) => {
    const fileName = testCase.location.file;
    
    // Check file naming patterns
    if (fileName.includes('.e2e.')) return 'End-to-End Test';
    if (fileName.includes('.integration.')) return 'Integration Test';
    if (fileName.includes('.unit.')) return 'Unit Test';
    
    // Check folder structure
    if (fileName.includes('/e2e/')) return 'End-to-End Test';
    if (fileName.includes('/integration/')) return 'Integration Test';
    if (fileName.includes('/unit/')) return 'Unit Test';
    
    return 'Functional Test';
  }
}
```

### Example 7: Environment-Specific Configuration

Different settings for different environments:

```typescript
const isCI = process.env.CI === 'true';
const isDev = process.env.NODE_ENV === 'development';

autoMarkTestCasesAsAutomated: {
  enabled: true,
  updateAutomatedTestName: true,
  updateAutomatedTestStorage: true,
  automatedTestNameFormat: 'titleWithParent',
  // In CI: use relative paths; In dev: use full paths for debugging
  automatedTestStoragePath: isCI 
    ? (testCase) => {
        // CI: relative path
        const parts = testCase.location.file.split('/');
        const testsIdx = parts.indexOf('tests');
        return testsIdx >= 0 ? parts.slice(testsIdx).join('/') : parts[parts.length - 1];
      }
    : true, // Dev: full absolute path
  // Only set test type in CI
  automatedTestType: isCI
    ? (testCase) => {
        const filePath = testCase.location.file;
        if (filePath.includes('/e2e/')) return 'End-to-End Test';
        if (filePath.includes('/integration/')) return 'Integration Test';
        return 'Unit Test';
      }
    : undefined
}
```

### Example 8: Using Test Case Properties

Access test case properties to make decisions:

```typescript
autoMarkTestCasesAsAutomated: {
  enabled: true,
  updateAutomatedTestName: true,
  updateAutomatedTestStorage: true,
  // Use test tags to determine storage format
  automatedTestStoragePath: (testCase) => {
    // Check if test has @fullpath tag
    const hasFullPathTag = testCase.tags.some(tag => tag.includes('@fullpath'));
    
    if (hasFullPathTag) {
      return testCase.location.file; // Full path
    }
    
    // Default: relative path from tests/
    const parts = testCase.location.file.split('/');
    const testsIdx = parts.indexOf('tests');
    return testsIdx >= 0 ? parts.slice(testsIdx).join('/') : parts[parts.length - 1];
  },
  // Use test title or tags to determine test type
  automatedTestType: (testCase) => {
    const title = testCase.title.toLowerCase();
    const tags = testCase.tags.map(t => t.toLowerCase());
    
    if (tags.some(t => t.includes('@e2e'))) return 'End-to-End Test';
    if (tags.some(t => t.includes('@integration'))) return 'Integration Test';
    if (tags.some(t => t.includes('@unit'))) return 'Unit Test';
    
    if (title.includes('api')) return 'API Test';
    if (title.includes('ui')) return 'UI Test';
    
    return 'Functional Test';
  }
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
✅ **Custom Path Logic** - Use callbacks to create relative paths and avoid exposing sensitive information  
✅ **Test Categorization** - Automatically categorize tests by type using custom logic  
✅ **Environment-Aware** - Different configurations for local development vs CI/CD

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

### Callback Function Issues

**Issue:** Custom `automatedTestStoragePath` callback returns undefined or throws errors

**Solutions:**
1. Always return a string value from the callback
2. Add error handling to prevent callback failures:
   ```typescript
   automatedTestStoragePath: (testCase) => {
     try {
       const parts = testCase.location.file.split('/');
       const idx = parts.indexOf('tests');
       return idx >= 0 ? parts.slice(idx).join('/') : parts[parts.length - 1];
     } catch (error) {
       console.error('Error in automatedTestStoragePath:', error);
       return testCase.location.file; // Fallback to full path
     }
   }
   ```

**Issue:** `automatedTestType` field not being set in Azure DevOps

**Solutions:**
1. Ensure the callback returns a non-empty string
2. Check that the field name is correct: `Microsoft.VSTS.TCM.AutomatedTestType`
3. Verify your Azure DevOps project supports this field (some custom process templates may not have it)
4. If the callback returns `''` or a falsy value, the field will not be set (this is by design)

### Callback Best Practices

1. **Always return a value:** Callbacks should always return a string, even if it's a fallback value
2. **Use try-catch:** Wrap callback logic in try-catch to prevent failures
3. **Keep it simple:** Complex logic in callbacks can slow down test execution
4. **Test your callbacks:** Verify callback logic works with different file paths and test structures
5. **Consider edge cases:** Handle cases where expected folders/patterns don't exist

**Example with error handling:**
```typescript
autoMarkTestCasesAsAutomated: {
  enabled: true,
  automatedTestStoragePath: (testCase) => {
    try {
      if (!testCase.location?.file) return 'unknown.spec.ts';
      
      const parts = testCase.location.file.split('/');
      const testsIdx = parts.indexOf('tests');
      
      if (testsIdx >= 0 && testsIdx < parts.length - 1) {
        return parts.slice(testsIdx).join('/');
      }
      
      return parts[parts.length - 1] || 'unknown.spec.ts';
    } catch (error) {
      console.error('Error in automatedTestStoragePath callback:', error);
      return testCase.location?.file || 'error.spec.ts';
    }
  },
  automatedTestType: (testCase) => {
    try {
      const filePath = testCase.location?.file || '';
      
      if (filePath.includes('/e2e/')) return 'End-to-End Test';
      if (filePath.includes('/integration/')) return 'Integration Test';
      if (filePath.includes('/unit/')) return 'Unit Test';
      
      return 'Functional Test';
    } catch (error) {
      console.error('Error in automatedTestType callback:', error);
      return 'Unknown Test';
    }
  }
}
```
