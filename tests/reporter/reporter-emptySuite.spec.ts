import path from 'path';

import { getRequestBody, setHeaders } from '../config/utils';
import azureAreas from './assets/azure-reporter/azureAreas';
import headers from './assets/azure-reporter/azureHeaders';
import location from './assets/azure-reporter/azureLocationOptionsResponse.json';
import { reporterPath } from './reporterPath';
import { expect, test } from './test-fixtures';

const asset = (name: string) => path.join(__dirname, 'assets', 'azure-reporter', name);

type Calls = {
  runsCreated: number;
  resultsPosted: number;
  runUpdates: any[];
  attachments: Array<{ fileName: string; text: string }>;
};

function setupRoutes(server: any): Calls {
  const calls: Calls = { runsCreated: 0, resultsPosted: 0, runUpdates: [], attachments: [] };
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
    calls.runsCreated++;
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
  server.setRoute('/SampleSample/_apis/test/Runs/150/Results', (req: any, res: any) => {
    if (req.method === 'POST') calls.resultsPosted++;
    setHeaders(res, headers);
    server.serveFile(req, res, asset('testRunResults3ValidResponse.json'));
  });
  server.setRoute('/SampleSample/_apis/test/Runs/150/Attachments', async (req: any, res: any) => {
    const body = await getRequestBody(req);
    calls.attachments.push({ fileName: body.fileName, text: Buffer.from(body.stream, 'base64').toString('utf8') });
    setHeaders(res, headers);
    res.end(
      JSON.stringify({ id: 42, url: `http://localhost:${server.PORT}/SampleSample/_apis/test/Runs/150/Attachments/42` })
    );
  });
  return calls;
}

const reporterConfig = (port: number, extra = '', config = '') => `
  module.exports = {
    ${config}
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

const passingSpec = `
  import { test, expect } from '@playwright/test';
  test('[3] foobar', async ({}) => {
    expect(1).toBe(1);
  });
`;

const globalSetupFile = `
  module.exports = async () => {
    throw new Error('global setup exploded');
  };
`;
const globalSetupConfig = "globalSetup: require.resolve('./global-setup.js'),";

test.describe('Empty suite (testResult mode)', () => {
  test('creates no test run when no test matches', async ({ runInlineTest, server }) => {
    const calls = setupRoutes(server);

    const result = await runInlineTest(
      { 'playwright.config.ts': reporterConfig(server.PORT), 'a.spec.js': passingSpec },
      { reporter: '', grep: 'no-such-test' }
    );

    expect(result.output).toContain('azure:pw:log No tests to run. Test run is not created.');
    expect(result.output).not.toContain('Using run');
    expect(calls.runsCreated).toBe(0);
    expect(calls.runUpdates).toEqual([]);
  });

  test('no test matches with publishGlobalErrors on: the run carries "No tests found"', async ({
    runInlineTest,
    server,
  }) => {
    const calls = setupRoutes(server);

    const result = await runInlineTest(
      { 'playwright.config.ts': reporterConfig(server.PORT, 'publishGlobalErrors: true,'), 'a.spec.js': passingSpec },
      { reporter: '', grep: 'no-such-test' }
    );

    expect(result.exitCode).toBe(1);
    expect(calls.runsCreated).toBe(1);
    expect(calls.resultsPosted).toBe(0);
    expect(calls.attachments).toHaveLength(1);
    expect(calls.attachments[0].text).toContain('No tests found');
  });

  test('no test matches with --pass-with-no-tests and publishGlobalErrors on: no test run is created', async ({
    runInlineTest,
    server,
  }) => {
    const calls = setupRoutes(server);

    const result = await runInlineTest(
      { 'playwright.config.ts': reporterConfig(server.PORT, 'publishGlobalErrors: true,'), 'a.spec.js': passingSpec },
      { reporter: '', grep: 'no-such-test', 'pass-with-no-tests': true }
    );

    expect(result.exitCode).toBe(0);
    expect(calls.runsCreated).toBe(0);
    expect(calls.runUpdates).toEqual([]);
  });

  test('creates a test run when a test matches', async ({ runInlineTest, server }) => {
    const calls = setupRoutes(server);

    const result = await runInlineTest(
      { 'playwright.config.ts': reporterConfig(server.PORT), 'a.spec.js': passingSpec },
      { reporter: '' }
    );

    expect(result.exitCode).toBe(0);
    expect(result.output).not.toContain('No tests to run');
    expect(result.output).toContain('azure:pw:log Using run 150 to publish test results');
    expect(calls.runsCreated).toBe(1);
    expect(calls.resultsPosted).toBe(1);
  });

  test('globalSetup failure with publishGlobalErrors on: a run is created at the end to carry the error', async ({
    runInlineTest,
    server,
  }) => {
    const calls = setupRoutes(server);

    const result = await runInlineTest(
      {
        'playwright.config.ts': reporterConfig(server.PORT, 'publishGlobalErrors: true,', globalSetupConfig),
        'global-setup.js': globalSetupFile,
        'a.spec.js': passingSpec,
      },
      { reporter: '' }
    );

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('azure:pw:log No tests to run. Test run is not created.');
    expect(calls.runsCreated).toBe(1);
    expect(calls.resultsPosted).toBe(0);
    expect(calls.attachments).toHaveLength(1);
    expect(calls.attachments[0].text).toContain('global setup exploded');
    expect(calls.runUpdates).toHaveLength(1);
    expect(calls.runUpdates[0].state).toBe('Completed');
    expect(calls.runUpdates[0].errorMessage).toContain('global setup exploded');
  });

  test('globalSetup failure without publishGlobalErrors: no test run is created', async ({ runInlineTest, server }) => {
    const calls = setupRoutes(server);

    const result = await runInlineTest(
      {
        'playwright.config.ts': reporterConfig(server.PORT, '', globalSetupConfig),
        'global-setup.js': globalSetupFile,
        'a.spec.js': passingSpec,
      },
      { reporter: '' }
    );

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('azure:pw:log No tests to run. Test run is not created.');
    expect(calls.runsCreated).toBe(0);
    expect(calls.runUpdates).toEqual([]);
  });
});
