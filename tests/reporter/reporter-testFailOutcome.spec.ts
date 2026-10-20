import path from 'path';

import { getRequestBody, setHeaders } from '../config/utils';
import azureAreas from './assets/azure-reporter/azureAreas';
import headers from './assets/azure-reporter/azureHeaders';
import location from './assets/azure-reporter/azureLocationOptionsResponse.json';
import { reporterPath } from './reporterPath';
import { expect, test } from './test-fixtures';

const ASSETS = path.join(__dirname, '.', 'assets', 'azure-reporter');
const TEST_OPTIONS_RESPONSE_PATH = path.join(ASSETS, 'azureTestOptionsResponse.json');
const CORE_OPTIONS_RESPONSE_PATH = path.join(ASSETS, 'azureCoreOptionsResponse.json');
const PROJECT_VALID_RESPONSE_PATH = path.join(ASSETS, 'projectValidResponse.json');
const CREATE_RUN_VALID_RESPONSE_PATH = path.join(ASSETS, 'createRunValidResponse.json');
const POINTS_3_VALID_RESPONSE_PATH = path.join(ASSETS, 'points3Response.json');
const COMPLETE_RUN_VALID_RESPONSE_PATH = path.join(ASSETS, 'completeRunValidResponse.json');
const TEST_RUN_RESULTS_3_VALID_RESPONSE_PATH = path.join(ASSETS, 'testRunResults3ValidResponse.json');

function setupRoutes(server: any, publishedResults: any[]) {
  server.setRoute('/_apis/Location', (_: any, res: any) => {
    setHeaders(res, headers);
    res.end(JSON.stringify(location));
  });
  server.setRoute('/_apis/ResourceAreas', (_: any, res: any) => {
    setHeaders(res, headers);
    res.end(JSON.stringify(azureAreas(server.PORT)));
  });
  server.setRoute('/_apis/Test', (req: any, res: any) => {
    setHeaders(res, headers);
    server.serveFile(req, res, TEST_OPTIONS_RESPONSE_PATH);
  });
  server.setRoute('/_apis/core', (req: any, res: any) => {
    setHeaders(res, headers);
    server.serveFile(req, res, CORE_OPTIONS_RESPONSE_PATH);
  });
  server.setRoute('/_apis/projects/SampleSample', (req: any, res: any) => {
    setHeaders(res, headers);
    server.serveFile(req, res, PROJECT_VALID_RESPONSE_PATH);
  });
  server.setRoute('/SampleSample/_apis/test/Runs', (req: any, res: any) => {
    setHeaders(res, headers);
    server.serveFile(req, res, CREATE_RUN_VALID_RESPONSE_PATH);
  });
  server.setRoute('/SampleSample/_apis/test/Points', (req: any, res: any) => {
    setHeaders(res, headers);
    server.serveFile(req, res, POINTS_3_VALID_RESPONSE_PATH);
  });
  server.setRoute('/SampleSample/_apis/test/Runs/150', (req: any, res: any) => {
    setHeaders(res, headers);
    server.serveFile(req, res, COMPLETE_RUN_VALID_RESPONSE_PATH);
  });
  server.setRoute('/SampleSample/_apis/test/Runs/150/Results', (req: any, res: any) => {
    getRequestBody(req).then((body: any) => {
      publishedResults.push(...body);
    });
    setHeaders(res, headers);
    server.serveFile(req, res, TEST_RUN_RESULTS_3_VALID_RESPONSE_PATH);
  });
}

function config(port: number, testFailOutcome?: string): string {
  return `
    module.exports = {
      reporter: [
        ['line'],
        ['${reporterPath}', {
          orgUrl: 'http://localhost:${port}',
          projectName: 'SampleSample',
          planId: 4,
          token: 'token',
          logging: true,
          ${testFailOutcome ? `testFailOutcome: '${testFailOutcome}',` : ''}
        }]
      ]
    };
  `;
}

const FAILS_AS_DECLARED = `
  import { test, expect } from '@playwright/test';
  test('[3] known bug', async ({}) => {
    test.fail();
    expect(1).toBe(0);
  });
`;

const PASSES_UNEXPECTEDLY = `
  import { test, expect } from '@playwright/test';
  test('[3] fixed bug', async ({}) => {
    test.fail();
    expect(1).toBe(1);
  });
`;

test.describe('testFailOutcome', () => {
  test("'outcome' (default): a test.fail() test that fails is published as Passed", async ({
    runInlineTest,
    server,
  }) => {
    const publishedResults: any[] = [];
    setupRoutes(server, publishedResults);

    const result = await runInlineTest(
      { 'playwright.config.ts': config(server.PORT), 'a.spec.js': FAILS_AS_DECLARED },
      { reporter: '' }
    );

    expect(result.exitCode).toBe(0);
    expect(publishedResults.length).toBe(1);
    expect(publishedResults[0].outcome).toBe('Passed');
  });

  test("'actual': a test.fail() test that fails is published as Failed with its error", async ({
    runInlineTest,
    server,
  }) => {
    const publishedResults: any[] = [];
    setupRoutes(server, publishedResults);

    const result = await runInlineTest(
      { 'playwright.config.ts': config(server.PORT, 'actual'), 'a.spec.js': FAILS_AS_DECLARED },
      { reporter: '' }
    );

    expect(result.exitCode).toBe(0);
    expect(publishedResults.length).toBe(1);
    expect(publishedResults[0].outcome).toBe('Failed');
    expect(publishedResults[0].errorMessage).toContain('[3] known bug:');
    expect(publishedResults[0].errorMessage).toContain('toBe');
  });

  test("'actual': a test.fail() test that passes is published as Failed with 'Expected to fail, but passed.'", async ({
    runInlineTest,
    server,
  }) => {
    const publishedResults: any[] = [];
    setupRoutes(server, publishedResults);

    const result = await runInlineTest(
      { 'playwright.config.ts': config(server.PORT, 'actual'), 'a.spec.js': PASSES_UNEXPECTEDLY },
      { reporter: '' }
    );

    expect(result.exitCode).toBe(1);
    expect(publishedResults.length).toBe(1);
    expect(publishedResults[0].outcome).toBe('Failed');
    expect(publishedResults[0].errorMessage).toBe('[3] fixed bug:\n\nExpected to fail, but passed.');
  });

  test("'actual': a test without test.fail() is published as before", async ({ runInlineTest, server }) => {
    const publishedResults: any[] = [];
    setupRoutes(server, publishedResults);

    const result = await runInlineTest(
      {
        'playwright.config.ts': config(server.PORT, 'actual'),
        'a.spec.js': `
          import { test, expect } from '@playwright/test';
          test('[3] passing', async ({}) => {
            expect(1).toBe(1);
          });
        `,
      },
      { reporter: '' }
    );

    expect(result.exitCode).toBe(0);
    expect(publishedResults.length).toBe(1);
    expect(publishedResults[0].outcome).toBe('Passed');
    expect(publishedResults[0].errorMessage).toBeUndefined();
  });
});
