import path from 'path';

import { getRequestBody, setHeaders } from '../config/utils';
import azureAreas from './assets/azure-reporter/azureAreas';
import headers from './assets/azure-reporter/azureHeaders';
import location from './assets/azure-reporter/azureLocationOptionsResponse.json';
import { reporterPath } from './reporterPath';
import { expect, test } from './test-fixtures';

const asset = (name: string) => path.join(__dirname, 'assets', 'azure-reporter', name);

// eslint-disable-next-line @typescript-eslint/no-require-imports
const installedPlaywright: string = require('@playwright/test/package.json').version;
const [major, minor] = installedPlaywright.split('.').map((n) => parseInt(n, 10));
const hasConfigTags = major > 1 || (major === 1 && minor >= 57);

type Calls = { creates: any[]; runUpdates: any[] };

function setupRoutes(server: any, rejectTags = false): Calls {
  const calls: Calls = { creates: [], runUpdates: [] };
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
  server.setRoute('/SampleSample/_apis/test/Runs', async (req: any, res: any) => {
    const body = await getRequestBody(req);
    calls.creates.push(body);
    setHeaders(res, headers);
    if (rejectTags && body.tags) {
      res.statusCode = 400;
      res.end(JSON.stringify({ message: 'Invalid tag' }));
      return;
    }
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
    setHeaders(res, headers);
    server.serveFile(req, res, asset('testRunResults3ValidResponse.json'));
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

const spec = `
  import { test, expect } from '@playwright/test';
  test('[3] foobar', async () => {
    expect(1).toBe(1);
  });
`;

const names = (tags: Array<{ name: string }> | undefined) => (tags ?? []).map((t) => t.name);

test.describe('testRunContext', () => {
  test('off by default: the create request is what it was', async ({ runInlineTest, server }) => {
    const calls = setupRoutes(server);

    const result = await runInlineTest(
      { 'playwright.config.ts': reporterConfig(server.PORT, '', "tag: ['@smoke'],"), 'a.spec.js': spec },
      { reporter: '', shard: '1/2' }
    );

    expect(result.exitCode).toBe(0);
    expect(calls.creates).toHaveLength(1);
    expect(calls.creates[0].name).toBe(' Playwright Test Run');
    expect(calls.creates[0].tags).toBeUndefined();
  });

  test('shard goes into the title of the run', async ({ runInlineTest, server }) => {
    const calls = setupRoutes(server);

    const result = await runInlineTest(
      { 'playwright.config.ts': reporterConfig(server.PORT, 'testRunContext: true,'), 'a.spec.js': spec },
      { reporter: '', shard: '1/2' }
    );

    expect(result.exitCode).toBe(0);
    expect(calls.creates[0].name).toBe(' Playwright Test Run (shard 1/2)');
    expect(calls.creates[0].tags).toBeUndefined();
  });

  test('no suffix without sharding, the environment prefix stays in front', async ({ runInlineTest, server }) => {
    const calls = setupRoutes(server);

    const result = await runInlineTest(
      {
        'playwright.config.ts': reporterConfig(server.PORT, "testRunContext: true, environment: 'QA',"),
        'a.spec.js': spec,
      },
      { reporter: '' }
    );

    expect(result.exitCode).toBe(0);
    expect(calls.creates[0].name).toBe('[QA]: Playwright Test Run');
  });

  test('shardInTitle: false keeps the title', async ({ runInlineTest, server }) => {
    const calls = setupRoutes(server);

    await runInlineTest(
      {
        'playwright.config.ts': reporterConfig(server.PORT, 'testRunContext: { enabled: true, shardInTitle: false },'),
        'a.spec.js': spec,
      },
      { reporter: '', shard: '1/2' }
    );

    expect(calls.creates[0].name).toBe(' Playwright Test Run');
  });

  test('testRun mode: the title of the run created at the end carries the shard too', async ({
    runInlineTest,
    server,
  }) => {
    const calls = setupRoutes(server);

    const result = await runInlineTest(
      {
        'playwright.config.ts': reporterConfig(server.PORT, "publishTestResultsMode: 'testRun', testRunContext: true,"),
        'a.spec.js': spec,
      },
      { reporter: '', shard: '1/2' }
    );

    expect(result.exitCode).toBe(0);
    expect(calls.creates).toHaveLength(1);
    expect(calls.creates[0].name).toBe(' Playwright Test Run (shard 1/2)');
  });

  test('config tags become run tags and are merged after testRunConfig.tags', async ({ runInlineTest, server }) => {
    test.skip(!hasConfigTags, 'FullConfig.tags needs Playwright 1.57');
    const calls = setupRoutes(server);

    const result = await runInlineTest(
      {
        'playwright.config.ts': reporterConfig(
          server.PORT,
          "testRunContext: true, testRunConfig: { configurationIds: [1], tags: [{ name: 'ci' }] },",
          "tag: ['@smoke', '@CI', '@nightly'],"
        ),
        'a.spec.js': spec,
      },
      { reporter: '' }
    );

    expect(result.exitCode).toBe(0);
    expect(names(calls.creates[0].tags)).toEqual(['ci', 'smoke', 'nightly']);
    expect(calls.creates[0].configurationIds).toEqual([1]);
  });

  test('at most five tags, tags: false skips them', async ({ runInlineTest, server }) => {
    test.skip(!hasConfigTags, 'FullConfig.tags needs Playwright 1.57');
    const calls = setupRoutes(server);
    const config = "tag: ['@a', '@b', '@c', '@d', '@e', '@f', '@g'],";

    await runInlineTest(
      { 'playwright.config.ts': reporterConfig(server.PORT, 'testRunContext: true,', config), 'a.spec.js': spec },
      { reporter: '' }
    );
    expect(names(calls.creates[0].tags)).toEqual(['a', 'b', 'c', 'd', 'e']);

    await runInlineTest(
      {
        'playwright.config.ts': reporterConfig(server.PORT, 'testRunContext: { enabled: true, tags: false },', config),
        'a.spec.js': spec,
      },
      { reporter: '' }
    );
    expect(calls.creates[1].tags).toBeUndefined();
  });

  test('only the tags Azure DevOps would reject are skipped, and the log names them', async ({
    runInlineTest,
    server,
  }) => {
    test.skip(!hasConfigTags, 'FullConfig.tags needs Playwright 1.57');
    const calls = setupRoutes(server);

    const result = await runInlineTest(
      {
        'playwright.config.ts': reporterConfig(
          server.PORT,
          'testRunContext: true,',
          "tag: ['@smoke', '@feature:login', '@nightly'],"
        ),
        'a.spec.js': spec,
      },
      { reporter: '' }
    );

    expect(result.exitCode).toBe(0);
    expect(calls.creates).toHaveLength(1);
    expect(names(calls.creates[0].tags)).toEqual(['smoke', 'nightly']);
    expect(result.output).toContain('not used as run tags');
    expect(result.output).toContain('@feature:login');
  });

  test('a run that Azure DevOps rejects because of the tags is created again without them', async ({
    runInlineTest,
    server,
  }) => {
    test.skip(!hasConfigTags, 'FullConfig.tags needs Playwright 1.57');
    const calls = setupRoutes(server, true);

    const result = await runInlineTest(
      {
        'playwright.config.ts': reporterConfig(server.PORT, 'testRunContext: true,', "tag: ['@smoke'],"),
        'a.spec.js': spec,
      },
      { reporter: '' }
    );

    expect(result.exitCode).toBe(0);
    expect(result.passed).toBe(1);
    expect(calls.creates).toHaveLength(2);
    expect(names(calls.creates[0].tags)).toEqual(['smoke']);
    expect(calls.creates[1].tags).toBeUndefined();
    expect(result.output).toContain('Retrying without them');
    expect(calls.runUpdates).toEqual([{ state: 'Completed' }]);
  });

  test('older Playwright: tags are not taken, lenient reports it once, strict stops the run', async ({
    runInlineTest,
    server,
  }) => {
    test.skip(hasConfigTags, 'installed Playwright provides FullConfig.tags');
    const calls = setupRoutes(server);

    const lenient = await runInlineTest(
      { 'playwright.config.ts': reporterConfig(server.PORT, 'testRunContext: true,'), 'a.spec.js': spec },
      { reporter: '' }
    );
    expect(lenient.exitCode).toBe(0);
    expect(calls.creates[0].tags).toBeUndefined();
    expect(lenient.output).toContain(
      `[compat] Playwright ${installedPlaywright}: testRunContext.tags requires Playwright >= 1.57.0`
    );

    const strict = await runInlineTest(
      {
        'playwright.config.ts': reporterConfig(server.PORT, "testRunContext: true, compatibility: 'strict',"),
        'a.spec.js': spec,
      },
      { reporter: '' }
    );
    expect(strict.exitCode).toBe(1);
    expect(strict.output).toContain('testRunContext.tags requires Playwright >= 1.57.0');
    expect(calls.creates).toHaveLength(1);
  });
});
