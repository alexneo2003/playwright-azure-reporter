import { PlaywrightTestConfig } from '@playwright/test';
import { TestCase } from '@playwright/test/reporter';
import { TestPoint } from 'azure-devops-node-api/interfaces/TestInterfaces';
import dotenv from 'dotenv';

import { AzureReporterOptions } from './dist/playwright-azure-reporter';

dotenv.config();

/**
 * See https://playwright.dev/docs/test-configuration.
 */
const config: PlaywrightTestConfig = {
  testDir: './tests',
  testIgnore: ['**/config/**', '**/reporter/**'],
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
      './src/playwright-azure-reporter.ts',
      {
        orgUrl: process.env.AZURE_PW_ORGURL,
        token: process.env.AZURE_PW_TOKEN,
        planId: process.env.AZURE_PW_PLANID ? parseInt(process.env.AZURE_PW_PLANID) : 1,
        projectName: process.env.AZURE_PW_PROJECTNAME,
        environment: 'AQA',
        testRunTitle: 'Playwright Test Run',
        uploadAttachments: true,
        logging: true,
        attachmentsType: ['screenshot', 'trace', /test.*/],
        publishTestResultsMode: 'testRun',
        testRunConfig: {
          configurationIds: [1],
          owner: {
            displayName: 'Alex Neo',
          },
          comment: 'Playwright Test Run',
        },
        testPointMapper: async (testCase: TestCase, testPoints: TestPoint[]) => {
          switch (testCase.parent.project()?.use.browserName) {
            case 'chromium':
              return testPoints.filter((testPoint) => testPoint.configuration.id === '3');
            case 'firefox':
              return testPoints.filter((testPoint) => testPoint.configuration.id === '4');
            case 'webkit':
              return testPoints.filter((testPoint) => testPoint.configuration.id === '5');
            default:
              throw new Error('invalid test configuration!');
          }
        },
      } as AzureReporterOptions,
    ],
  ],
  use: {
    screenshot: 'only-on-failure',
    actionTimeout: 0,
    trace: 'retain-on-failure',
  },
};

export default config;
