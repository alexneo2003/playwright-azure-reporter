import path from 'path';

import { getRequestBody, setHeaders } from '../config/utils';
import azureAreas from './assets/azure-reporter/azureAreas';
import headers from './assets/azure-reporter/azureHeaders';
import location from './assets/azure-reporter/azureLocationOptionsResponse.json';
import { reporterPath } from './reporterPath';
import { expect, test } from './test-fixtures';

const asset = (name: string) => path.join(__dirname, 'assets', 'azure-reporter', name);

const TEST_OPTIONS_RESPONSE_PATH = asset('azureTestOptionsResponse.json');
const CORE_OPTIONS_RESPONSE_PATH = asset('azureCoreOptionsResponse.json');
const PROJECT_VALID_RESPONSE_PATH = asset('projectValidResponse.json');
const CREATE_RUN_VALID_RESPONSE_PATH = asset('createRunValidResponse.json');
const POINTS_3_VALID_RESPONSE_PATH = asset('points3Response.json');
const COMPLETE_RUN_VALID_RESPONSE_PATH = asset('completeRunValidResponse.json');
const TEST_RUN_RESULTS_3_VALID_RESPONSE_PATH = asset('testRunResults3ValidResponse.json');

// eslint-disable-next-line @typescript-eslint/no-require-imports
const installedPlaywright: string = require('@playwright/test/package.json').version;
const [major, minor] = installedPlaywright.split('.').map((n) => parseInt(n, 10));
const hasStepParams = major > 1 || (major === 1 && minor >= 63);

function setupRoutes(server: any) {
  const calls = { runsCreated: 0, patches: 0 };
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
    calls.runsCreated++;
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
  server.setRoute('/SampleSample/_apis/test/Runs/150/Results', async (req: any, res: any) => {
    const body = await getRequestBody(req);
    setHeaders(res, headers);
    if (req.method === 'PATCH') {
      calls.patches++;
      res.end(JSON.stringify(body.map((r: any) => ({ id: r.id, outcome: r.outcome, testRun: { id: '150' } }))));
      return;
    }
    server.serveFile(req, res, TEST_RUN_RESULTS_3_VALID_RESPONSE_PATH);
  });
  return calls;
}

const reporterConfig = (port: number, extra: string) => `
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

const specWithStep = `
  import { test, expect } from '@playwright/test';
  test('[3] foobar', async () => {
    await test.step('[1] step', async () => {
      expect(1).toBe(1);
    });
  });
`;

test.describe('Playwright compatibility (feature matrix)', () => {
  test('logs the detected Playwright version at debug level', async ({ runInlineTest, server }) => {
    setupRoutes(server);

    const result = await runInlineTest(
      { 'playwright.config.ts': reporterConfig(server.PORT, ''), 'a.spec.js': specWithStep },
      { reporter: '' },
      { AZUREPWDEBUG: '1' }
    );

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain(`azure:pw:debug [compat] Playwright ${installedPlaywright} from `);
  });

  test('lenient (default): steps are published, a missing enrichment is only reported', async ({
    runInlineTest,
    server,
  }) => {
    const calls = setupRoutes(server);

    const result = await runInlineTest(
      {
        'playwright.config.ts': reporterConfig(
          server.PORT,
          'publishTestSteps: { enabled: true, alignWithTestCase: false },'
        ),
        'a.spec.js': specWithStep,
      },
      { reporter: '' }
    );

    expect(result.exitCode).toBe(0);
    expect(result.passed).toBe(1);
    expect(calls.patches).toBe(1);
    expect(result.output).toContain('azure:pw:log Published step results for 1 test result(s)');

    const enrichmentLine = `azure:pw:log [compat] Playwright ${installedPlaywright}: publishTestSteps.params requires Playwright >= 1.63.0`;
    if (hasStepParams) {
      expect(result.output).not.toContain('[compat]');
    } else {
      expect(result.output).toContain(enrichmentLine);
      expect(result.output).not.toContain('Feature disabled');
    }
  });

  test('strict: an unmet requirement stops the run before any test executes', async ({ runInlineTest, server }) => {
    test.skip(hasStepParams, 'installed Playwright satisfies every feature, nothing to reject');
    const calls = setupRoutes(server);

    const result = await runInlineTest(
      {
        'playwright.config.ts': reporterConfig(
          server.PORT,
          "publishTestSteps: { enabled: true, alignWithTestCase: false }, compatibility: 'strict',"
        ),
        'a.spec.js': specWithStep,
      },
      { reporter: '' }
    );

    expect(result.exitCode).toBe(1);
    expect(result.passed).toBe(0);
    expect(result.output).toContain(`[playwright-azure-reporter] Playwright ${installedPlaywright} (`);
    expect(result.output).toContain('does not satisfy the enabled features');
    expect(result.output).toContain('publishTestSteps.params requires Playwright >= 1.63.0');
    expect(result.output).toContain("set compatibility: 'lenient'");
    expect(calls.runsCreated).toBe(0);
    expect(calls.patches).toBe(0);
  });

  test('strict: a configuration that needs nothing newer runs normally', async ({ runInlineTest, server }) => {
    const calls = setupRoutes(server);

    const result = await runInlineTest(
      {
        'playwright.config.ts': reporterConfig(server.PORT, "compatibility: 'strict',"),
        'a.spec.js': specWithStep,
      },
      { reporter: '' }
    );

    expect(result.exitCode).toBe(0);
    expect(result.passed).toBe(1);
    expect(calls.runsCreated).toBe(1);
    expect(result.output).not.toContain('[playwright-azure-reporter] Playwright');
  });
});
