import path from 'path';

import { getRequestBody, setHeaders } from '../config/utils';
import azureAreas from './assets/azure-reporter/azureAreas';
import headers from './assets/azure-reporter/azureHeaders';
import location from './assets/azure-reporter/azureLocationOptionsResponse.json';
import pointsResponseMapper from './assets/azure-reporter/pointsResponseMapper';
import testResultsByQueryResponseMapping from './assets/azure-reporter/testResultsByQueryResponseMapping';
import testRunResultsMapper from './assets/azure-reporter/testRunResultsMapper';
import { customReporterTestRunPath, reporterPath } from './reporterPath';
import { expect, test } from './test-fixtures';

const TEST_OPTIONS_RESPONSE_PATH = path.join(
  __dirname,
  '.',
  'assets',
  'azure-reporter',
  'azureTestOptionsResponse.json'
);
const CORE_OPTIONS_RESPONSE_PATH = path.join(
  __dirname,
  '.',
  'assets',
  'azure-reporter',
  'azureCoreOptionsResponse.json'
);
const PROJECT_VALID_RESPONSE_PATH = path.join(__dirname, '.', 'assets', 'azure-reporter', 'projectValidResponse.json');
const CREATE_RUN_VALID_RESPONSE_PATH = path.join(
  __dirname,
  '.',
  'assets',
  'azure-reporter',
  'createRunValidResponse.json'
);
const POINTS_3_VALID_RESPONSE_PATH = path.join(__dirname, '.', 'assets', 'azure-reporter', 'points3Response.json');
const POINTS_7_VALID_RESPONSE_PATH = path.join(__dirname, '.', 'assets', 'azure-reporter', 'points7Response.json');
const POINTS_3_7_VALID_RESPONSE_PATH = path.join(__dirname, '.', 'assets', 'azure-reporter', 'points3-7Response.json');
const POINTS_33_INVALID_RESPONSE_PATH = path.join(
  __dirname,
  '.',
  'assets',
  'azure-reporter',
  'points33InvalidResponse.json'
);
const COMPLETE_RUN_VALID_RESPONSE_PATH = path.join(
  __dirname,
  '.',
  'assets',
  'azure-reporter',
  'completeRunValidResponse.json'
);
const TEST_RUN_RESULTS_3_VALID_RESPONSE_PATH = path.join(
  __dirname,
  '.',
  'assets',
  'azure-reporter',
  'testRunResults3ValidResponse.json'
);
const TEST_RUN_RESULTS_7_VALID_RESPONSE_PATH = path.join(
  __dirname,
  '.',
  'assets',
  'azure-reporter',
  'testRunResults7ValidResponse.json'
);
const TEST_RUN_RESULTS_3_7_VALID_RESPONSE_PATH = path.join(
  __dirname,
  '.',
  'assets',
  'azure-reporter',
  'testRunResults3-7ValidResponse.json'
);
const RUN_RESULTS_ATTACHMENTS_VALID_RESPONSE_PATH = path.join(
  __dirname,
  '.',
  'assets',
  'azure-reporter',
  'runResultsAttachmentsResponse.json'
);
const GET_TEST_RESULTS_BY_QUERY_VALID_RESPONSE_PATH = path.join(
  __dirname,
  '.',
  'assets',
  'azure-reporter',
  'getTestResultsByQueryResponse.json'
);

test.describe('Publish results - testRun', () => {
  test('correct orgUrl config, correct token, incorrect testCaseId', async ({ runInlineTest, server }) => {
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
      server.serveFile(req, res, PROJECT_VALID_RESPONSE_PATH);
    });

    server.setRoute('/SampleSample/_apis/test/Runs', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, CREATE_RUN_VALID_RESPONSE_PATH);
    });

    server.setRoute('/SampleSample/_apis/test/Points', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, POINTS_33_INVALID_RESPONSE_PATH);
    });

    server.setRoute('/SampleSample/_apis/test/Runs/150', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, COMPLETE_RUN_VALID_RESPONSE_PATH);
    });

    const result = await runInlineTest(
      {
        'playwright.config.ts': `
        module.exports = {
          reporter: [
            ['line'],
            ['${reporterPath}', { 
              orgUrl: 'http://localhost:${server.PORT}',
              projectName: 'SampleSample',
              planId: 4,
              token: 'token',
              logging: true,
              publishTestResultsMode: 'testRun',
            }]
          ]
        };
      `,
        'a.spec.js': `
        import { test, expect } from '@playwright/test';
        test('[33] foobar', async ({}) => {
          expect(1).toBe(0);
        });
      `,
      },
      { reporter: '' }
    );
    expect(result.output).not.toContain('Failed request: (401)');
    expect(result.output).toMatch(/azure:pw:log Using run (\d.*) to publish test results/);
    expect(result.output).toContain('azure:pw:log [33] foobar - failed');
    expect(result.output).toContain('azure:pw:log Start publishing test results for 1 test(s)');
    expect(result.output).toContain('No test points found for test case [33] associated with test plan 4');
    expect(result.output).toContain(
      'Check, maybe testPlanId or assigned configurations per test case, what you specified, is incorrect.'
    );
    expect(result.output).toContain('azure:pw:log Test results published for 0 test(s)');
    expect(result.output).toMatch(/azure:pw:log Run (\d.*) - Completed/);
    expect(result.exitCode).toBe(1);
    expect(result.failed).toBe(1);
  });

  test('correct orgUrl config, correct token, correct testCaseId', async ({ runInlineTest, server }) => {
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
      server.serveFile(req, res, PROJECT_VALID_RESPONSE_PATH);
    });

    server.setRoute('/SampleSample/_apis/test/Runs', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, CREATE_RUN_VALID_RESPONSE_PATH);
    });

    server.setRoute('/SampleSample/_apis/test/Points', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, POINTS_3_VALID_RESPONSE_PATH);
    });

    server.setRoute('/SampleSample/_apis/test/Runs/150/Results', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, TEST_RUN_RESULTS_3_VALID_RESPONSE_PATH);
    });

    server.setRoute('/SampleSample/_apis/test/Runs/150', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, COMPLETE_RUN_VALID_RESPONSE_PATH);
    });

    const result = await runInlineTest(
      {
        'playwright.config.ts': `
        module.exports = { 
          reporter: [
            ['line'],
            ['${reporterPath}', { 
              orgUrl: 'http://localhost:${server.PORT}',
              projectName: 'SampleSample',
              planId: 4,
              token: 'token',
              logging: true,
              publishTestResultsMode: 'testRun',
            }]
          ]
        };
      `,
        'a.spec.js': `
        import { test, expect } from '@playwright/test';
        test('[3] foobar', async () => {
          expect(1).toBe(0);
        });
      `,
      },
      { reporter: '' }
    );

    expect(result.output).not.toContain('Failed request: (401)');
    expect(result.output).toMatch(/azure:pw:log Using run (\d.*) to publish test results/);
    expect(result.output).toContain('azure:pw:log [3] foobar - failed');
    expect(result.output).toContain('azure:pw:log Start publishing test results for 1 test(s)');
    expect(result.output).toContain('azure:pw:log Left to publish: 0');
    expect(result.output).toContain('azure:pw:log Test results published for 1 test(s)');
    expect(result.output).toMatch(/azure:pw:log Run (\d.*) - Completed/);
    expect(result.exitCode).toBe(1);
    expect(result.failed).toBe(1);
  });

  test('logging default is disabled but show some logs at the end in testRun mode', async ({
    runInlineTest,
    server,
  }) => {
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
      server.serveFile(req, res, PROJECT_VALID_RESPONSE_PATH);
    });

    server.setRoute('/SampleSample/_apis/test/Runs', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, CREATE_RUN_VALID_RESPONSE_PATH);
    });

    server.setRoute('/SampleSample/_apis/test/Points', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, POINTS_3_VALID_RESPONSE_PATH);
    });

    server.setRoute('/SampleSample/_apis/test/Runs/150/Results', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, TEST_RUN_RESULTS_3_VALID_RESPONSE_PATH);
    });

    server.setRoute('/SampleSample/_apis/test/Runs/150', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, COMPLETE_RUN_VALID_RESPONSE_PATH);
    });

    const result = await runInlineTest(
      {
        'playwright.config.ts': `
        module.exports = { 
          reporter: [
            ['line'],
            ['${reporterPath}', { 
              orgUrl: 'http://localhost:${server.PORT}',
              projectName: 'SampleSample',
              planId: 4,
              token: 'token',
              publishTestResultsMode: 'testRun',
            }]
          ]
        };
      `,
        'a.spec.js': `
        import { test, expect } from '@playwright/test';
        test('[3] foobar', async () => {
          expect(1).toBe(0);
        });
      `,
      },
      { reporter: '' }
    );
    expect(result.output).not.toContain('Failed request: (401)');
    expect(result.output).not.toMatch(/azure:pw:log Using run (\d.*) to publish test results/);
    expect(result.output).toContain('azure:pw:log Start publishing test results for 1 test(s)');
    expect(result.output).not.toContain('azure:pw:log Starting to uploading attachments for');
    expect(result.output).not.toContain('azure:pw:log Left to publish: 0');
    expect(result.output).toContain('azure:pw:log Test results published for 1 test(s), 1 test point(s)');
    expect(result.output).toMatch(/azure:pw:log Run (\d.*) - Completed/);
    expect(result.exitCode).toBe(1);
    expect(result.failed).toBe(1);
  });

  test('testCaseId not specified', async ({ runInlineTest, server }) => {
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
      server.serveFile(req, res, PROJECT_VALID_RESPONSE_PATH);
    });

    server.setRoute('/SampleSample/_apis/test/Runs', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, CREATE_RUN_VALID_RESPONSE_PATH);
    });

    server.setRoute('/SampleSample/_apis/test/Points', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, POINTS_3_VALID_RESPONSE_PATH);
    });

    server.setRoute('/SampleSample/_apis/test/Runs/150/Results', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, TEST_RUN_RESULTS_3_VALID_RESPONSE_PATH);
    });

    server.setRoute('/SampleSample/_apis/test/Runs/150', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, COMPLETE_RUN_VALID_RESPONSE_PATH);
    });

    const result = await runInlineTest(
      {
        'playwright.config.ts': `
        module.exports = { 
          reporter: [
            ['line'],
            ['${reporterPath}', { 
              orgUrl: 'http://localhost:${server.PORT}',
              projectName: 'SampleSample',
              planId: 4,
              token: 'token',
              logging: true,
              publishTestResultsMode: 'testRun',
            }]
          ]
        };
      `,
        'a.spec.js': `
        import { test, expect } from '@playwright/test';
        test('foobar', async () => {
          expect(1).toBe(0);
        });
      `,
      },
      { reporter: '' }
    );
    expect(result.output).not.toContain('Failed request: (401)');
    expect(result.output).not.toMatch(/azure:pw:log Using run (\d.*) to publish test results/);
    expect(result.output).toContain('azure:pw:log No test results to publish');
    expect(result.output).not.toMatch(/azure:pw:log Run (\d.*) - Completed/);
    expect(result.exitCode).toBe(1);
    expect(result.failed).toBe(1);
  });

  test('incorrect planId', async ({ runInlineTest, server }) => {
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
      server.serveFile(req, res, PROJECT_VALID_RESPONSE_PATH);
    });

    server.setRoute('/SampleSample/_apis/test/Runs', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, CREATE_RUN_VALID_RESPONSE_PATH);
    });

    server.setRoute('/SampleSample/_apis/test/Points', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, POINTS_3_VALID_RESPONSE_PATH);
    });

    server.setRoute('/SampleSample/_apis/test/Runs/150/Results', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, TEST_RUN_RESULTS_3_VALID_RESPONSE_PATH);
    });

    server.setRoute('/SampleSample/_apis/test/Runs/150', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, COMPLETE_RUN_VALID_RESPONSE_PATH);
    });

    const result = await runInlineTest(
      {
        'playwright.config.ts': `
        module.exports = { 
          reporter: [
            ['line'],
            ['${reporterPath}', { 
              orgUrl: 'http://localhost:${server.PORT}',
              projectName: 'SampleSample',
              planId: 44,
              token: 'token',
              logging: true,
              publishTestResultsMode: 'testRun',
              testRunConfig: {
                configurationIds: [1, 2, 3],
              },
            }]
          ]
        };
      `,
        'a.spec.js': `
        import { test, expect } from '@playwright/test';
        test('[3] foobar', async () => {
          expect(1).toBe(0);
        });
      `,
      },
      { reporter: '' }
    );
    expect(result.output).not.toContain('Failed request: (401)');
    expect(result.output).toMatch(/azure:pw:log Using run (\d.*) to publish test results/);
    expect(result.output).toContain('azure:pw:log Start publishing test results for 1 test(s)');
    expect(result.output).toContain(
      'No test points found for test case [3] associated with test plan 44 for configurations [1, 2, 3]'
    );
    expect(result.output).toContain(
      'Check, maybe testPlanId or assigned configurations per test case, what you specified, is incorrect.'
    );
    expect(result.output).toContain('azure:pw:log Test results published for 0 test(s)');
    expect(result.output).toMatch(/azure:pw:log Run (\d.*) - Completed/);
    expect(result.exitCode).toBe(1);
    expect(result.failed).toBe(1);
  });

  test('upload attachments, attachmentsType in not defined - default "screenshot"', async ({
    runInlineTest,
    server,
  }) => {
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
      server.serveFile(req, res, PROJECT_VALID_RESPONSE_PATH);
    });

    server.setRoute('/SampleSample/_apis/test/Runs', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, CREATE_RUN_VALID_RESPONSE_PATH);
    });

    server.setRoute('/SampleSample/_apis/test/Points', async (req, res) => {
      const body = await getRequestBody(req);
      setHeaders(res, headers);
      expect(body.pointsFilter?.testcaseIds[0]).toBeDefined();
      if (body.pointsFilter?.testcaseIds[0] === 3 && body.pointsFilter?.testcaseIds[1] === 7)
        server.serveFile(req, res, POINTS_3_7_VALID_RESPONSE_PATH);
    });

    server.setRoute('/SampleSample/_apis/test/Runs/150/Results', async (req, res) => {
      const body = await getRequestBody(req);
      setHeaders(res, headers);
      expect(body[0].testPoint?.id).toBeDefined();
      if (body[0].testPoint?.id === '1' && body[1].testPoint?.id === '2')
        server.serveFile(req, res, TEST_RUN_RESULTS_3_7_VALID_RESPONSE_PATH);
    });

    server.setRoute('/SampleSample/_apis/test/Runs/150/Results/100001/Attachments', async (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, RUN_RESULTS_ATTACHMENTS_VALID_RESPONSE_PATH);
    });

    server.setRoute('/SampleSample/_apis/test/Results', async (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, GET_TEST_RESULTS_BY_QUERY_VALID_RESPONSE_PATH);
    });

    server.setRoute('/SampleSample/_apis/test/Runs/150', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, COMPLETE_RUN_VALID_RESPONSE_PATH);
    });

    const result = await runInlineTest(
      {
        'playwright.config.ts': `
        module.exports = { 
          use: {
            screenshot: 'only-on-failure',
            trace: 'retain-on-failure',
            video: 'retain-on-failure',
          },
          reporter: [
            ['dot'],
            ['${reporterPath}', { 
              orgUrl: 'http://localhost:${server.PORT}',
              projectName: 'SampleSample',
              planId: 4,
              token: 'token',
              logging: true,
              uploadAttachments: true,
              publishTestResultsMode: 'testRun',
            }]
          ]
        };
      `,
        'a.spec.js': `
        import { test, expect } from '@playwright/test';
        test('[3] foobar', async () => {
          expect(1).toBe(1);
        });
        test('[7] with screenshot', async ({ page }) => {
          await page.goto('https://playwright.dev/')
          await page.locator('text=Get started').click()
          await expect(page).toHaveTitle(/Getting sttttarted/)
        });
      `,
      },
      { reporter: '' }
    );

    expect(result.output).not.toContain('Failed request: (401)');
    expect(result.output).toContain(
      "'attachmentsType' is not set. Attachments Type will be set to 'screenshot' by default."
    );
    expect(result.output).toMatch(/azure:pw:log Using run (\d.*) to publish test results/);
    expect(result.output).toContain('azure:pw:log Uploading attachments for test: [7] with screenshot');
    expect(result.output).toContain('azure:pw:log Uploaded attachment');
    expect(result.output).toContain('azure:pw:log Left to publish: 0');
    expect(result.output).toContain('azure:pw:log Test results published for 2 test(s)');
    expect(result.output).toMatch(/azure:pw:log Run (\d.*) - Completed/);
    expect(result.exitCode).toBe(1);
    expect(result.passed).toBe(1);
    expect(result.failed).toBe(1);
  });

  test('upload attachments with attachments type', async ({ runInlineTest, server }) => {
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
      server.serveFile(req, res, PROJECT_VALID_RESPONSE_PATH);
    });

    server.setRoute('/SampleSample/_apis/test/Runs', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, CREATE_RUN_VALID_RESPONSE_PATH);
    });

    server.setRoute('/SampleSample/_apis/test/Points', async (req, res) => {
      const body = await getRequestBody(req);
      setHeaders(res, headers);
      expect(body.pointsFilter?.testcaseIds[0]).toBeDefined();
      if (body.pointsFilter?.testcaseIds[0] === 3 && body.pointsFilter?.testcaseIds[1] === 7)
        server.serveFile(req, res, POINTS_3_7_VALID_RESPONSE_PATH);
    });

    server.setRoute('/SampleSample/_apis/test/Runs/150/Results', async (req, res) => {
      const body = await getRequestBody(req);
      setHeaders(res, headers);
      expect(body[0].testPoint?.id).toBeDefined();
      if (body[0].testPoint?.id === '1' && body[1].testPoint?.id === '2')
        server.serveFile(req, res, TEST_RUN_RESULTS_3_7_VALID_RESPONSE_PATH);
    });

    server.setRoute('/SampleSample/_apis/test/Runs/150/Results/100001/Attachments', async (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, RUN_RESULTS_ATTACHMENTS_VALID_RESPONSE_PATH);
    });

    server.setRoute('/SampleSample/_apis/test/Results', async (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, GET_TEST_RESULTS_BY_QUERY_VALID_RESPONSE_PATH);
    });

    server.setRoute('/SampleSample/_apis/test/Runs/150', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, COMPLETE_RUN_VALID_RESPONSE_PATH);
    });

    const result = await runInlineTest(
      {
        'playwright.config.ts': `
        module.exports = { 
          use: {
            screenshot: 'only-on-failure',
            trace: 'retain-on-failure',
            video: 'retain-on-failure',
          },
          reporter: [
            ['dot'],
            ['${reporterPath}', { 
              orgUrl: 'http://localhost:${server.PORT}',
              projectName: 'SampleSample',
              planId: 4,
              token: 'token',
              logging: true,
              uploadAttachments: true,
              attachmentsType: ['screenshot', 'trace', 'video'],
              publishTestResultsMode: 'testRun',
            }]
          ]
        };
      `,
        'a.spec.js': `
        import { test, expect } from '@playwright/test';
        test('[3] foobar', async () => {
          expect(1).toBe(1);
        });
        test('[7] with screenshot', async ({ page }) => {
          await page.goto('https://playwright.dev/')
          await page.locator('text=Get started').click()
          await expect(page).toHaveTitle(/Getting sttttarted/)
        });
      `,
      },
      { reporter: '' }
    );

    expect(result.output).not.toContain('Failed request: (401)');
    expect(result.output).not.toContain(
      "azure:pw:log 'attachmentsType' is not set. Attachments Type will be set to 'screenshot' by default."
    );
    expect(result.output).toMatch(/azure:pw:log Using run (\d.*) to publish test results/);
    expect(result.output).toContain('azure:pw:log Uploading attachments for test: [7] with screenshot');
    expect(result.output).toContain('azure:pw:log Uploaded attachment');
    expect(result.output).toContain('azure:pw:log Left to publish: 0');
    expect(result.output).toContain('azure:pw:log Test results published for 2 test(s)');
    expect(result.output).toMatch(/azure:pw:log Run (\d.*) - Completed/);
    expect(result.exitCode).toBe(1);
    expect(result.passed).toBe(1);
    expect(result.failed).toBe(1);
  });

  test('upload attachments attached as body, without path', async ({ runInlineTest, server }) => {
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
      server.serveFile(req, res, PROJECT_VALID_RESPONSE_PATH);
    });

    server.setRoute('/SampleSample/_apis/test/Runs', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, CREATE_RUN_VALID_RESPONSE_PATH);
    });

    server.setRoute('/SampleSample/_apis/test/Points', async (req, res) => {
      const body = await getRequestBody(req);
      setHeaders(res, headers);
      expect(body.pointsFilter?.testcaseIds[0]).toBeDefined();
      if (body.pointsFilter?.testcaseIds[0] === 3) server.serveFile(req, res, POINTS_3_VALID_RESPONSE_PATH);
      else if (body.pointsFilter?.testcaseIds[0] === 7) server.serveFile(req, res, POINTS_7_VALID_RESPONSE_PATH);
    });

    server.setRoute('/SampleSample/_apis/test/Runs/150/Results', async (req, res) => {
      const body = await getRequestBody(req);
      setHeaders(res, headers);
      expect(body[0].testPoint?.id).toBeDefined();
      if (body[0].testPoint?.id === '1') server.serveFile(req, res, TEST_RUN_RESULTS_3_VALID_RESPONSE_PATH);
      else if (body[0].testPoint?.id === '2') server.serveFile(req, res, TEST_RUN_RESULTS_7_VALID_RESPONSE_PATH);
    });

    server.setRoute('/SampleSample/_apis/test/Runs/150/Results/100000/Attachments', async (req, res) => {
      const body = await getRequestBody(req);

      expect(body.attachmentType).toBe('GeneralAttachment');
      expect(body.fileName).toMatch(/attachment_.{32}.json/);
      expect(body.stream).toBe('eyJmb28iOiAiYmFyIn0=');

      setHeaders(res, headers);
      server.serveFile(req, res, RUN_RESULTS_ATTACHMENTS_VALID_RESPONSE_PATH);
    });

    server.setRoute('/SampleSample/_apis/test/Results', async (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, GET_TEST_RESULTS_BY_QUERY_VALID_RESPONSE_PATH);
    });

    server.setRoute('/SampleSample/_apis/test/Runs/150', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, COMPLETE_RUN_VALID_RESPONSE_PATH);
    });

    const result = await runInlineTest(
      {
        'playwright.config.ts': `
        module.exports = { 
          reporter: [
            ['dot'],
            ['${reporterPath}', { 
              orgUrl: 'http://localhost:${server.PORT}',
              projectName: 'SampleSample',
              planId: 4,
              token: 'token',
              logging: true,
              uploadAttachments: true,
              attachmentsType: [/.*/],
              publishTestResultsMode: 'testRun',
            }]
          ]
        };
      `,
        'a.spec.js': `
        import { test, expect } from '@playwright/test';
        test('[3] foobar', async () => {
          test.info().attachments.push({ name: 'attachment', contentType: 'application/json', body: Buffer.from('{"foo": "bar"}') });
          expect(1).toBe(1);
        });
      `,
      },
      { reporter: '' }
    );

    expect(result.output).not.toContain('Failed request: (401)');
    expect(result.output).toMatch(/azure:pw:log Using run (\d.*) to publish test results/);
    expect(result.output).toContain('azure:pw:log Uploading attachments for test: [3] foobar');
    expect(result.output).toContain('azure:pw:log Uploaded attachment');
    expect(result.output).toContain('azure:pw:log Left to publish: 0');
    expect(result.output).toContain('azure:pw:log Test results published for 1 test(s)');
    expect(result.output).toMatch(/azure:pw:log Run (\d.*) - Completed/);
    expect(result.exitCode).toBe(0);
    expect(result.passed).toBe(1);
  });

  test('check logging. do not slice symbol', async ({ runInlineTest, server }) => {
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
      server.serveFile(req, res, PROJECT_VALID_RESPONSE_PATH);
    });

    server.setRoute('/SampleSample/_apis/test/Runs', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, CREATE_RUN_VALID_RESPONSE_PATH);
    });

    server.setRoute('/SampleSample/_apis/test/Points', async (req, res) => {
      const body = await getRequestBody(req);
      const pointsResponse = pointsResponseMapper(body);

      setHeaders(res, headers);
      expect(body.pointsFilter?.testcaseIds.length).toBeGreaterThan(0);
      expect(pointsResponse.points.length).toBeGreaterThan(0);
      res.end(JSON.stringify(pointsResponse));
    });

    server.setRoute('/SampleSample/_apis/test/Runs/150/Results', async (req, res) => {
      const body = await getRequestBody(req);
      const testRunResultsResponse = testRunResultsMapper(body);

      setHeaders(res, headers);
      expect(body[0].testPoint?.id).toBeDefined();
      expect(testRunResultsResponse.count).toBeGreaterThan(0);
      res.end(JSON.stringify(testRunResultsResponse));
    });

    server.setRoute('/SampleSample/_apis/test/Runs/150/Results/100001/Attachments', async (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, RUN_RESULTS_ATTACHMENTS_VALID_RESPONSE_PATH);
    });

    server.setRoute('/SampleSample/_apis/test/Results', async (req, res) => {
      const body = await getRequestBody(req);
      const testResultsResponse = testResultsByQueryResponseMapping(body);
      setHeaders(res, headers);
      expect(body.results.length).toBeGreaterThan(0);
      res.end(JSON.stringify(testResultsResponse));
    });

    server.setRoute('/SampleSample/_apis/test/Runs/150', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, COMPLETE_RUN_VALID_RESPONSE_PATH);
    });

    const result = await runInlineTest(
      {
        'playwright.config.ts': `
        module.exports = {
          reporter: [
            ['dot'],
            ['${reporterPath}', { 
              orgUrl: 'http://localhost:${server.PORT}',
              projectName: 'SampleSample',
              planId: 4,
              token: 'token',
              logging: true,
              publishTestResultsMode: 'testRun',
              uploadAttachments: true,
              attachmentsType: ['screenshot'],
            }]
          ]
        };
      `,
        'a.spec.js': `
        import { test, expect } from '@playwright/test';
        const tests = Array.from({ length: 125 }, (_, i) => i + 1);
        tests.forEach((testId) => {
          test('[' + testId + '] foobar', async () => {
            if (testId % 10 === 0) {
              test.info().attachments.push({ name: 'attachment', contentType: 'application/json', body: Buffer.from('{"foo": "bar"}') });
              expect(1).toBe(2);
            } else {
              expect(1).toBe(1);
            }
          });
        });
      `,
      },
      { reporter: '' },
      { DEBUG_COLORS: '0', NO_COLOR: '0', NODE_DISABLE_COLORS: '0', FORCE_COLOR: '0', DEBUG_HIDE_DATE: '1' } // disable colors in output
    );

    expect(result.output).not.toContain('Failed request: (401)');
    expect(result.output).toMatch(/azure:pw:log Using run (\d.*) to publish test results/);
    expect(result.output).toContain(
      'azure:pw:log Start publishing test results for 125 test(s)\nazure:pw:log Starting to uploading attachments for 5 testpoint(s)\nazure:pw:log Uploading attachments for test: [10] foobar\nazure:pw:log Uploaded attachments'
    );
    expect(result.output).toContain(
      'azure:pw:log Left to publish: 75\nazure:pw:log Starting to uploading attachments for 5 testpoint(s)\nazure:pw:log Uploading attachments for test: [60] foobar\nazure:pw:log Uploaded attachments'
    );
    expect(result.output).toContain(
      'azure:pw:log Uploading attachments for test: [100] foobar\nazure:pw:log Uploaded attachments\nazure:pw:log Left to publish: 25\nazure:pw:log Starting to uploading attachments for 2 testpoint(s)'
    );
    expect(result.output).toContain(
      'azure:pw:log Left to publish: 0\nazure:pw:log Test results published for 125 test(s), 125 test point(s)\nazure:pw:log Run 150 - Completed'
    );
    expect(result.exitCode).toBe(1);
    expect(result.failed).toBe(12);
    expect(result.passed).toBe(113);
  });

  test('should set process.env.AZURE_PW_TEST_RUN_ID for publishTestResultsMode: "testRun"', async ({
    runInlineTest,
    server,
  }) => {
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
      server.serveFile(req, res, PROJECT_VALID_RESPONSE_PATH);
    });

    server.setRoute('/SampleSample/_apis/test/Runs', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, CREATE_RUN_VALID_RESPONSE_PATH);
    });

    server.setRoute('/SampleSample/_apis/test/Points', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, POINTS_3_VALID_RESPONSE_PATH);
    });

    server.setRoute('/SampleSample/_apis/test/Runs/150/Results', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, TEST_RUN_RESULTS_3_VALID_RESPONSE_PATH);
    });

    server.setRoute('/SampleSample/_apis/test/Runs/150', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, COMPLETE_RUN_VALID_RESPONSE_PATH);
    });

    const result = await runInlineTest(
      {
        'playwright.config.ts': `
        module.exports = { 
          reporter: [
            ['line'],
            ['${reporterPath}', { 
              orgUrl: 'http://localhost:${server.PORT}',
              projectName: 'SampleSample',
              planId: 4,
              token: 'token',
              logging: true,
              publishTestResultsMode: 'testRun',
            }],
            ['${customReporterTestRunPath}']
          ]
        };
      `,
        'a.spec.js': `
        import { test, expect } from '@playwright/test';
        test('[3] foobar', async () => {
          expect(1).toBe(0);
        });
      `,
      },
      { reporter: '' }
    );

    expect(result.output).not.toContain('Failed request: (401)');
    expect(result.output).toMatch(/azure:pw:log Using run (\d.*) to publish test results/);
    expect(result.output).toContain('azure:pw:log AZURE_PW_TEST_RUN_ID: 150');
    expect(result.output).toContain('azure:pw:log [3] foobar - failed');
    expect(result.output).toContain('azure:pw:log Start publishing test results for 1 test(s)');
    expect(result.output).toContain('azure:pw:log Left to publish: 0');
    expect(result.output).toContain('azure:pw:log Test results published for 1 test(s)');
    expect(result.output).toMatch(/azure:pw:log Run (\d.*) - Completed/);
    expect(result.output).not.toContain('Error in reporter');
    expect(result.output).not.toContain('expect(received).toBeDefined()');
    expect(result.output).not.toContain('Expected: "150"\nReceived: undefined');
    expect(result.exitCode).toBe(1);
    expect(result.failed).toBe(1);
  });

  test('test with tags specified in test tag config section', async ({ runInlineTest, server }) => {
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
      server.serveFile(req, res, PROJECT_VALID_RESPONSE_PATH);
    });

    server.setRoute('/SampleSample/_apis/test/Runs', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, CREATE_RUN_VALID_RESPONSE_PATH);
    });

    server.setRoute('/SampleSample/_apis/test/Points', async (req, res) => {
      const body = await getRequestBody(req);
      setHeaders(res, headers);
      expect(body.pointsFilter?.testcaseIds[0]).toBeDefined();
      if (body.pointsFilter?.testcaseIds[0] === 3 && body.pointsFilter?.testcaseIds[1] === 7)
        server.serveFile(req, res, POINTS_3_7_VALID_RESPONSE_PATH);
    });

    server.setRoute('/SampleSample/_apis/test/Runs/150/Results', async (req, res) => {
      const body = await getRequestBody(req);
      setHeaders(res, headers);
      expect(body[0].testPoint?.id).toBeDefined();
      if (body[0].testPoint?.id === '1' && body[1].testPoint?.id === '2')
        server.serveFile(req, res, TEST_RUN_RESULTS_3_7_VALID_RESPONSE_PATH);
    });

    server.setRoute('/SampleSample/_apis/test/Runs/150/Results/100001/Attachments', async (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, RUN_RESULTS_ATTACHMENTS_VALID_RESPONSE_PATH);
    });

    server.setRoute('/SampleSample/_apis/test/Results', async (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, GET_TEST_RESULTS_BY_QUERY_VALID_RESPONSE_PATH);
    });

    server.setRoute('/SampleSample/_apis/test/Runs/150', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, COMPLETE_RUN_VALID_RESPONSE_PATH);
    });

    const result = await runInlineTest(
      {
        'playwright.config.ts': `
        module.exports = { 
          use: {
            screenshot: 'only-on-failure',
            trace: 'retain-on-failure',
            video: 'retain-on-failure',
          },
          reporter: [
            ['dot'],
            ['${reporterPath}', { 
              orgUrl: 'http://localhost:${server.PORT}',
              projectName: 'SampleSample',
              planId: 4,
              token: 'token',
              logging: true,
              uploadAttachments: true,
              publishTestResultsMode: 'testRun',
            }]
          ]
        };
      `,
        'a.spec.js': `
        import { test, expect } from '@playwright/test';
        test('foobar', {
          tag: ['@tag1', '@[3]']
        }, async () => {
          expect(1).toBe(1);
        });
        test('with screenshot', {
          tag: ['@tag1', '@[7]']
        }, async ({ page }) => {
          await page.goto('https://playwright.dev/')
          await page.locator('text=Get started').click()
          await expect(page).toHaveTitle(/Getting sttttarted/)
        });
      `,
      },
      { reporter: '' }
    );

    expect(result.output).not.toContain('Failed request: (401)');
    expect(result.output).toContain(
      "'attachmentsType' is not set. Attachments Type will be set to 'screenshot' by default."
    );
    expect(result.output).toMatch(/azure:pw:log Using run (\d.*) to publish test results/);
    expect(result.output).toContain('azure:pw:log Uploading attachments for test: with screenshot');
    expect(result.output).toContain('azure:pw:log Uploaded attachment');
    expect(result.output).toContain('azure:pw:log Left to publish: 0');
    expect(result.output).toContain('azure:pw:log Test results published for 2 test(s)');
    expect(result.output).toMatch(/azure:pw:log Run (\d.*) - Completed/);
    expect(result.exitCode).toBe(1);
    expect(result.passed).toBe(1);
    expect(result.failed).toBe(1);
  });

  test('test with tags specified in test tag config section and in title also', async ({ runInlineTest, server }) => {
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
      server.serveFile(req, res, PROJECT_VALID_RESPONSE_PATH);
    });

    server.setRoute('/SampleSample/_apis/test/Runs', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, CREATE_RUN_VALID_RESPONSE_PATH);
    });

    server.setRoute('/SampleSample/_apis/test/Points', async (req, res) => {
      const body = await getRequestBody(req);
      setHeaders(res, headers);
      expect(body.pointsFilter?.testcaseIds[0]).toBeDefined();
      if (body.pointsFilter?.testcaseIds[0] === 3 && body.pointsFilter?.testcaseIds[1] === 7)
        server.serveFile(req, res, POINTS_3_7_VALID_RESPONSE_PATH);
    });

    server.setRoute('/SampleSample/_apis/test/Runs/150/Results', async (req, res) => {
      const body = await getRequestBody(req);
      setHeaders(res, headers);
      expect(body[0].testPoint?.id).toBeDefined();
      if (body[0].testPoint?.id === '1' && body[1].testPoint?.id === '2')
        server.serveFile(req, res, TEST_RUN_RESULTS_3_7_VALID_RESPONSE_PATH);
    });

    server.setRoute('/SampleSample/_apis/test/Runs/150/Results/100001/Attachments', async (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, RUN_RESULTS_ATTACHMENTS_VALID_RESPONSE_PATH);
    });

    server.setRoute('/SampleSample/_apis/test/Results', async (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, GET_TEST_RESULTS_BY_QUERY_VALID_RESPONSE_PATH);
    });

    server.setRoute('/SampleSample/_apis/test/Runs/150', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, COMPLETE_RUN_VALID_RESPONSE_PATH);
    });

    const result = await runInlineTest(
      {
        'playwright.config.ts': `
        module.exports = { 
          use: {
            screenshot: 'only-on-failure',
            trace: 'retain-on-failure',
            video: 'retain-on-failure',
          },
          reporter: [
            ['dot'],
            ['${reporterPath}', { 
              orgUrl: 'http://localhost:${server.PORT}',
              projectName: 'SampleSample',
              planId: 4,
              token: 'token',
              logging: true,
              uploadAttachments: true,
              publishTestResultsMode: 'testRun',
            }]
          ]
        };
      `,
        'a.spec.js': `
        import { test, expect } from '@playwright/test';
        test('[3] foobar', {
          tag: ['@tag1', '@[3]']
        }, async () => {
          expect(1).toBe(1);
        });
        test('[7] with screenshot', {
          tag: ['@tag1', '@[7]']
        }, async ({ page }) => {
          await page.goto('https://playwright.dev/')
          await page.locator('text=Get started').click()
          await expect(page).toHaveTitle(/Getting sttttarted/)
        });
      `,
      },
      { reporter: '' }
    );

    expect(result.output).not.toContain('Failed request: (401)');
    expect(result.output).toContain(
      "'attachmentsType' is not set. Attachments Type will be set to 'screenshot' by default."
    );
    expect(result.output).toMatch(/azure:pw:log Using run (\d.*) to publish test results/);
    expect(result.output).toContain('azure:pw:log Uploading attachments for test: [7] with screenshot');
    expect(result.output).toContain('azure:pw:log Uploaded attachment');
    expect(result.output).toContain('azure:pw:log Left to publish: 0');
    expect(result.output).toContain('azure:pw:log Test results published for 2 test(s)');
    expect(result.output).toMatch(/azure:pw:log Run (\d.*) - Completed/);
    expect(result.exitCode).toBe(1);
    expect(result.passed).toBe(1);
    expect(result.failed).toBe(1);
  });
});
