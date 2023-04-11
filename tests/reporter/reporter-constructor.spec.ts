import path from 'path';

import { setHeaders } from '../config/utils';
import azureAreas from './assets/azure-reporter/azureAreas';
import headers from './assets/azure-reporter/azureHeaders';
import location from './assets/azure-reporter/azureLocationOptionsResponse.json';
import { expect, test } from "./test-fixtures";

const TEST_OPTIONS_RESPONSE_PATH = path.join(__dirname, '.', 'assets', 'azure-reporter', 'azureTestOptionsResponse.json');
const CORE_OPTIONS_RESPONSE_PATH = path.join(__dirname, '.', 'assets', 'azure-reporter', 'azureCoreOptionsResponse.json');
const PROJECT_INVALID_RESPONSE_PATH = path.join(__dirname, '.', 'assets', 'azure-reporter', 'projectInvalidResponse.json');
const CREATE_RUN_INVALID_RESPONSE_PATH = path.join(__dirname, '.', 'assets', 'azure-reporter', 'createRunInvalidResponse.json');

const reporterPath = path.join(__dirname, '../../src/playwright-azure-reporter.ts')

test.describe("Reporter constructor", () => {
  test("'orgUrl' in config expected", async ({ runInlineTest }) => {
    const result = await runInlineTest({
      'playwright.config.ts': `
        module.exports = { 
          reporter: [
            ['line'],
            ['${reporterPath}']
          ]
        };
      `,
      'a.spec.js': `
        import { test, expect } from '@playwright/test';
        test('foobar', async () => {
          expect(1).toBe(0);
        });
      `
    }, { reporter: '' });
    
    expect(result.output).toContain("azure: 'orgUrl' is not set. Reporting is disabled.");
    expect(result.exitCode).toBe(1);
    expect(result.failed).toBe(1);
  });

  test("'projectName' in config expected", async ({ runInlineTest }) => {
    const result = await runInlineTest({
      'playwright.config.ts': `
        module.exports = { 
          reporter: [
            ['line'],
            ['${reporterPath}', { 
              orgUrl: 'http://azure.devops.com' 
            }]
          ]
        };
      `,
      'a.spec.js': `
        import { test, expect } from '@playwright/test';
        test('foobar', async ({}) => {
          expect(1).toBe(0);
        });
      `
    }, { reporter: '' });
    expect(result.output).toContain("azure: 'projectName' is not set. Reporting is disabled.");
    expect(result.exitCode).toBe(1);
    expect(result.failed).toBe(1);
  });

  test("'planId' in config expected", async ({ runInlineTest }) => {
    const result = await runInlineTest({
      'playwright.config.ts': `
        module.exports = { 
          reporter: [
            ['line'],
            ['${reporterPath}', { 
              orgUrl: 'http://azure.devops.com',
              projectName: 'test',
            }]
          ]
        };
      `,
      'a.spec.js': `
        import { test, expect } from '@playwright/test';
        test('foobar', async ({}) => {
          expect(1).toBe(0);
        });
      `
    }, { reporter: '' });
    expect(result.output).toContain("azure: 'planId' is not set. Reporting is disabled.");
    expect(result.exitCode).toBe(1);
    expect(result.failed).toBe(1);
  });

  test("'token' in config expected", async ({ runInlineTest }) => {
    const result = await runInlineTest({
      'playwright.config.ts': `
        module.exports = { 
          reporter: [
            ['line'],
            ['${reporterPath}', { 
              orgUrl: 'http://azure.devops.com',
              projectName: 'test',
              planId: 231
            }]
          ]
        };
      `,
      'a.spec.js': `
        import { test, expect } from '@playwright/test';
        test('foobar', async ({}) => {
          expect(1).toBe(0);
        });
      `
    }, { reporter: '' });
    expect(result.output).toContain("azure: 'token' is not set. Reporting is disabled.");
    expect(result.exitCode).toBe(1);
    expect(result.failed).toBe(1);
  });

  test('correct orgUrl config expected', async ({ runInlineTest }) => {
    const result = await runInlineTest({
      'playwright.config.ts': `
        module.exports = { 
          reporter: [
            ['dot'],
            ['${reporterPath}', { 
              orgUrl: 'http://fake.azure.devops.com',
              projectName: 'test',
              planId: 231,
              token: 'token',
            }]
          ]
        };
      `,
      'a.spec.js': `
        import { test, expect } from '@playwright/test';
        test('foobar', async ({}) => {
          throw new Error('foobar')
        });
      `
    }, { reporter: '' });
    expect(result.output).toContain('Failed to create test run. Check your orgUrl. Reporting is disabled.');
    expect(result.failed).toBe(1);
  });
  
  test('correct orgUrl config, incorrect token', async ({ runInlineTest, server }) => {
    server.setRoute('/_apis/Location', (_, res) => {
      setHeaders(res, headers);
      res.statusCode = 401;
      res.end('');
    });

    const result = await runInlineTest({
      'playwright.config.ts': `
        module.exports = {
          reporter: [
            ['line'],
            ['${reporterPath}', {
              orgUrl: 'http://localhost:${server.PORT}',
              projectName: 'test',
              planId: 231,
              token: 'token',
            }]
          ]
        };
      `,
      'a.spec.js': `
        import { test, expect } from '@playwright/test';
        test('foobar', async ({}) => {
          expect(1).toBe(0);
        });
      `
    }, { reporter: '' });
    expect(result.output).toContain('azure: Failed to create test run. Check your token. Reporting is disabled.');
    expect(result.exitCode).toBe(1);
    expect(result.failed).toBe(1);
  });

  test('incorrect project name', async ({ runInlineTest, server }) => {
    server.setRoute('/_apis/Location', (_, res) => {
      setHeaders(res, headers);
      res.end(JSON.stringify(location));
    });

    server.setRoute('/_apis/ResourceAreas', (_, res) => {
      setHeaders(res, headers);
      res.end(JSON.stringify(azureAreas(server.PORT)));
    });

    server.setRoute('/_apis/Test', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, TEST_OPTIONS_RESPONSE_PATH);
    });

    server.setRoute('/_apis/core', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, CORE_OPTIONS_RESPONSE_PATH);
    });

    server.setRoute('/_apis/projects/SampleSample', (req, res) => {
      setHeaders(res, headers);
      res.statusCode = 404;
      server.serveFile(req, res, PROJECT_INVALID_RESPONSE_PATH);
    });

    server.setRoute('/SampleSample/_apis/test/Runs', (req, res) => {
      setHeaders(res, headers);
      res.statusCode = 404;
      server.serveFile(req, res, CREATE_RUN_INVALID_RESPONSE_PATH);
    });

    const result = await runInlineTest({
      'playwright.config.ts': `
        module.exports = { 
          reporter: [
            ['dot'],
            ['${reporterPath}', { 
              orgUrl: 'http://localhost:${server.PORT}',
              projectName: 'SampleSample',
              planId: 4,
              token: 'token',
            }]
          ]
        };
      `,
      'a.spec.js': `
        import { test, expect } from '@playwright/test';
        test('[3] foobar', async () => {
          expect(1).toBe(0);
        });
      `
    }, { reporter: '' });

    expect(result.output).not.toContain('Failed request: (401)');
    expect(result.output).toContain('azure: Project SampleSample does not exist. Reporting is disabled.');
    expect(result.output).toContain('azure: Failed to create test run. Reporting is disabled.');
    expect(result.output).not.toContain('azure: Using run');
    expect(result.output).not.toContain('azure: Start publishing:');
    expect(result.exitCode).toBe(1);
    expect(result.failed).toBe(1);
  });

  test('disabled reporter', async ({ runInlineTest, server }) => {
    server.setRoute('/_apis/Location', (_, res) => {
      setHeaders(res, headers);
      res.end(JSON.stringify(location));
    });

    server.setRoute('/_apis/ResourceAreas', (_, res) => {
      setHeaders(res, headers);
      res.end(JSON.stringify(azureAreas(server.PORT)));
    });

    server.setRoute('/_apis/Test', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, TEST_OPTIONS_RESPONSE_PATH);
    });

    server.setRoute('/_apis/core', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, CORE_OPTIONS_RESPONSE_PATH);
    });

    const result = await runInlineTest({
      'playwright.config.ts': `
        module.exports = { 
          reporter: [
            ['dot'],
            ['${reporterPath}', { 
              orgUrl: 'http://localhost:${server.PORT}',
              projectName: 'SampleSample',
              planId: 4,
              token: 'token',
              isDisabled: true,
            }]
          ]
        };
      `,
      'a.spec.js': `
        import { test, expect } from '@playwright/test';
        test('[3] foobar', async () => {
          expect(1).toBe(1);
        });
        `
    }, { reporter: '' });

    expect(result.output).not.toContain('Failed request: (401)');
    expect(result.output).not.toContain('azure:');
    expect(result.exitCode).toBe(0);
    expect(result.passed).toBe(1);
  });
});