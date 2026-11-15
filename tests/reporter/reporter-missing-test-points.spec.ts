import path from 'path';

import { getRequestBody, setHeaders } from '../config/utils';
import azureAreas from './assets/azure-reporter/azureAreas';
import headers from './assets/azure-reporter/azureHeaders';
import location from './assets/azure-reporter/azureLocationOptionsResponse.json';
import { reporterPath } from './reporterPath';
import { expect, test } from './test-fixtures';

const asset = (name: string) => path.join(__dirname, 'assets', 'azure-reporter', name);

function setupRoutes(server: any) {
  const calls = { pointQueries: [] as any[], results: [] as any[] };
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
  // test case 3 has one point: plan 4, configuration 1 (Windows 10)
  server.setRoute('/SampleSample/_apis/test/Points', async (req: any, res: any) => {
    calls.pointQueries.push(await getRequestBody(req));
    setHeaders(res, headers);
    server.serveFile(req, res, asset('points3Response.json'));
  });
  server.setRoute('/SampleSample/_apis/test/Runs/150', (req: any, res: any) => {
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

const config = (port: number, extra: string) => `
  module.exports = {
    reporter: [
      ['line'],
      ['${reporterPath}', {
        orgUrl: 'http://localhost:${port}',
        projectName: 'SampleSample',
        planId: 4,
        token: 'token',
        logging: true,
        ${extra}
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

for (const mode of ['testResult', 'testRun']) {
  test.describe(`missing test points, ${mode} mode`, () => {
    test('a test with a point makes no extra request', async ({ runInlineTest, server }) => {
      const calls = setupRoutes(server);
      const result = await runInlineTest(
        { 'playwright.config.ts': config(server.PORT, `publishTestResultsMode: '${mode}',`), 'a.spec.js': spec },
        { reporter: '' }
      );
      expect(result.exitCode).toBe(0);
      expect(calls.results).toHaveLength(1);
      expect(calls.pointQueries).toHaveLength(1);
      expect(result.output).not.toContain('No test points found');
    });

    test('names the configurations the test case has in the plan', async ({ runInlineTest, server }) => {
      const calls = setupRoutes(server);
      const result = await runInlineTest(
        {
          'playwright.config.ts': config(
            server.PORT,
            `publishTestResultsMode: '${mode}', testRunConfig: { configurationIds: [14] },`
          ),
          'a.spec.js': spec,
        },
        { reporter: '' }
      );
      expect(result.exitCode).toBe(0);
      expect(calls.results).toHaveLength(0);
      expect(result.output).toContain('No test points found for test case [3] associated with test plan 4');
      expect(result.output).toContain(
        'test case 3 has test points in plan 4 only for configurations: 1 (Windows 10); testRunConfig.configurationIds is [14].'
      );
      // the explanation looks at every configuration
      const lastQuery = calls.pointQueries[calls.pointQueries.length - 1];
      expect(lastQuery.pointsFilter).toEqual({ testcaseIds: [3] });
    });

    test('says when testPointMapper dropped the matching points', async ({ runInlineTest, server }) => {
      setupRoutes(server);
      const result = await runInlineTest(
        {
          'playwright.config.ts': config(
            server.PORT,
            `publishTestResultsMode: '${mode}', testPointMapper: async () => [],`
          ),
          'a.spec.js': spec,
        },
        { reporter: '' }
      );
      expect(result.output).toContain(
        'test case 3 has test points in plan 4 (configurations: 1 (Windows 10)), but testPointMapper returned none of them.'
      );
    });

    test('says when testPointMapper threw', async ({ runInlineTest, server }) => {
      const calls = setupRoutes(server);
      const result = await runInlineTest(
        {
          'playwright.config.ts': config(
            server.PORT,
            `publishTestResultsMode: '${mode}', testPointMapper: async () => { throw new Error('no browser'); },`
          ),
          'a.spec.js': spec,
        },
        { reporter: '' }
      );
      expect(result.output).toContain('  - testPointMapper threw: no browser');
      // nothing to look up: no second points query
      expect(calls.pointQueries).toHaveLength(1);
    });

    test('the test case summary carries the reason', async ({ runInlineTest, server }) => {
      setupRoutes(server);
      const result = await runInlineTest(
        {
          'playwright.config.ts': config(
            server.PORT,
            `publishTestResultsMode: '${mode}', planId: 44, testCaseSummary: { enabled: true, consoleOutput: true },`
          ),
          'a.spec.js': spec,
        },
        { reporter: '' }
      );
      expect(result.output).toContain('- Reason: test case 3 has test points only in other plans: 4 (planId is 44).');
    });
  });
}
