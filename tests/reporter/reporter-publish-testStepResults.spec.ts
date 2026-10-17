import path from 'path';

import { getRequestBody, setHeaders } from '../config/utils';
import azureAreas from './assets/azure-reporter/azureAreas';
import headers from './assets/azure-reporter/azureHeaders';
import location from './assets/azure-reporter/azureLocationOptionsResponse.json';
import testResultsByQueryResponseMapping from './assets/azure-reporter/testResultsByQueryResponseMapping';
import { reporterPath } from './reporterPath';
import { expect, test } from './test-fixtures';

const asset = (name: string) => path.join(__dirname, 'assets', 'azure-reporter', name);

const TEST_OPTIONS_RESPONSE_PATH = asset('azureTestOptionsResponse.json');
const CORE_OPTIONS_RESPONSE_PATH = asset('azureCoreOptionsResponse.json');
const PROJECT_VALID_RESPONSE_PATH = asset('projectValidResponse.json');
const CREATE_RUN_VALID_RESPONSE_PATH = asset('createRunValidResponse.json');
const POINTS_3_VALID_RESPONSE_PATH = asset('points3Response.json');
const POINTS_3_7_VALID_RESPONSE_PATH = asset('points3-7Response.json');
const COMPLETE_RUN_VALID_RESPONSE_PATH = asset('completeRunValidResponse.json');
const TEST_RUN_RESULTS_3_VALID_RESPONSE_PATH = asset('testRunResults3ValidResponse.json');
const TEST_RUN_RESULTS_3_7_VALID_RESPONSE_PATH = asset('testRunResults3-7ValidResponse.json');
const EXISTING_TEST_RUN_RESULTS_3_RESPONSE_PATH = asset('existingTestRunResults3Response.json');
const UPDATED_TEST_RUN_RESULTS_3_RESPONSE_PATH = asset('updatedTestRunResults3Response.json');

type Captured = {
  postBodies: any[];
  patchBodies: any[];
};

function setupCommonRoutes(server: any) {
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
}

/**
 * Captures the POST that creates results and the PATCH that updates them on the same route.
 * The PATCH response echoes the request so the client gets one updated result per sent one.
 */
function captureResultsRoute(server: any, runId: number, postResponsePath: string): Captured {
  const captured: Captured = { postBodies: [], patchBodies: [] };
  server.setRoute(`/SampleSample/_apis/test/Runs/${runId}/Results`, async (req: any, res: any) => {
    const body = await getRequestBody(req);
    setHeaders(res, headers);
    if (req.method === 'PATCH') {
      captured.patchBodies.push(body);
      res.end(JSON.stringify(body.map((r: any) => ({ id: r.id, outcome: r.outcome, testRun: { id: String(runId) } }))));
      return;
    }
    captured.postBodies.push(body);
    server.serveFile(req, res, postResponsePath);
  });
  return captured;
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

test.describe('Publish test step results', () => {
  test('disabled by default: no iterationDetails in POST and no PATCH', async ({ runInlineTest, server }) => {
    setupCommonRoutes(server);
    const captured = captureResultsRoute(server, 150, TEST_RUN_RESULTS_3_VALID_RESPONSE_PATH);

    const result = await runInlineTest(
      {
        'playwright.config.ts': reporterConfig(server.PORT, ''),
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
    expect(captured.postBodies).toHaveLength(1);
    expect(captured.postBodies[0][0].iterationDetails).toBeUndefined();
    expect(captured.patchBodies).toHaveLength(0);
    expect(result.output).not.toContain('Published step results');
  });

  test('publishTestSteps enabled sends steps with a PATCH after the POST, never inside the POST', async ({
    runInlineTest,
    server,
  }) => {
    setupCommonRoutes(server);
    const captured = captureResultsRoute(server, 150, TEST_RUN_RESULTS_3_VALID_RESPONSE_PATH);

    const result = await runInlineTest(
      {
        'playwright.config.ts': reporterConfig(
          server.PORT,
          'publishTestSteps: { enabled: true, alignWithTestCase: false },'
        ),
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

    expect(captured.postBodies).toHaveLength(1);
    expect(captured.postBodies[0][0].iterationDetails).toBeUndefined();

    expect(captured.patchBodies).toHaveLength(1);
    const [patch] = captured.patchBodies[0];
    expect(patch.id).toBe(100000);
    expect(patch.outcome).toBe('Passed');
    expect(patch.iterationDetails).toHaveLength(1);

    const iteration = patch.iterationDetails[0];
    expect(iteration.id).toBe(1);
    expect(iteration.outcome).toBe('Passed');
    expect(iteration.durationInMs).toBeGreaterThanOrEqual(0);

    const actions = iteration.actionResults;
    expect(actions).toHaveLength(2);
    expect(actions[0]).toMatchObject({
      actionPath: '00000002',
      stepIdentifier: '2',
      iterationId: 1,
      outcome: 'Passed',
      comment: '[1] first step passes',
    });
    expect(actions[1]).toMatchObject({
      actionPath: '00000003',
      stepIdentifier: '3',
      iterationId: 1,
      outcome: 'Passed',
      comment: '[2] second step passes',
    });
    expect(actions[0].errorMessage).toBeUndefined();
    expect(typeof actions[0].startedDate).toBe('string');
    expect(typeof actions[0].completedDate).toBe('string');
    expect(new Date(actions[0].completedDate).getTime()).toBeGreaterThanOrEqual(
      new Date(actions[0].startedDate).getTime()
    );

    expect(result.output).toContain('azure:pw:log Published step results for 1 test result(s)');
    expect(result.output).toContain('azure:pw:log Test steps summary: 2 step result(s) published for 1 test result(s)');
  });

  test('a failed step is reported as Failed with its error message', async ({ runInlineTest, server }) => {
    setupCommonRoutes(server);
    const captured = captureResultsRoute(server, 150, TEST_RUN_RESULTS_3_VALID_RESPONSE_PATH);

    const result = await runInlineTest(
      {
        'playwright.config.ts': reporterConfig(
          server.PORT,
          'publishTestSteps: { enabled: true, alignWithTestCase: false },'
        ),
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

    expect(captured.patchBodies).toHaveLength(1);
    const [patch] = captured.patchBodies[0];
    expect(patch.outcome).toBe('Failed');
    const iteration = patch.iterationDetails[0];
    expect(iteration.outcome).toBe('Failed');

    const actions = iteration.actionResults;
    expect(actions).toHaveLength(2);
    expect(actions[0].outcome).toBe('Passed');
    expect(actions[0].errorMessage).toBeUndefined();
    expect(actions[1].outcome).toBe('Failed');
    expect(actions[1].errorMessage).toContain('toBe');
    expect(actions[1].errorMessage).not.toMatch(/\u001b\[/);
  });

  test('a soft assertion failing inside a test.step marks the step Failed', async ({ runInlineTest, server }) => {
    setupCommonRoutes(server);
    const captured = captureResultsRoute(server, 150, TEST_RUN_RESULTS_3_VALID_RESPONSE_PATH);

    const result = await runInlineTest(
      {
        'playwright.config.ts': reporterConfig(
          server.PORT,
          'publishTestSteps: { enabled: true, alignWithTestCase: false },'
        ),
        'a.spec.js': `
          import { test, expect } from '@playwright/test';
          test('[3] foobar', async () => {
            await test.step('soft checks', async () => {
              expect.soft(1).toBe(0);
            });
            await test.step('still runs', async () => {
              expect(2).toBe(2);
            });
          });
        `,
      },
      { reporter: '' }
    );

    expect(result.exitCode).toBe(1);
    expect(result.failed).toBe(1);

    const actions = captured.patchBodies[0][0].iterationDetails[0].actionResults;
    expect(actions.map((a: any) => [a.stepIdentifier, a.outcome])).toEqual([
      ['2', 'Failed'],
      ['3', 'Passed'],
    ]);
    expect(actions[0].errorMessage).toContain('toBe');
  });

  test('steps without [N] are numbered positionally, an explicit [N] resets the counter', async ({
    runInlineTest,
    server,
  }) => {
    setupCommonRoutes(server);
    const captured = captureResultsRoute(server, 150, TEST_RUN_RESULTS_3_VALID_RESPONSE_PATH);

    const result = await runInlineTest(
      {
        'playwright.config.ts': reporterConfig(
          server.PORT,
          'publishTestSteps: { enabled: true, alignWithTestCase: false },'
        ),
        'a.spec.js': `
          import { test, expect } from '@playwright/test';
          test('[3] foobar', async () => {
            await test.step('auto step', async () => {           // step 1
              expect(1).toBe(1);
            });
            await test.step('[3] tagged step', async () => {     // step 3
              expect(1).toBe(1);
            });
            await test.step('auto after tag', async () => {      // step 4
              expect(1).toBe(1);
            });
          });
        `,
      },
      { reporter: '' }
    );

    expect(result.exitCode).toBe(0);
    const actions = captured.patchBodies[0][0].iterationDetails[0].actionResults;
    expect(actions.map((a: any) => [a.stepIdentifier, a.actionPath])).toEqual([
      ['2', '00000002'],
      ['4', '00000004'],
      ['5', '00000005'],
    ]);
  });

  test('a duplicate step number is skipped with a warning', async ({ runInlineTest, server }) => {
    setupCommonRoutes(server);
    const captured = captureResultsRoute(server, 150, TEST_RUN_RESULTS_3_VALID_RESPONSE_PATH);

    const result = await runInlineTest(
      {
        'playwright.config.ts': reporterConfig(
          server.PORT,
          'publishTestSteps: { enabled: true, alignWithTestCase: false },'
        ),
        'a.spec.js': `
          import { test, expect } from '@playwright/test';
          test('[3] foobar', async () => {
            await test.step('[1] first', async () => {});
            await test.step('[1] duplicate', async () => {});
          });
        `,
      },
      { reporter: '' }
    );

    expect(result.exitCode).toBe(0);
    const actions = captured.patchBodies[0][0].iterationDetails[0].actionResults;
    expect(actions).toHaveLength(1);
    expect(actions[0].comment).toBe('[1] first');
    expect(result.output).toContain(
      'azure:pw:warn [testSteps] Step "[1] duplicate" (#1) of test "[3] foobar" is not published: step number 1 is used by another step'
    );
    expect(result.output).toContain(
      'azure:pw:log Test steps summary: 1 step result(s) published for 1 test result(s), 1 step(s) not mapped'
    );
  });

  test('object form: categories and testStepIdMatcher are honoured', async ({ runInlineTest, server }) => {
    setupCommonRoutes(server);
    const captured = captureResultsRoute(server, 150, TEST_RUN_RESULTS_3_VALID_RESPONSE_PATH);

    const result = await runInlineTest(
      {
        'playwright.config.ts': reporterConfig(
          server.PORT,
          `publishTestSteps: { enabled: true, categories: ['test.step', 'expect'], testStepIdMatcher: /step#(\\d+)/, alignWithTestCase: false },`
        ),
        'a.spec.js': `
          import { test, expect } from '@playwright/test';
          test('[3] foobar', async () => {
            await test.step('step#2 login', async () => {});
            expect(1).toBe(1);
          });
        `,
      },
      { reporter: '' }
    );

    expect(result.exitCode).toBe(0);
    const actions = captured.patchBodies[0][0].iterationDetails[0].actionResults;
    expect(actions).toHaveLength(2);
    // step#2 -> number 2 -> id 3; the top-level expect step follows positionally as number 3 -> id 4
    expect(actions[0]).toMatchObject({ stepIdentifier: '3', actionPath: '00000003', comment: 'step#2 login' });
    expect(actions[1].stepIdentifier).toBe('4');
    expect(actions[1].comment).toMatch(/^expect/i);
  });

  test('object form with enabled: false publishes nothing', async ({ runInlineTest, server }) => {
    setupCommonRoutes(server);
    const captured = captureResultsRoute(server, 150, TEST_RUN_RESULTS_3_VALID_RESPONSE_PATH);

    const result = await runInlineTest(
      {
        'playwright.config.ts': reporterConfig(server.PORT, `publishTestSteps: { enabled: false },`),
        'a.spec.js': `
          import { test, expect } from '@playwright/test';
          test('[3] foobar', async () => {
            await test.step('[1] step', async () => {});
          });
        `,
      },
      { reporter: '' }
    );

    expect(result.exitCode).toBe(0);
    expect(captured.patchBodies).toHaveLength(0);
  });

  test('a test without steps sends no PATCH', async ({ runInlineTest, server }) => {
    setupCommonRoutes(server);
    const captured = captureResultsRoute(server, 150, TEST_RUN_RESULTS_3_VALID_RESPONSE_PATH);

    const result = await runInlineTest(
      {
        'playwright.config.ts': reporterConfig(
          server.PORT,
          'publishTestSteps: { enabled: true, alignWithTestCase: false },'
        ),
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
    expect(captured.postBodies).toHaveLength(1);
    expect(captured.patchBodies).toHaveLength(0);
    expect(result.output).not.toContain('Test steps summary');
  });

  test('a failing PATCH does not break publishing of the test result', async ({ runInlineTest, server }) => {
    setupCommonRoutes(server);
    server.setRoute('/SampleSample/_apis/test/Runs/150/Results', async (req: any, res: any) => {
      await getRequestBody(req);
      if (req.method === 'PATCH') {
        res.statusCode = 500;
        res.end('boom');
        return;
      }
      setHeaders(res, headers);
      server.serveFile(req, res, TEST_RUN_RESULTS_3_VALID_RESPONSE_PATH);
    });

    const result = await runInlineTest(
      {
        'playwright.config.ts': reporterConfig(
          server.PORT,
          'publishTestSteps: { enabled: true, alignWithTestCase: false },'
        ),
        'a.spec.js': `
          import { test, expect } from '@playwright/test';
          test('[3] foobar', async () => {
            await test.step('[1] step', async () => {});
          });
        `,
      },
      { reporter: '' }
    );

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('azure:pw:error [testSteps] Failed to publish step results');
    expect(result.output).toContain('azure:pw:log Result published: [3] foobar');
    expect(result.output).toContain('azure:pw:log Test results published for 1 test(s), 1 test point(s)');
  });

  test('testRun mode: steps are PATCHed on result ids resolved through the results query', async ({
    runInlineTest,
    server,
  }) => {
    setupCommonRoutes(server);
    server.setRoute('/SampleSample/_apis/test/Points', (req: any, res: any) => {
      setHeaders(res, headers);
      server.serveFile(req, res, POINTS_3_7_VALID_RESPONSE_PATH);
    });
    const captured = captureResultsRoute(server, 150, TEST_RUN_RESULTS_3_7_VALID_RESPONSE_PATH);

    const queryBodies: any[] = [];
    server.setRoute('/SampleSample/_apis/test/Results', async (req: any, res: any) => {
      const body = await getRequestBody(req);
      queryBodies.push(body);
      setHeaders(res, headers);
      res.end(JSON.stringify(testResultsByQueryResponseMapping(body)));
    });

    const result = await runInlineTest(
      {
        'playwright.config.ts': reporterConfig(
          server.PORT,
          `publishTestSteps: { enabled: true, alignWithTestCase: false }, publishTestResultsMode: 'testRun',`
        ),
        'a.spec.js': `
          import { test, expect } from '@playwright/test';
          test('[3] foobar', async () => {
            await test.step('[1] open', async () => {});
            await test.step('[2] check', async () => { expect(1).toBe(0); });
          });
          test('[7] no steps here', async () => {
            expect(1).toBe(1);
          });
        `,
      },
      { reporter: '' }
    );

    expect(result.exitCode).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.passed).toBe(1);

    // One POST for the pack, no steps inside it
    expect(captured.postBodies).toHaveLength(1);
    expect(captured.postBodies[0].every((r: any) => r.iterationDetails === undefined)).toBe(true);

    // The results query resolves created ids by test point
    expect(queryBodies).toHaveLength(1);

    // One PATCH, only for the test that has steps; the id comes from the query (100000 for test point 1)
    expect(captured.patchBodies).toHaveLength(1);
    expect(captured.patchBodies[0]).toHaveLength(1);
    const [patch] = captured.patchBodies[0];
    expect(patch.id).toBe(100000);
    expect(patch.outcome).toBe('Failed');
    expect(patch.iterationDetails[0].actionResults.map((a: any) => [a.stepIdentifier, a.outcome])).toEqual([
      ['2', 'Passed'],
      ['3', 'Failed'],
    ]);

    expect(result.output).toContain('azure:pw:log Published step results for 1 test result(s)');
    expect(result.output).toContain('azure:pw:log Test results published for 2 test(s), 2 test point(s)');
    expect(result.output).toContain('azure:pw:log Test steps summary: 2 step result(s) published for 1 test result(s)');
  });

  test('testRunADO mode: steps ride the existing PATCH of the result', async ({ runInlineTest, server }) => {
    setupCommonRoutes(server);

    server.setRoute('/SampleSample/_apis/test/Runs/789/Results?%24skip=0&%24top=200', (req: any, res: any) => {
      setHeaders(res, headers);
      if (req.method === 'GET') server.serveFile(req, res, EXISTING_TEST_RUN_RESULTS_3_RESPONSE_PATH);
    });

    const patchBodies: any[] = [];
    server.setRoute('/SampleSample/_apis/test/Runs/789/Results', async (req: any, res: any) => {
      const body = await getRequestBody(req);
      setHeaders(res, headers);
      if (req.method === 'PATCH') {
        patchBodies.push(body);
        server.serveFile(req, res, UPDATED_TEST_RUN_RESULTS_3_RESPONSE_PATH);
      }
    });

    server.setRoute('/SampleSample/_apis/test/Runs/789', (req: any, res: any) => {
      setHeaders(res, headers);
      server.serveFile(req, res, COMPLETE_RUN_VALID_RESPONSE_PATH);
    });

    const result = await runInlineTest(
      {
        'playwright.config.ts': reporterConfig(
          server.PORT,
          `publishTestSteps: { enabled: true, alignWithTestCase: false }, publishTestResultsMode: 'testRunADO', isExistingTestRun: true, testRunId: 789,`
        ),
        'a.spec.js': `
          import { test, expect } from '@playwright/test';
          test('[3] foobar', async () => {
            await test.step('[1] open', async () => {});
            await test.step('[2] check', async () => { expect(1).toBe(0); });
          });
        `,
      },
      { reporter: '' },
      { AZUREPWDEBUG: '1' }
    );

    expect(result.exitCode).toBe(1);
    expect(result.failed).toBe(1);

    // A single PATCH carries both the result update and the step results
    expect(patchBodies).toHaveLength(1);
    expect(patchBodies[0]).toHaveLength(1);
    const [update] = patchBodies[0];
    expect(update.testPoint).toEqual({ id: '1' });
    expect(update.outcome).toBe('Failed');
    expect(update.iterationDetails).toHaveLength(1);
    expect(update.iterationDetails[0].outcome).toBe('Failed');
    expect(update.iterationDetails[0].actionResults.map((a: any) => [a.stepIdentifier, a.outcome])).toEqual([
      ['2', 'Passed'],
      ['3', 'Failed'],
    ]);

    expect(result.output).toContain('azure:pw:log Test results published for 1 test(s), 1 test point(s)');
    expect(result.output).toContain('azure:pw:log Test steps summary: 2 step result(s) published for 1 test result(s)');
    expect(result.output).toContain('Run 789 - Completed');
  });
});
