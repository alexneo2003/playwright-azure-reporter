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
const WORK_ITEM_TRACKING_OPTIONS_RESPONSE_PATH = asset('azureWorkItemTrackingOptionsResponse.json');
const PROJECT_VALID_RESPONSE_PATH = asset('projectValidResponse.json');
const CREATE_RUN_VALID_RESPONSE_PATH = asset('createRunValidResponse.json');
const POINTS_3_VALID_RESPONSE_PATH = asset('points3Response.json');
const POINTS_3_7_VALID_RESPONSE_PATH = asset('points3-7Response.json');
const COMPLETE_RUN_VALID_RESPONSE_PATH = asset('completeRunValidResponse.json');
const TEST_RUN_RESULTS_3_VALID_RESPONSE_PATH = asset('testRunResults3ValidResponse.json');
const TEST_RUN_RESULTS_3_7_VALID_RESPONSE_PATH = asset('testRunResults3-7ValidResponse.json');

type Captured = { postBodies: any[]; patchBodies: any[] };
type WorkItemMock = { id: number; stepsXml?: string; status?: number };

const stepsXml = (...ids: Array<number | string>) =>
  `<steps id="0" last="${ids.length + 1}">${ids
    .map((id) =>
      typeof id === 'string'
        ? `<compref id="${id.replace('shared:', '')}" ref="4242"/>`
        : `<step id="${id}" type="ActionStep"><parameterizedString isformatted="true">step ${id}</parameterizedString></step>`
    )
    .join('')}</steps>`;

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
  server.setRoute('/_apis/wit', (req: any, res: any) => {
    setHeaders(res, headers);
    server.serveFile(req, res, WORK_ITEM_TRACKING_OPTIONS_RESPONSE_PATH);
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

/** Mocks GET /_apis/wit/WorkItems/{id}?fields=Microsoft.VSTS.TCM.Steps (the mock server matches the full path including the query) and counts the requests per work item. */
function mockWorkItems(server: any, items: WorkItemMock[]): Map<number, number> {
  const requests = new Map<number, number>();
  for (const item of items) {
    requests.set(item.id, 0);
    server.setRoute(`/_apis/wit/WorkItems/${item.id}?fields=Microsoft.VSTS.TCM.Steps`, (req: any, res: any) => {
      requests.set(item.id, (requests.get(item.id) ?? 0) + 1);
      if (item.status) {
        res.statusCode = item.status;
        res.end(JSON.stringify({ message: `status ${item.status}` }));
        return;
      }
      setHeaders(res, headers);
      const fields: Record<string, string> = {};
      if (item.stepsXml !== undefined) fields['Microsoft.VSTS.TCM.Steps'] = item.stepsXml;
      res.end(JSON.stringify({ id: item.id, fields }));
    });
  }
  return requests;
}

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

const actionsOf = (patchBodies: any[]) =>
  patchBodies[0][0].iterationDetails[0].actionResults.map((a: any) => [a.stepIdentifier, a.outcome]);

test.describe('Publish test step results aligned with the test case work item', () => {
  test('maps steps onto the real work item step ids and reports unreached steps as NotExecuted', async ({
    runInlineTest,
    server,
  }) => {
    setupCommonRoutes(server);
    const captured = captureResultsRoute(server, 150, TEST_RUN_RESULTS_3_VALID_RESPONSE_PATH);
    const workItemRequests = mockWorkItems(server, [{ id: 3, stepsXml: stepsXml(2, 3, 5, 9) }]);

    const result = await runInlineTest(
      {
        'playwright.config.ts': reporterConfig(server.PORT, 'publishTestSteps: true,'),
        'a.spec.js': `
          import { test, expect } from '@playwright/test';
          test('[3] foobar', async () => {
            await test.step('open', async () => {});
            await test.step('login', async () => { expect(1).toBe(0); });
          });
        `,
      },
      { reporter: '' }
    );

    expect(result.exitCode).toBe(1);
    expect(workItemRequests.get(3)).toBe(1);
    expect(captured.patchBodies).toHaveLength(1);

    const actions = captured.patchBodies[0][0].iterationDetails[0].actionResults;
    expect(actions.map((a: any) => [a.stepIdentifier, a.actionPath, a.outcome])).toEqual([
      ['2', '00000002', 'Passed'],
      ['3', '00000003', 'Failed'],
      ['5', '00000005', 'NotExecuted'],
      ['9', '00000009', 'NotExecuted'],
    ]);
    expect(actions[2].errorMessage).toBe('Not executed: test stopped after step 2 failed ("login")');
    expect(actions[2].startedDate).toBeUndefined();
    expect(result.output).toContain('azure:pw:log Test steps summary: 4 step result(s) published for 1 test result(s)');
    expect(result.output).not.toContain('azure:pw:warn [testSteps]');
  });

  test('reads the work item once per test case for the whole run', async ({ runInlineTest, server }) => {
    setupCommonRoutes(server);
    const captured = captureResultsRoute(server, 150, TEST_RUN_RESULTS_3_VALID_RESPONSE_PATH);
    const workItemRequests = mockWorkItems(server, [{ id: 3, stepsXml: stepsXml(2, 3) }]);

    const result = await runInlineTest(
      {
        'playwright.config.ts': reporterConfig(server.PORT, 'publishTestSteps: true,'),
        'a.spec.js': `
          import { test, expect } from '@playwright/test';
          test('[3] first', async () => {
            await test.step('one', async () => {});
          });
          test('[3] second', async () => {
            await test.step('one', async () => {});
            await test.step('two', async () => {});
          });
          test('[3] third', async () => {
            await test.step('one', async () => {});
          });
        `,
      },
      { reporter: '' }
    );

    expect(result.exitCode).toBe(0);
    expect(result.passed).toBe(3);
    expect(workItemRequests.get(3)).toBe(1);
    expect(captured.patchBodies).toHaveLength(3);
  });

  test('falls back to positional ids with a single warning when the work item cannot be read', async ({
    runInlineTest,
    server,
  }) => {
    setupCommonRoutes(server);
    const captured = captureResultsRoute(server, 150, TEST_RUN_RESULTS_3_VALID_RESPONSE_PATH);
    mockWorkItems(server, [{ id: 3, status: 403 }]);

    const result = await runInlineTest(
      {
        'playwright.config.ts': reporterConfig(server.PORT, 'publishTestSteps: true,'),
        'a.spec.js': `
          import { test, expect } from '@playwright/test';
          test('[3] first', async () => {
            await test.step('one', async () => {});
            await test.step('two', async () => {});
          });
          test('[3] second', async () => {
            await test.step('one', async () => {});
          });
        `,
      },
      { reporter: '' }
    );

    expect(result.exitCode).toBe(0);
    expect(captured.patchBodies).toHaveLength(2);
    expect(actionsOf([captured.patchBodies[0]])).toEqual([
      ['2', 'Passed'],
      ['3', 'Passed'],
    ]);

    const warnings = result.output
      .split('\n')
      .filter((line) => line.includes('[testSteps] Cannot read the steps of test case 3'));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('Falling back to positional step ids');
    expect(warnings[0]).toContain('Work Items (Read)');
  });

  test('a test case without steps publishes nothing and warns once', async ({ runInlineTest, server }) => {
    setupCommonRoutes(server);
    const captured = captureResultsRoute(server, 150, TEST_RUN_RESULTS_3_VALID_RESPONSE_PATH);
    mockWorkItems(server, [{ id: 3 }]);

    const result = await runInlineTest(
      {
        'playwright.config.ts': reporterConfig(server.PORT, 'publishTestSteps: true,'),
        'a.spec.js': `
          import { test, expect } from '@playwright/test';
          test('[3] first', async () => {
            await test.step('one', async () => {});
            await test.step('two', async () => {});
          });
          test('[3] second', async () => {
            await test.step('one', async () => {});
          });
        `,
      },
      { reporter: '' }
    );

    expect(result.exitCode).toBe(0);
    expect(captured.postBodies).toHaveLength(2);
    expect(captured.patchBodies).toHaveLength(0);

    const warnings = result.output
      .split('\n')
      .filter((line) => line.includes('[testSteps] Test case 3 has no steps in Azure DevOps'));
    expect(warnings).toHaveLength(1);
    expect(result.output).toContain(
      'azure:pw:log Test steps summary: 0 step result(s) published for 0 test result(s), 3 step(s) not mapped'
    );
  });

  test('alignWithTestCase: false never reads work items and uses positional ids', async ({ runInlineTest, server }) => {
    setupCommonRoutes(server);
    const captured = captureResultsRoute(server, 150, TEST_RUN_RESULTS_3_VALID_RESPONSE_PATH);
    const workItemRequests = mockWorkItems(server, [{ id: 3, stepsXml: stepsXml(2, 3, 5) }]);

    const result = await runInlineTest(
      {
        'playwright.config.ts': reporterConfig(
          server.PORT,
          'publishTestSteps: { enabled: true, alignWithTestCase: false },'
        ),
        'a.spec.js': `
          import { test, expect } from '@playwright/test';
          test('[3] foobar', async () => {
            await test.step('one', async () => {});
            await test.step('two', async () => {});
          });
        `,
      },
      { reporter: '' }
    );

    expect(result.exitCode).toBe(0);
    expect(workItemRequests.get(3)).toBe(0);
    expect(actionsOf(captured.patchBodies)).toEqual([
      ['2', 'Passed'],
      ['3', 'Passed'],
    ]);
  });

  test('shared steps are skipped with a reason and extra Playwright steps are reported', async ({
    runInlineTest,
    server,
  }) => {
    setupCommonRoutes(server);
    const captured = captureResultsRoute(server, 150, TEST_RUN_RESULTS_3_VALID_RESPONSE_PATH);
    mockWorkItems(server, [{ id: 3, stepsXml: stepsXml(2, 'shared:3', 4) }]);

    const result = await runInlineTest(
      {
        'playwright.config.ts': reporterConfig(server.PORT, 'publishTestSteps: true,'),
        'a.spec.js': `
          import { test, expect } from '@playwright/test';
          test('[3] foobar', async () => {
            await test.step('one', async () => {});
            await test.step('two (shared in ADO)', async () => {});
            await test.step('three', async () => {});
            await test.step('four (not in ADO)', async () => {});
          });
        `,
      },
      { reporter: '' }
    );

    expect(result.exitCode).toBe(0);
    expect(actionsOf(captured.patchBodies)).toEqual([
      ['2', 'Passed'],
      ['4', 'Passed'],
    ]);
    expect(result.output).toContain(
      'azure:pw:warn [testSteps] Step "two (shared in ADO)" (#2) of test "[3] foobar" is not published: shared steps are not supported'
    );
    expect(result.output).toContain(
      'azure:pw:warn [testSteps] Step "four (not in ADO)" (#4) of test "[3] foobar" is not published: test case has only 3 step(s)'
    );
    expect(result.output).toContain(
      'azure:pw:log Test steps summary: 2 step result(s) published for 1 test result(s), 2 step(s) not mapped'
    );
  });

  test('testResult mode: a test linked to two test cases gets one iteration per test case', async ({
    runInlineTest,
    server,
  }) => {
    setupCommonRoutes(server);
    server.setRoute('/SampleSample/_apis/test/Points', (req: any, res: any) => {
      setHeaders(res, headers);
      server.serveFile(req, res, POINTS_3_7_VALID_RESPONSE_PATH);
    });
    const captured = captureResultsRoute(server, 150, TEST_RUN_RESULTS_3_7_VALID_RESPONSE_PATH);
    mockWorkItems(server, [
      { id: 3, stepsXml: stepsXml(2, 3) },
      { id: 7, stepsXml: stepsXml(4, 6, 8) },
    ]);

    const queryBodies: any[] = [];
    server.setRoute('/SampleSample/_apis/test/Results', async (req: any, res: any) => {
      const body = await getRequestBody(req);
      queryBodies.push(body);
      setHeaders(res, headers);
      res.end(JSON.stringify(testResultsByQueryResponseMapping(body)));
    });

    const result = await runInlineTest(
      {
        'playwright.config.ts': reporterConfig(server.PORT, 'publishTestSteps: true,'),
        'a.spec.js': `
          import { test, expect } from '@playwright/test';
          test('[3,7] foobar', async () => {
            await test.step('one', async () => {});
            await test.step('two', async () => {});
          });
        `,
      },
      { reporter: '' }
    );

    expect(result.exitCode).toBe(0);
    // ids differ per test case, so the created result ids were resolved through the results query
    expect(queryBodies).toHaveLength(1);
    expect(captured.patchBodies).toHaveLength(1);
    const updates = captured.patchBodies[0];
    expect(updates).toHaveLength(2);
    const byId = Object.fromEntries(
      updates.map((u: any) => [
        u.id,
        u.iterationDetails[0].actionResults.map((a: any) => [a.stepIdentifier, a.outcome]),
      ])
    );
    // test point 1 (test case 3) -> result 100000, test point 2 (test case 7) -> result 100001
    expect(byId[100000]).toEqual([
      ['2', 'Passed'],
      ['3', 'Passed'],
    ]);
    expect(byId[100001]).toEqual([
      ['4', 'Passed'],
      ['6', 'Passed'],
      ['8', 'NotExecuted'],
    ]);
  });

  test('testRun mode: each test point is aligned with its own test case', async ({ runInlineTest, server }) => {
    setupCommonRoutes(server);
    server.setRoute('/SampleSample/_apis/test/Points', (req: any, res: any) => {
      setHeaders(res, headers);
      server.serveFile(req, res, POINTS_3_7_VALID_RESPONSE_PATH);
    });
    const captured = captureResultsRoute(server, 150, TEST_RUN_RESULTS_3_7_VALID_RESPONSE_PATH);
    const workItemRequests = mockWorkItems(server, [
      { id: 3, stepsXml: stepsXml(2, 3) },
      { id: 7, stepsXml: stepsXml(10, 11) },
    ]);
    server.setRoute('/SampleSample/_apis/test/Results', async (req: any, res: any) => {
      const body = await getRequestBody(req);
      setHeaders(res, headers);
      res.end(JSON.stringify(testResultsByQueryResponseMapping(body)));
    });

    const result = await runInlineTest(
      {
        'playwright.config.ts': reporterConfig(
          server.PORT,
          `publishTestSteps: true, publishTestResultsMode: 'testRun',`
        ),
        'a.spec.js': `
          import { test, expect } from '@playwright/test';
          test('[3] first', async () => {
            await test.step('one', async () => {});
          });
          test('[7] second', async () => {
            await test.step('one', async () => {});
            await test.step('two', async () => { expect(1).toBe(0); });
          });
        `,
      },
      { reporter: '' }
    );

    expect(result.exitCode).toBe(1);
    expect(workItemRequests.get(3)).toBe(1);
    expect(workItemRequests.get(7)).toBe(1);
    expect(captured.patchBodies).toHaveLength(1);
    const updates = captured.patchBodies[0];
    expect(updates).toHaveLength(2);
    const byId = Object.fromEntries(
      updates.map((u: any) => [
        u.id,
        u.iterationDetails[0].actionResults.map((a: any) => [a.stepIdentifier, a.outcome]),
      ])
    );
    expect(byId[100000]).toEqual([
      ['2', 'Passed'],
      ['3', 'NotExecuted'],
    ]);
    expect(byId[100001]).toEqual([
      ['10', 'Passed'],
      ['11', 'Failed'],
    ]);
    expect(result.output).toContain('azure:pw:log Test steps summary: 4 step result(s) published for 2 test result(s)');
  });
});
