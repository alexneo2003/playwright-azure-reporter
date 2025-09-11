import { expect, test } from '@playwright/test';
import * as azdev from 'azure-devops-node-api';

import AzureDevOpsReporter from '../../src/playwright-azure-reporter';

test.describe('Authentication Handler Creation', () => {
  test('should call getPersonalAccessTokenHandler for pat authType', () => {
    // Store original function
    const originalGetPersonalAccessTokenHandler = azdev.getPersonalAccessTokenHandler;
    let handlerCreated = false;

    // Mock the function
    (azdev as any).getPersonalAccessTokenHandler = (token: string) => {
      handlerCreated = true;
      expect(token).toBe('test-pat-token');
      return originalGetPersonalAccessTokenHandler(token);
    };

    try {
      new AzureDevOpsReporter({
        orgUrl: 'http://localhost:4000',
        projectName: 'TestProject',
        planId: 1,
        token: 'test-pat-token',
        authType: 'pat',
        isDisabled: false,
      });

      expect(handlerCreated).toBe(true);
    } finally {
      // Restore original function
      (azdev as any).getPersonalAccessTokenHandler = originalGetPersonalAccessTokenHandler;
    }
  });

  test('should call getHandlerFromToken for accessToken authType', () => {
    // Store original function
    const originalGetHandlerFromToken = azdev.getHandlerFromToken;
    let handlerCreated = false;

    // Mock the function
    (azdev as any).getHandlerFromToken = (token: string) => {
      handlerCreated = true;
      expect(token).toBe('test-access-token');
      return originalGetHandlerFromToken(token);
    };

    try {
      new AzureDevOpsReporter({
        orgUrl: 'http://localhost:4000',
        projectName: 'TestProject',
        planId: 1,
        token: 'test-access-token',
        authType: 'accessToken',
        isDisabled: false,
      });

      expect(handlerCreated).toBe(true);
    } finally {
      // Restore original function
      (azdev as any).getHandlerFromToken = originalGetHandlerFromToken;
    }
  });

  test('should call getPersonalAccessTokenHandler by default', () => {
    // Store original function
    const originalGetPersonalAccessTokenHandler = azdev.getPersonalAccessTokenHandler;
    let handlerCreated = false;

    // Mock the function
    (azdev as any).getPersonalAccessTokenHandler = (token: string) => {
      handlerCreated = true;
      expect(token).toBe('test-default-token');
      return originalGetPersonalAccessTokenHandler(token);
    };

    try {
      new AzureDevOpsReporter({
        orgUrl: 'http://localhost:4000',
        projectName: 'TestProject',
        planId: 1,
        token: 'test-default-token',
        // authType not specified
        isDisabled: false,
      });

      expect(handlerCreated).toBe(true);
    } finally {
      // Restore original function
      (azdev as any).getPersonalAccessTokenHandler = originalGetPersonalAccessTokenHandler;
    }
  });
});
