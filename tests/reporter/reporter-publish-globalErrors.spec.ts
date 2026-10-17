import path from 'path';

import { getRequestBody, setHeaders } from '../config/utils';
import azureAreas from './assets/azure-reporter/azureAreas';
import headers from './assets/azure-reporter/azureHeaders';
import location from './assets/azure-reporter/azureLocationOptionsResponse.json';
import { reporterPath } from './reporterPath';
import { expect, test } from './test-fixtures';

const asset = (name: string) => path.join(__dirname, 'assets', 'azure-reporter', name);

// eslint-disable-next-line @typescript-eslint/no-require-imports
const [major, minor] = (require('@playwright/test/package.json').version as string)
  .split('.')
  .map((n: string) => parseInt(n, 10));
const hasWorkerInfo = major > 1 || (major === 1 && minor >= 60);

type Calls = {
  runsCreated: number;
  resultsPosted: number;
  runUpdates: any[];
  attachments: Array<{ fileName: string; comment: string; text: string }>;
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
    calls.attachments.push({
      fileName: body.fileName,
      comment: body.comment,
      text: Buffer.from(body.stream, 'base64').toString('utf8'),
    });
    setHeaders(res, headers);
    res.end(
      JSON.stringify({ id: 42, url: `http://localhost:${server.PORT}/SampleSample/_apis/test/Runs/150/Attachments/42` })
    );
  });
  return calls;
}

const reporterConfig = (port: number, extra: string, config = '') => `
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
  test('[3] foobar', async () => {
    expect(1).toBe(1);
  });
`;

const workerTeardownSpec = `
  import { test as base, expect } from '@playwright/test';
  const test = base.extend({
    broken: [async ({}, use) => {
      await use(1);
      throw new Error('worker teardown exploded');
    }, { scope: 'worker' }],
  });
  test('[3] foobar', async ({ broken }) => {
    expect(broken).toBe(1);
  });
`;

const globalSetupFile = `
  module.exports = async () => {
    throw new Error('global setup exploded');
  };
`;
const globalSetupConfig = "globalSetup: require.resolve('./global-setup.js'),";

test.describe('publishGlobalErrors', () => {
  test('off by default: no error message, no attachment', async ({ runInlineTest, server }) => {
    const calls = setupRoutes(server);

    const result = await runInlineTest(
      { 'playwright.config.ts': reporterConfig(server.PORT, ''), 'a.spec.js': workerTeardownSpec },
      { reporter: '' }
    );

    expect(result.exitCode).toBe(1);
    expect(calls.attachments).toEqual([]);
    expect(calls.runUpdates).toEqual([{ state: 'Completed' }]);
  });

  test('worker teardown error: tests stay passed, the run gets errorMessage and the report', async ({
    runInlineTest,
    server,
  }) => {
    const calls = setupRoutes(server);

    const result = await runInlineTest(
      {
        'playwright.config.ts': reporterConfig(server.PORT, 'publishGlobalErrors: true,'),
        'a.spec.js': workerTeardownSpec,
      },
      { reporter: '' }
    );

    expect(result.exitCode).toBe(1);
    expect(result.passed).toBe(1);
    expect(calls.resultsPosted).toBe(1);
    expect(calls.runUpdates).toHaveLength(1);
    expect(calls.runUpdates[0].state).toBe('Completed');
    expect(calls.runUpdates[0].errorMessage).toContain('Playwright reported 1 error(s) outside of tests.');
    expect(calls.runUpdates[0].errorMessage).toContain('worker teardown exploded');
    // the run summary page shows the comment, not errorMessage
    expect(calls.runUpdates[0].comment).toBe(calls.runUpdates[0].errorMessage);

    expect(calls.attachments).toHaveLength(1);
    const [attachment] = calls.attachments;
    expect(attachment.fileName).toBe('playwright-global-errors.md');
    expect(attachment.comment).toBe('Generated by Playwright Azure Reporter');
    expect(attachment.text).toContain('# Playwright errors outside of tests');
    expect(attachment.text).toContain('worker teardown exploded');
    expect(attachment.text).toContain('- Playwright run status: failed');
    // eslint-disable-next-line no-control-regex
    expect(attachment.text).not.toMatch(/\u001b\[/);
    if (hasWorkerInfo) {
      expect(attachment.text).toContain('- Worker: 0');
    } else {
      expect(attachment.text).not.toContain('- Worker:');
    }
    expect(result.output).toContain('attached to run 150 as playwright-global-errors.md');
  });

  test('a healthy run is not touched', async ({ runInlineTest, server }) => {
    const calls = setupRoutes(server);

    const result = await runInlineTest(
      {
        'playwright.config.ts': reporterConfig(server.PORT, 'publishGlobalErrors: true,'),
        'a.spec.js': passingSpec,
      },
      { reporter: '' }
    );

    expect(result.exitCode).toBe(0);
    expect(calls.attachments).toEqual([]);
    expect(calls.runUpdates).toEqual([{ state: 'Completed' }]);
  });

  test('globalSetup failure in testResult mode: the empty run carries the error', async ({ runInlineTest, server }) => {
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
    expect(calls.runsCreated).toBe(1);
    expect(calls.resultsPosted).toBe(0);
    expect(calls.runUpdates).toHaveLength(1);
    expect(calls.runUpdates[0].errorMessage).toContain('global setup exploded');
    expect(calls.runUpdates[0].comment).toBe(calls.runUpdates[0].errorMessage);
    expect(calls.attachments).toHaveLength(1);
    expect(calls.attachments[0].text).toContain('global setup exploded');
    expect(calls.attachments[0].text).toContain('global-setup.js');
  });

  test('globalSetup failure in testRun mode: a run is created only to carry the error', async ({
    runInlineTest,
    server,
  }) => {
    const calls = setupRoutes(server);

    const result = await runInlineTest(
      {
        'playwright.config.ts': reporterConfig(
          server.PORT,
          "publishTestResultsMode: 'testRun', publishGlobalErrors: true,",
          globalSetupConfig
        ),
        'global-setup.js': globalSetupFile,
        'a.spec.js': passingSpec,
      },
      { reporter: '' }
    );

    expect(result.exitCode).toBe(1);
    expect(calls.runsCreated).toBe(1);
    expect(calls.resultsPosted).toBe(0);
    expect(calls.attachments).toHaveLength(1);
    expect(calls.attachments[0].text).toContain('global setup exploded');
    expect(calls.runUpdates).toHaveLength(1);
    expect(calls.runUpdates[0].state).toBe('Completed');
    expect(calls.runUpdates[0].errorMessage).toContain('global setup exploded');
    expect(result.output).toContain('Run 150 - Completed');
  });

  test('globalSetup failure in testRun mode with the option off: no run is created', async ({
    runInlineTest,
    server,
  }) => {
    const calls = setupRoutes(server);

    const result = await runInlineTest(
      {
        'playwright.config.ts': reporterConfig(server.PORT, "publishTestResultsMode: 'testRun',", globalSetupConfig),
        'global-setup.js': globalSetupFile,
        'a.spec.js': passingSpec,
      },
      { reporter: '' }
    );

    expect(result.exitCode).toBe(1);
    expect(calls.runsCreated).toBe(0);
    expect(calls.attachments).toEqual([]);
    expect(calls.runUpdates).toEqual([]);
  });

  test('a comment from testRunConfig is kept in front of the summary', async ({ runInlineTest, server }) => {
    const calls = setupRoutes(server);

    const result = await runInlineTest(
      {
        'playwright.config.ts': reporterConfig(
          server.PORT,
          "publishGlobalErrors: true, testRunConfig: { configurationIds: [1], comment: 'nightly build' },"
        ),
        'a.spec.js': workerTeardownSpec,
      },
      { reporter: '' }
    );

    expect(result.exitCode).toBe(1);
    expect(calls.runUpdates).toHaveLength(1);
    expect(calls.runUpdates[0].comment).toBe(`nightly build\n${calls.runUpdates[0].errorMessage}`);
  });

  test('existing run: attachment only, the run itself is never modified', async ({ runInlineTest, server }) => {
    const calls = setupRoutes(server);

    const result = await runInlineTest(
      {
        'playwright.config.ts': reporterConfig(
          server.PORT,
          "publishTestResultsMode: 'testRun', isExistingTestRun: true, testRunId: 150, publishGlobalErrors: true,",
          globalSetupConfig
        ),
        'global-setup.js': globalSetupFile,
        'a.spec.js': passingSpec,
      },
      { reporter: '' }
    );

    expect(result.exitCode).toBe(1);
    expect(calls.runsCreated).toBe(0);
    expect(calls.runUpdates).toEqual([]);
    expect(calls.attachments).toHaveLength(1);
    expect(calls.attachments[0].text).toContain('global setup exploded');
  });

  test('maxErrors limits the listed errors', async ({ runInlineTest, server }) => {
    const calls = setupRoutes(server);

    const result = await runInlineTest(
      {
        'playwright.config.ts': reporterConfig(
          server.PORT,
          'publishGlobalErrors: { enabled: true, maxErrors: 1 },',
          "projects: [{ name: 'one' }, { name: 'two' }], workers: 2,"
        ),
        'a.spec.js': workerTeardownSpec,
      },
      { reporter: '' }
    );

    expect(result.exitCode).toBe(1);
    expect(calls.attachments).toHaveLength(1);
    expect(calls.attachments[0].text.match(/^## \d+\. /gm)).toHaveLength(1);
    if (hasWorkerInfo) {
      // two projects, two workers, the same error: one per project
      expect(calls.attachments[0].text).toContain('- Errors reported: 2');
      expect(calls.attachments[0].text).toContain('Not listed because of maxErrors (1): 1');
    }
  });

  test('{ enabled: false } keeps the feature off', async ({ runInlineTest, server }) => {
    const calls = setupRoutes(server);

    const result = await runInlineTest(
      {
        'playwright.config.ts': reporterConfig(server.PORT, 'publishGlobalErrors: { enabled: false },'),
        'a.spec.js': workerTeardownSpec,
      },
      { reporter: '' }
    );

    expect(result.exitCode).toBe(1);
    expect(calls.attachments).toEqual([]);
    expect(calls.runUpdates).toEqual([{ state: 'Completed' }]);
  });
});
