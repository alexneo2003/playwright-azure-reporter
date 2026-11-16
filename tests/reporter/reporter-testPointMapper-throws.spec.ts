import path from 'path';

import { getRequestBody, setHeaders } from '../config/utils';
import azureAreas from './assets/azure-reporter/azureAreas';
import headers from './assets/azure-reporter/azureHeaders';
import location from './assets/azure-reporter/azureLocationOptionsResponse.json';
import { reporterPath } from './reporterPath';
import { expect, test } from './test-fixtures';

const asset = (name: string) => path.join(__dirname, 'assets', 'azure-reporter', name);

function setupRoutes(server: any) {
  const calls = { results: [] as any[], runUpdates: [] as any[] };
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
  server.setRoute('/SampleSample/_apis/test/Runs/150', async (req: any, res: any) => {
    if (req.method === 'PATCH') calls.runUpdates.push(await getRequestBody(req));
    setHeaders(res, headers);
    server.serveFile(req, res, asset('completeRunValidResponse.json'));
  });
  server.setRoute('/SampleSample/_apis/test/Runs/150/Results', async (req: any, res: any) => {
    if (req.method === 'POST') calls.results.push(...(await getRequestBody(req)));
    setHeaders(res, headers);
    server.serveFile(req, res, asset('testRunResults3ValidResponse.json'));
  });
  return calls;
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
        testPointMapper: async (testCase, testPoints) => {
          if (testCase.title.includes('unmapped')) throw new Error('invalid test configuration!');
          return testPoints;
        },
      }]
    ]
  };
`;

const spec = `
  import { test, expect } from '@playwright/test';
  // the throwing test runs first: before the fix it took the tests after it down with it
  test('[3] unmapped', async () => {
    expect(1).toBe(1);
  });
  test('[3] mapped', async () => {
    expect(1).toBe(1);
  });
`;

for (const mode of ['testResult', 'testRun']) {
  test(`${mode} mode: a testPointMapper that throws skips only that test`, async ({ runInlineTest, server }) => {
    const calls = setupRoutes(server);

    const result = await runInlineTest(
      { 'playwright.config.ts': config(server.PORT, mode), 'a.spec.js': spec },
      { reporter: '', workers: 1 }
    );

    expect(result.exitCode).toBe(0);
    expect(result.passed).toBe(2);
    expect(calls.results).toHaveLength(1);
    expect(calls.runUpdates).toEqual([{ state: 'Completed' }]);
    expect(result.output).not.toContain('Reporting is disabled');
    expect(result.output).toContain(
      'testPointMapper threw for test "[3] unmapped": invalid test configuration!. The result is not published.'
    );
  });
}
