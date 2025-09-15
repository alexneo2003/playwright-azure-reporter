import { expect, test } from '@playwright/test';
import * as azdev from 'azure-devops-node-api';

import AzureDevOpsReporter from '../../src/playwright-azure-reporter';

test.describe('Token Refresh Tests', () => {
  test('should not refresh token when using pat authType', async () => {
    const reporter = new AzureDevOpsReporter({
      orgUrl: 'http://localhost:4000',
      projectName: 'TestProject',
      planId: 1,
      token: 'test-pat-token',
      authType: 'pat',
      isDisabled: false,
    });

    // Mock the credential to ensure it's not called
    let credentialCalled = false;
    (reporter as any)._credential = {
      getToken: () => {
        credentialCalled = true;
        return Promise.resolve({ token: 'new-token', expiresOnTimestamp: Date.now() + 3600000 });
      },
    };

    await (reporter as any)._refreshTokenIfNeeded();
    expect(credentialCalled).toBe(false);
  });

  test('should not refresh token when using accessToken authType', async () => {
    const reporter = new AzureDevOpsReporter({
      orgUrl: 'http://localhost:4000',
      projectName: 'TestProject',
      planId: 1,
      token: 'test-access-token',
      authType: 'accessToken',
      isDisabled: false,
    });

    // Mock the credential to ensure it's not called
    let credentialCalled = false;
    (reporter as any)._credential = {
      getToken: () => {
        credentialCalled = true;
        return Promise.resolve({ token: 'new-token', expiresOnTimestamp: Date.now() + 3600000 });
      },
    };

    await (reporter as any)._refreshTokenIfNeeded();
    expect(credentialCalled).toBe(false);
  });

  test('should not refresh token when managedIdentity but no credential available', async () => {
    const reporter = new AzureDevOpsReporter({
      orgUrl: 'http://localhost:4000',
      projectName: 'TestProject',
      planId: 1,
      authType: 'managedIdentity',
      applicationIdURI: 'https://test.vault.azure.net',
      isDisabled: false,
    });

    // Ensure no credential is set
    (reporter as any)._credential = null;

    // Should not throw any errors and should complete without issues
    await (reporter as any)._refreshTokenIfNeeded();
    expect(true).toBe(true); // Test passes if no errors thrown
  });

  test('should skip refresh when token is not close to expiring', async () => {
    const reporter = new AzureDevOpsReporter({
      orgUrl: 'http://localhost:4000',
      projectName: 'TestProject',
      planId: 1,
      authType: 'managedIdentity',
      applicationIdURI: 'https://test.vault.azure.net',
      isDisabled: false,
    });

    // Set token that expires in 1 hour (not close to expiring)
    const futureExpiry = new Date(Date.now() + 3600000); // 1 hour from now
    (reporter as any)._tokenExpiresOn = futureExpiry;
    (reporter as any)._token = 'current-token';

    let credentialCalled = false;
    (reporter as any)._credential = {
      getToken: () => {
        credentialCalled = true;
        return Promise.resolve({ token: 'new-token', expiresOnTimestamp: Date.now() + 3600000 });
      },
    };

    await (reporter as any)._refreshTokenIfNeeded();
    expect(credentialCalled).toBe(false);
  });

  test('should refresh token when no expiration time is available', async () => {
    const reporter = new AzureDevOpsReporter({
      orgUrl: 'http://localhost:4000',
      projectName: 'TestProject',
      planId: 1,
      authType: 'managedIdentity',
      applicationIdURI: 'https://test.vault.azure.net',
      isDisabled: false,
    });

    // Set no expiration time
    (reporter as any)._tokenExpiresOn = null;
    (reporter as any)._token = 'current-token';

    let credentialCalled = false;
    let newToken = 'refreshed-token';
    let newExpiry = Date.now() + 3600000;

    (reporter as any)._credential = {
      getToken: () => {
        credentialCalled = true;
        return Promise.resolve({
          token: newToken,
          expiresOnTimestamp: newExpiry,
        });
      },
    };

    // Mock the WebApi creation
    const originalGetHandlerFromToken = azdev.getHandlerFromToken;
    let handlerCreated = false;
    (azdev as any).getHandlerFromToken = (token: string) => {
      handlerCreated = true;
      expect(token).toBe(newToken);
      return originalGetHandlerFromToken(token);
    };

    try {
      await (reporter as any)._refreshTokenIfNeeded();
      expect(credentialCalled).toBe(true);
      expect(handlerCreated).toBe(true);
      expect((reporter as any)._token).toBe(newToken);
      expect((reporter as any)._tokenExpiresOn).toEqual(new Date(newExpiry));
    } finally {
      (azdev as any).getHandlerFromToken = originalGetHandlerFromToken;
    }
  });

  test('should refresh token when close to expiring (within 5 minutes)', async () => {
    const reporter = new AzureDevOpsReporter({
      orgUrl: 'http://localhost:4000',
      projectName: 'TestProject',
      planId: 1,
      authType: 'managedIdentity',
      applicationIdURI: 'https://test.vault.azure.net',
      isDisabled: false,
    });

    // Set token that expires in 2 minutes (close to expiring)
    const soonExpiry = new Date(Date.now() + 120000); // 2 minutes from now
    (reporter as any)._tokenExpiresOn = soonExpiry;
    (reporter as any)._token = 'current-token';

    let credentialCalled = false;
    let newToken = 'refreshed-token';
    let newExpiry = Date.now() + 3600000;

    (reporter as any)._credential = {
      getToken: () => {
        credentialCalled = true;
        return Promise.resolve({
          token: newToken,
          expiresOnTimestamp: newExpiry,
        });
      },
    };

    // Mock the WebApi creation
    const originalGetHandlerFromToken = azdev.getHandlerFromToken;
    let handlerCreated = false;
    (azdev as any).getHandlerFromToken = (token: string) => {
      handlerCreated = true;
      expect(token).toBe(newToken);
      return originalGetHandlerFromToken(token);
    };

    try {
      await (reporter as any)._refreshTokenIfNeeded();
      expect(credentialCalled).toBe(true);
      expect(handlerCreated).toBe(true);
      expect((reporter as any)._token).toBe(newToken);
      expect((reporter as any)._tokenExpiresOn).toEqual(new Date(newExpiry));
    } finally {
      (azdev as any).getHandlerFromToken = originalGetHandlerFromToken;
    }
  });

  test('should not update connection when token unchanged after refresh', async () => {
    const reporter = new AzureDevOpsReporter({
      orgUrl: 'http://localhost:4000',
      projectName: 'TestProject',
      planId: 1,
      authType: 'managedIdentity',
      applicationIdURI: 'https://test.vault.azure.net',
      isDisabled: false,
    });

    // Set token that expires soon
    const soonExpiry = new Date(Date.now() + 120000); // 2 minutes from now
    const currentToken = 'current-token';
    (reporter as any)._tokenExpiresOn = soonExpiry;
    (reporter as any)._token = currentToken;

    let credentialCalled = false;
    (reporter as any)._credential = {
      getToken: () => {
        credentialCalled = true;
        // Return same token (no refresh needed)
        return Promise.resolve({
          token: currentToken,
          expiresOnTimestamp: Date.now() + 3600000,
        });
      },
    };

    // Mock to ensure WebApi is not recreated
    const originalGetHandlerFromToken = azdev.getHandlerFromToken;
    let handlerCreated = false;
    (azdev as any).getHandlerFromToken = () => {
      handlerCreated = true;
      return originalGetHandlerFromToken('test');
    };

    try {
      await (reporter as any)._refreshTokenIfNeeded();
      expect(credentialCalled).toBe(true);
      expect(handlerCreated).toBe(false); // Should not create new handler for same token
      expect((reporter as any)._token).toBe(currentToken);
    } finally {
      (azdev as any).getHandlerFromToken = originalGetHandlerFromToken;
    }
  });

  test('should handle token refresh errors gracefully', async () => {
    const reporter = new AzureDevOpsReporter({
      orgUrl: 'http://localhost:4000',
      projectName: 'TestProject',
      planId: 1,
      authType: 'managedIdentity',
      applicationIdURI: 'https://test.vault.azure.net',
      isDisabled: false,
    });

    // Set token that expires soon
    const soonExpiry = new Date(Date.now() + 120000); // 2 minutes from now
    (reporter as any)._tokenExpiresOn = soonExpiry;
    (reporter as any)._token = 'current-token';

    (reporter as any)._credential = {
      getToken: () => {
        throw new Error('Failed to refresh token');
      },
    };

    // Should not throw error, should handle gracefully
    await expect((reporter as any)._refreshTokenIfNeeded()).resolves.toBeUndefined();
  });

  test('should refresh token when expiration time is exactly at threshold', async () => {
    const reporter = new AzureDevOpsReporter({
      orgUrl: 'http://localhost:4000',
      projectName: 'TestProject',
      planId: 1,
      authType: 'managedIdentity',
      applicationIdURI: 'https://test.vault.azure.net',
      isDisabled: false,
    });

    // Set token that expires in exactly 5 minutes (at threshold)
    const thresholdExpiry = new Date(Date.now() + 300000); // 5 minutes from now
    (reporter as any)._tokenExpiresOn = thresholdExpiry;
    (reporter as any)._token = 'current-token';

    let credentialCalled = false;
    (reporter as any)._credential = {
      getToken: () => {
        credentialCalled = true;
        return Promise.resolve({
          token: 'refreshed-token',
          expiresOnTimestamp: Date.now() + 3600000,
        });
      },
    };

    await (reporter as any)._refreshTokenIfNeeded();
    expect(credentialCalled).toBe(true);
  });

  test('should handle missing expiresOnTimestamp in token response', async () => {
    const reporter = new AzureDevOpsReporter({
      orgUrl: 'http://localhost:4000',
      projectName: 'TestProject',
      planId: 1,
      authType: 'managedIdentity',
      applicationIdURI: 'https://test.vault.azure.net',
      isDisabled: false,
    });

    // Set no expiration time to force refresh
    (reporter as any)._tokenExpiresOn = null;
    (reporter as any)._token = 'current-token';

    let credentialCalled = false;
    (reporter as any)._credential = {
      getToken: () => {
        credentialCalled = true;
        // Return token response without expiresOnTimestamp
        return Promise.resolve({
          token: 'new-token',
          // No expiresOnTimestamp property
        });
      },
    };

    await (reporter as any)._refreshTokenIfNeeded();
    expect(credentialCalled).toBe(true);
    expect((reporter as any)._token).toBe('new-token');
    expect((reporter as any)._tokenExpiresOn).toBeUndefined();
  });
});
