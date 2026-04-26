import path from 'path';

import { getRequestBody, setHeaders } from '../config/utils';
import azureAreas from './assets/azure-reporter/azureAreas';
import headers from './assets/azure-reporter/azureHeaders';
import location from './assets/azure-reporter/azureLocationOptionsResponse.json';
import { reporterPath } from './reporterPath';
import { expect, test } from './test-fixtures';

const TEST_OPTIONS_RESPONSE_PATH = path.join(__dirname, 'assets', 'azure-reporter', 'azureTestOptionsResponse.json');
const CORE_OPTIONS_RESPONSE_PATH = path.join(__dirname, 'assets', 'azure-reporter', 'azureCoreOptionsResponse.json');
const PROJECT_VALID_RESPONSE_PATH = path.join(__dirname, 'assets', 'azure-reporter', 'projectValidResponse.json');
const CREATE_RUN_VALID_RESPONSE_PATH = path.join(__dirname, 'assets', 'azure-reporter', 'createRunValidResponse.json');
const POINTS_3_VALID_RESPONSE_PATH = path.join(__dirname, 'assets', 'azure-reporter', 'points3Response.json');
const COMPLETE_RUN_VALID_RESPONSE_PATH = path.join(__dirname, 'assets', 'azure-reporter', 'completeRunValidResponse.json');
const TEST_RUN_RESULTS_3_VALID_RESPONSE_PATH = path.join(
  __dirname,
  'assets',
  'azure-reporter',
  'testRunResults3ValidResponse.json'
);

function setupCommonRoutes(server: any) {
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
  server.setRoute('/SampleSample/_apis/test/Runs/150', (req, res) => {
    setHeaders(res, headers);
    server.serveFile(req, res, COMPLETE_RUN_VALID_RESPONSE_PATH);
  });
}

test.describe('Publish test step results', () => {
  test('publishTestStepResults disabled by default — no iterationDetails in payload', async ({
    runInlineTest,
    server,
  }) => {
    setupCommonRoutes(server);

    let capturedBody: any;
    server.setRoute('/SampleSample/_apis/test/Runs/150/Results', async (req, res) => {
      capturedBody = await getRequestBody(req);
      setHeaders(res, headers);
      server.serveFile(req, res, TEST_RUN_RESULTS_3_VALID_RESPONSE_PATH);
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
              }]
            ]
          };
        `,
        'a.spec.js': `
          import { test, expect } from '@playwright/test';
          test('[3] foobar', async () => {
            await test.step('[1] step one', async () => {
              expect(1).toBe(1);
            });
          });
        `,
      },
      { reporter: '' }
    );

    expect(result.exitCode).toBe(0);
    expect(result.passed).toBe(1);
    expect(capturedBody).toBeDefined();
    expect(capturedBody[0].iterationDetails).toBeUndefined();
  });

  test('publishTestStepResults: true — sends iterationDetails with correct actionPath for tagged steps', async ({
    runInlineTest,
    server,
  }) => {
    setupCommonRoutes(server);

    let capturedBody: any;
    server.setRoute('/SampleSample/_apis/test/Runs/150/Results', async (req, res) => {
      capturedBody = await getRequestBody(req);
      setHeaders(res, headers);
      server.serveFile(req, res, TEST_RUN_RESULTS_3_VALID_RESPONSE_PATH);
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
                publishTestStepResults: true,
              }]
            ]
          };
        `,
        'a.spec.js': `
          import { test, expect } from '@playwright/test';
          test('[3] foobar', async () => {
            await test.step('[1] first step passes', async () => {
              expect(1).toBe(1);
            });
            await test.step('[2] second step passes', async () => {
              expect(2).toBe(2);
            });
          });
        `,
      },
      { reporter: '' }
    );

    expect(result.exitCode).toBe(0);
    expect(result.passed).toBe(1);
    expect(capturedBody).toBeDefined();

    const iterationDetails = capturedBody[0].iterationDetails;
    expect(iterationDetails).toHaveLength(1);

    const actionResults = iterationDetails[0].actionResults;
    expect(actionResults).toHaveLength(2);

    // Step [1]: actionPath = (1+1) = 2 → '00000002'
    expect(actionResults[0].actionPath).toBe('00000002');
    expect(actionResults[0].stepIdentifier).toBe('1');
    expect(actionResults[0].outcome).toBe('Passed');
    expect(actionResults[0].iterationId).toBe(1);

    // Step [2]: actionPath = (2+1) = 3 → '00000003'
    expect(actionResults[1].actionPath).toBe('00000003');
    expect(actionResults[1].stepIdentifier).toBe('2');
    expect(actionResults[1].outcome).toBe('Passed');

    expect(iterationDetails[0].outcome).toBe('Passed');
  });

  test('publishTestStepResults: true — failed step sets outcome Failed with errorMessage', async ({
    runInlineTest,
    server,
  }) => {
    setupCommonRoutes(server);

    let capturedBody: any;
    server.setRoute('/SampleSample/_apis/test/Runs/150/Results', async (req, res) => {
      capturedBody = await getRequestBody(req);
      setHeaders(res, headers);
      server.serveFile(req, res, TEST_RUN_RESULTS_3_VALID_RESPONSE_PATH);
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
                publishTestStepResults: true,
              }]
            ]
          };
        `,
        'a.spec.js': `
          import { test, expect } from '@playwright/test';
          test('[3] foobar', async () => {
            await test.step('[1] passing step', async () => {
              expect(1).toBe(1);
            });
            await test.step('[2] failing step', async () => {
              expect(1).toBe(0);
            });
          });
        `,
      },
      { reporter: '' }
    );

    expect(result.exitCode).toBe(1);
    expect(result.failed).toBe(1);
    expect(capturedBody).toBeDefined();

    const iterationDetails = capturedBody[0].iterationDetails;
    expect(iterationDetails).toHaveLength(1);

    const actionResults = iterationDetails[0].actionResults;
    expect(actionResults).toHaveLength(2);

    expect(actionResults[0].outcome).toBe('Passed');
    expect(actionResults[0].errorMessage).toBeUndefined();

    expect(actionResults[1].outcome).toBe('Failed');
    expect(actionResults[1].errorMessage).toBeDefined();

    expect(iterationDetails[0].outcome).toBe('Failed');
  });

  test('publishTestStepResults: true — steps without [N] are auto-numbered sequentially', async ({
    runInlineTest,
    server,
  }) => {
    setupCommonRoutes(server);

    let capturedBody: any;
    server.setRoute('/SampleSample/_apis/test/Runs/150/Results', async (req, res) => {
      capturedBody = await getRequestBody(req);
      setHeaders(res, headers);
      server.serveFile(req, res, TEST_RUN_RESULTS_3_VALID_RESPONSE_PATH);
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
                publishTestStepResults: true,
              }]
            ]
          };
        `,
        'a.spec.js': `
          import { test, expect } from '@playwright/test';
          test('[3] foobar', async () => {
            await test.step('no id step', async () => {
              expect(1).toBe(1);
            });
            await test.step('another no id step', async () => {
              expect(2).toBe(2);
            });
          });
        `,
      },
      { reporter: '' }
    );

    expect(result.exitCode).toBe(0);
    expect(result.passed).toBe(1);
    expect(capturedBody).toBeDefined();

    const actionResults = capturedBody[0].iterationDetails[0].actionResults;
    expect(actionResults).toHaveLength(2);

    // Auto-numbered: step 1 → actionPath '00000002', step 2 → actionPath '00000003'
    expect(actionResults[0].actionPath).toBe('00000002');
    expect(actionResults[0].stepIdentifier).toBe('1');

    expect(actionResults[1].actionPath).toBe('00000003');
    expect(actionResults[1].stepIdentifier).toBe('2');
  });

  test('publishTestStepResults: true — mixed tagged and untagged steps auto-number correctly', async ({
    runInlineTest,
    server,
  }) => {
    setupCommonRoutes(server);

    let capturedBody: any;
    server.setRoute('/SampleSample/_apis/test/Runs/150/Results', async (req, res) => {
      capturedBody = await getRequestBody(req);
      setHeaders(res, headers);
      server.serveFile(req, res, TEST_RUN_RESULTS_3_VALID_RESPONSE_PATH);
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
                publishTestStepResults: true,
              }]
            ]
          };
        `,
        'a.spec.js': `
          import { test, expect } from '@playwright/test';
          test('[3] foobar', async () => {
            await test.step('auto step', async () => {  // → step 1
              expect(1).toBe(1);
            });
            await test.step('[3] tagged step', async () => {  // → step 3 (counter resets to 4)
              expect(1).toBe(1);
            });
            await test.step('auto after tag', async () => {  // → step 4
              expect(1).toBe(1);
            });
          });
        `,
      },
      { reporter: '' }
    );

    expect(result.exitCode).toBe(0);
    expect(result.passed).toBe(1);
    expect(capturedBody).toBeDefined();

    const actionResults = capturedBody[0].iterationDetails[0].actionResults;
    expect(actionResults).toHaveLength(3);

    expect(actionResults[0].stepIdentifier).toBe('1');
    expect(actionResults[0].actionPath).toBe('00000002');

    expect(actionResults[1].stepIdentifier).toBe('3');
    expect(actionResults[1].actionPath).toBe('00000004');

    expect(actionResults[2].stepIdentifier).toBe('4');
    expect(actionResults[2].actionPath).toBe('00000005');
  });

  test('publishTestStepResults: true — test with no steps sends no iterationDetails', async ({
    runInlineTest,
    server,
  }) => {
    setupCommonRoutes(server);

    let capturedBody: any;
    server.setRoute('/SampleSample/_apis/test/Runs/150/Results', async (req, res) => {
      capturedBody = await getRequestBody(req);
      setHeaders(res, headers);
      server.serveFile(req, res, TEST_RUN_RESULTS_3_VALID_RESPONSE_PATH);
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
                publishTestStepResults: true,
              }]
            ]
          };
        `,
        'a.spec.js': `
          import { test, expect } from '@playwright/test';
          test('[3] foobar no steps', async () => {
            expect(1).toBe(1);
          });
        `,
      },
      { reporter: '' }
    );

    expect(result.exitCode).toBe(0);
    expect(result.passed).toBe(1);
    expect(capturedBody).toBeDefined();
    expect(capturedBody[0].iterationDetails).toBeUndefined();
  });
});
