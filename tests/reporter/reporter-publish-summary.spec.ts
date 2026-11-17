import path from 'path';

import { setHeaders } from '../config/utils';
import azureAreas from './assets/azure-reporter/azureAreas';
import headers from './assets/azure-reporter/azureHeaders';
import location from './assets/azure-reporter/azureLocationOptionsResponse.json';
import { reporterPath } from './reporterPath';
import { expect, test } from './test-fixtures';

const asset = (name: string) => path.join(__dirname, 'assets', 'azure-reporter', name);

/** Azure DevOps that accepts the run but answers the results with `resultsStatus`, as for a completed run. */
function setupRoutes(server: any, resultsStatus: number) {
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
    server.serveFile(req, res, asset('azureTestOptionsResponse.json'));
  });
  server.setRoute('/_apis/core', (req: any, res: any) => {
    setHeaders(res, headers);
    server.serveFile(req, res, asset('azureCoreOptionsResponse.json'));
  });
  server.setRoute('/_apis/projects/SampleSample', (req: any, res: any) => {
    setHeaders(res, headers);
    server.serveFile(req, res, asset('projectValidResponse.json'));
  });
  server.setRoute('/SampleSample/_apis/test/Runs', (req: any, res: any) => {
    setHeaders(res, headers);
    server.serveFile(req, res, asset('createRunValidResponse.json'));
  });
  server.setRoute('/SampleSample/_apis/test/Points', (req: any, res: any) => {
    setHeaders(res, headers);
    server.serveFile(req, res, asset('points3Response.json'));
  });
  server.setRoute('/SampleSample/_apis/test/Runs/150', (req: any, res: any) => {
    setHeaders(res, headers);
    server.serveFile(req, res, asset('completeRunValidResponse.json'));
  });
  server.setRoute('/SampleSample/_apis/test/Runs/150/Results', (_: any, res: any) => {
    setHeaders(res, headers);
    res.statusCode = resultsStatus;
    res.end(
      JSON.stringify({
        message: 'TestCaseResults cannot be added or updated for a test run which is in Completed state',
        typeKey: 'InvalidPropertyException',
      })
    );
  });
}

const config = (port: number, mode: string) => `
  module.exports = {
    reporter: [
      ['line'],
      ['${reporterPath}', {
        orgUrl: 'http://localhost:${port}',
        projectName: 'SampleSample',
        planId: 4,
        token: 'token',
        logging: true,
        publishTestResultsMode: '${mode}',
      }]
    ]
  };
`;

const spec = `
  import { test, expect } from '@playwright/test';
  test('[3] foobar', async () => {
    expect(1).toBe(1);
  });
`;

test.describe('published results summary', () => {
  // Azure DevOps answers a rejected request with an error (the client throws) or with 404 (the client returns null)
  for (const [mode, status] of [
    ['testResult', 400],
    ['testResult', 404],
    ['testRun', 404],
  ] as const) {
    test(`${mode}: results that Azure DevOps rejected (${status}) are not counted as published`, async ({
      runInlineTest,
      server,
    }) => {
      setupRoutes(server, status);

      const result = await runInlineTest(
        { 'playwright.config.ts': config(server.PORT, mode), 'a.spec.js': spec },
        {
          reporter: '',
        }
      );

      expect(result.passed).toBe(1);
      expect(result.output).toContain('Test results published for 0 test(s), 0 test point(s)');
    });
  }
});
