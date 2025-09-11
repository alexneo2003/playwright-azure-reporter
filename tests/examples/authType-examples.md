# Authentication Type Examples

This document provides examples of how to use the new `authType` configuration option in the Azure DevOps Playwright Reporter.

## Overview

The reporter now supports two authentication types:

- `pat` (Personal Access Token) - Default
- `accessToken` (Access Token from Azure DevOps API)

## Examples

### Using Personal Access Token (Default)

```typescript
// playwright.config.ts
export default {
  reporter: [
    [
      '@alexneo2003/playwright-azure-reporter',
      {
        orgUrl: 'https://dev.azure.com/your-org',
        projectName: 'your-project',
        planId: 123,
        token: 'your-personal-access-token',
        authType: 'pat', // Optional, this is the default
      },
    ],
  ],
};
```

### Using Access Token

```typescript
// playwright.config.ts
export default {
  reporter: [
    [
      '@alexneo2003/playwright-azure-reporter',
      {
        orgUrl: 'https://dev.azure.com/your-org',
        projectName: 'your-project',
        planId: 123,
        token: 'your-access-token',
        authType: 'accessToken',
      },
    ],
  ],
};
```

### Default Behavior (PAT)

```typescript
// playwright.config.ts
export default {
  reporter: [
    [
      '@alexneo2003/playwright-azure-reporter',
      {
        orgUrl: 'https://dev.azure.com/your-org',
        projectName: 'your-project',
        planId: 123,
        token: 'your-personal-access-token',
        // authType not specified - defaults to 'pat'
      },
    ],
  ],
};
```

## When to Use Each Type

### Personal Access Token (`pat`)

- Use when you have a PAT generated from Azure DevOps
- Suitable for most individual use cases
- Default behavior for backward compatibility

### Access Token (`accessToken`)

- Use when you have an OAuth access token
- Suitable for applications using Azure DevOps OAuth flows
- Useful in CI/CD environments with token-based authentication

## Notes

- If an invalid `authType` is provided, the reporter will use `getHandlerFromToken` (same as `accessToken`)
- The `authType` field is optional and defaults to `'pat'` for backward compatibility
- Both authentication types use the same `token` field, but interpret it differently internally

## Required Token Permissions

Regardless of which authentication type you use, your token must have the following Azure DevOps permissions:

### Required Scopes

- **Test Management (Read & Write)** - For creating test runs, publishing results, and managing test data
- **Project and Team (Read)** - For accessing project information and validation

### Setting Up Personal Access Token

1. Go to Azure DevOps → User Settings → Personal Access Tokens
2. Create a new token with the following scopes:
   - `Test Management: Read & write`
   - `Project and Team: Read`
3. Use the generated token in your configuration

### Setting Up OAuth Access Token

Ensure your OAuth application requests the following scopes:

- `vso.test_write` - For test management operations
- `vso.project` - For project access

### Troubleshooting

If you encounter authentication errors, verify that:

- Your token has the required scopes
- The token hasn't expired
- Your organization URL is correct
- The project name exists and is accessible with your token
