import path from 'path';

import { getRequestBody, setHeaders } from '../config/utils';
import azureAreas from './assets/azure-reporter/azureAreas';
import headers from './assets/azure-reporter/azureHeaders';
import location from './assets/azure-reporter/azureLocationOptionsResponse.json';
import { reporterPath } from './reporterPath';
import { expect, test } from './test-fixtures';

const asset = (name: string) => path.join(__dirname, 'assets', 'azure-reporter', name);

type Point = { id: number; plan: number; testCase: number; configuration?: number };
type Plan = { id: number; name: string; state?: string; startDate?: string; endDate?: string; iteration?: string };

type Calls = {
  /** Created runs: the plan and the name of the create request. */
  runs: Array<{ id: number; plan: number; name: string }>;
  /** Test point ids of every "add results" request, by run id. */
  results: Map<number, number[][]>;
  completed: number[];
  pointsQueries: number;
  planQueries: number;
  attachments: Array<{ runId: number; fileName: string; text: string }>;
};

const runIdOf = (plan: number) => 1000 + plan;

/**
 * A mock of Azure DevOps that keeps the rule a spike on a live organization confirmed: a request with a test
 * point of another plan is rejected as a whole with 404. A reporter that mixes plans in a run fails these tests.
 */
function setupAzure(
  server: any,
  options: {
    points: Point[];
    plans?: Plan[];
    runIds?: number[];
    failRunCreationFor?: number[];
    /** Answer the plans request late, as a slow organization does: the tests finish before the plans are selected. */
    plansDelayMs?: number;
  }
): Calls {
  const calls: Calls = {
    runs: [],
    results: new Map(),
    completed: [],
    pointsQueries: 0,
    planQueries: 0,
    attachments: [],
  };
  const json = (res: any, body: unknown, status = 200) => {
    setHeaders(res, headers);
    res.statusCode = status;
    res.end(JSON.stringify(body));
  };

  server.setRoute('/_apis/Location', (_: any, res: any) => json(res, location));
  server.setRoute('/_apis/ResourceAreas', (_: any, res: any) => json(res, azureAreas(server.PORT)));
  server.setRoute('/_apis/Test', (req: any, res: any) => {
    setHeaders(res, headers);
    server.serveFile(req, res, asset('azureTestOptionsResponse.json'));
  });
  server.setRoute('/_apis/core', (req: any, res: any) => {
    setHeaders(res, headers);
    server.serveFile(req, res, asset('azureCoreOptionsResponse.json'));
  });
  server.setRoute('/_apis/testplan', (req: any, res: any) => {
    setHeaders(res, headers);
    server.serveFile(req, res, asset('azureTestPlanOptionsResponse.json'));
  });
  server.setRoute('/_apis/projects/SampleSample', (req: any, res: any) => {
    setHeaders(res, headers);
    server.serveFile(req, res, asset('projectValidResponse.json'));
  });

  server.setRoute(
    '/SampleSample/_apis/testplan/Plans?includePlanDetails=true&filterActivePlans=false',
    async (_: any, res: any) => {
      calls.planQueries++;
      if (options.plansDelayMs) await new Promise((resolve) => setTimeout(resolve, options.plansDelayMs));
      json(res, { value: options.plans ?? [], count: options.plans?.length ?? 0 });
    }
  );

  server.setRoute('/SampleSample/_apis/test/Points', async (req: any, res: any) => {
    calls.pointsQueries++;
    const body = await getRequestBody(req);
    const ids: number[] = body.pointsFilter.testcaseIds;
    json(res, {
      points: options.points
        .filter((point) => ids.includes(point.testCase))
        .map((point) => ({
          id: point.id,
          configuration: { id: String(point.configuration ?? 1), name: 'Windows 10' },
          suite: { id: '6' },
          testCase: { id: String(point.testCase) },
          testPlan: { id: String(point.plan) },
        })),
      pointsFilter: body.pointsFilter,
    });
  });

  server.setRoute('/SampleSample/_apis/test/Runs', async (req: any, res: any) => {
    const body = await getRequestBody(req);
    const plan = parseInt(body.plan.id, 10);
    if (options.failRunCreationFor?.includes(plan)) {
      json(res, { message: `Test plan ${plan} is not available.` }, 500);
      return;
    }
    calls.runs.push({ id: runIdOf(plan), plan, name: body.name });
    json(res, { id: runIdOf(plan), name: body.name, plan: { id: String(plan) }, state: 'Unspecified' });
  });

  const plansWithRuns = options.runIds ?? [...new Set(options.points.map((point) => point.plan))];
  for (const plan of plansWithRuns) {
    const runId = runIdOf(plan);
    server.setRoute(`/SampleSample/_apis/test/Runs/${runId}/Results`, async (req: any, res: any) => {
      const body: Array<{ testPoint: { id: string } }> = await getRequestBody(req);
      const pointIds = body.map((result) => parseInt(result.testPoint.id, 10));
      const foreign = pointIds.find((id) => options.points.find((point) => point.id === id)?.plan !== plan);
      if (foreign !== undefined) {
        json(res, { message: `Test point ${foreign} not found.`, typeKey: 'TestObjectNotFoundException' }, 404);
        return;
      }
      calls.results.set(runId, [...(calls.results.get(runId) ?? []), pointIds]);
      json(res, {
        count: pointIds.length,
        value: pointIds.map((id) => ({
          id: 100000 + id,
          testRun: { id: String(runId) },
          testPoint: { id: String(id) },
        })),
      });
    });
    server.setRoute(`/SampleSample/_apis/test/Runs/${runId}`, async (req: any, res: any) => {
      const body = await getRequestBody(req);
      if (body.state === 'Completed') calls.completed.push(runId);
      json(res, { id: runId, state: 'Completed' });
    });
    server.setRoute(`/SampleSample/_apis/test/Runs/${runId}/Attachments`, async (req: any, res: any) => {
      const body = await getRequestBody(req);
      calls.attachments.push({
        runId,
        fileName: body.fileName,
        text: Buffer.from(body.stream, 'base64').toString('utf8'),
      });
      json(res, { id: 42 });
    });
  }
  return calls;
}

const reporterConfig = (port: number, options: string, config = '') => `
  module.exports = {
    ${config}
    reporter: [
      ['line'],
      ['${reporterPath}', {
        orgUrl: 'http://localhost:${port}',
        projectName: 'SampleSample',
        token: 'token',
        logging: true,
        ${options}
      }]
    ]
  };
`;

/** [3] is in plans 4 and 5 (fan-out), [7] only in plan 5 (scatter), [9] only in plan 6. */
const POINTS: Point[] = [
  { id: 11, plan: 4, testCase: 3 },
  { id: 12, plan: 5, testCase: 3 },
  { id: 13, plan: 5, testCase: 7 },
  { id: 14, plan: 6, testCase: 9 },
];

const threeTestsSpec = `
  import { test, expect } from '@playwright/test';
  test('[3] in two plans', async () => {
    expect(1).toBe(1);
  });
  test('[7] in one plan', async () => {
    expect(1).toBe(0);
  });
  test('[9] in a plan that is not selected', async () => {
    expect(1).toBe(1);
  });
`;

const sorted = (ids: number[]) => [...ids].sort((a, b) => a - b);
const pointsOfRun = (calls: Calls, plan: number) => sorted((calls.results.get(runIdOf(plan)) ?? []).flat());

test.describe('several test plans', () => {
  for (const mode of ['testResult', 'testRun'] as const) {
    test(`${mode}: a list of plans gets one run per plan that has test points`, async ({ runInlineTest, server }) => {
      const calls = setupAzure(server, { points: POINTS });

      const result = await runInlineTest(
        {
          'playwright.config.ts': reporterConfig(server.PORT, `planId: [4, 5, 8], publishTestResultsMode: '${mode}',`),
          'a.spec.js': threeTestsSpec,
        },
        { reporter: '' }
      );

      expect(result.passed).toBe(2);
      expect(result.failed).toBe(1);

      // plan 8 is selected but has no test points of these tests, plan 6 has points but is not selected
      expect(calls.runs.map((run) => run.plan).sort()).toEqual([4, 5]);
      expect(calls.runs.find((run) => run.plan === 4)!.name).toBe('Playwright Test Run (plan 4)');
      expect(calls.runs.find((run) => run.plan === 5)!.name).toBe('Playwright Test Run (plan 5)');
      expect(pointsOfRun(calls, 4)).toEqual([11]);
      expect(pointsOfRun(calls, 5)).toEqual([12, 13]);
      expect(sorted(calls.completed)).toEqual([1004, 1005]);
      if (mode === 'testRun') {
        // one request per plan, never a mixed one
        expect(calls.results.get(1004)).toHaveLength(1);
        expect(calls.results.get(1005)).toHaveLength(1);
      }

      expect(result.output).toContain('Results are published to 3 test plan(s): 4, 5, 8.');
      expect(result.output).toContain('Test results published for 2 test(s), 3 test point(s) in 2 test plan(s)');
      expect(result.output).toContain('Run 1004 - Completed (test plan 4, 1 result(s))');
      expect(result.output).toContain('Run 1005 - Completed (test plan 5, 2 result(s))');
      expect(result.output).toContain('No test points found for test case [9] associated with test plans 4, 5, 8');

      expect(result.output).toContain(
        '##vso[task.setvariable variable=AZURE_PW_TEST_RUN_IDS;isOutput=true]{"4":1004,"5":1005}'
      );
      expect(result.output).toContain('##vso[task.setvariable variable=AZURE_PW_TEST_RUN_ID_4;isOutput=true]1004');
      expect(result.output).toContain('##vso[task.setvariable variable=AZURE_PW_TEST_RUN_ID_5;isOutput=true]1005');
      // the single-run variable is also read back as testRunId, it is not set for several runs
      expect(result.output).not.toContain('variable=AZURE_PW_TEST_RUN_ID;');
      expect(result.output).not.toContain('azure:pw:error');
      // one test point per plan is expected, not ambiguous
      expect(result.output).not.toContain('testPoints found');
      expect(calls.planQueries).toBe(0);
    });
  }

  test('testResult: tests that finish in parallel share the run of a plan', async ({ runInlineTest, server }) => {
    const points: Point[] = [];
    for (let testCase = 1; testCase <= 6; testCase++) {
      points.push({ id: testCase * 10 + 4, plan: 4, testCase }, { id: testCase * 10 + 5, plan: 5, testCase });
    }
    const calls = setupAzure(server, { points });

    const result = await runInlineTest(
      {
        'playwright.config.ts': reporterConfig(server.PORT, 'planId: [4, 5],', 'fullyParallel: true,'),
        'a.spec.js': `
          import { test, expect } from '@playwright/test';
          for (const id of [1, 2, 3]) test('[' + id + '] a', async () => { expect(1).toBe(1); });
        `,
        'b.spec.js': `
          import { test, expect } from '@playwright/test';
          for (const id of [4, 5, 6]) test('[' + id + '] b', async () => { expect(1).toBe(1); });
        `,
      },
      { reporter: '' }
    );

    expect(result.passed).toBe(6);
    expect(calls.runs).toHaveLength(2);
    expect(pointsOfRun(calls, 4)).toEqual([14, 24, 34, 44, 54, 64]);
    expect(pointsOfRun(calls, 5)).toEqual([15, 25, 35, 45, 55, 65]);
    expect(sorted(calls.completed)).toEqual([1004, 1005]);
    expect(result.output).toContain('Test results published for 6 test(s), 12 test point(s) in 2 test plan(s)');
  });

  test('a list of one plan behaves exactly as that plan', async ({ runInlineTest, server }) => {
    const calls = setupAzure(server, { points: POINTS });

    const result = await runInlineTest(
      {
        'playwright.config.ts': reporterConfig(server.PORT, "planId: ['5'],"),
        'a.spec.js': threeTestsSpec,
      },
      { reporter: '' }
    );

    expect(calls.runs).toEqual([{ id: 1005, plan: 5, name: 'Playwright Test Run' }]);
    expect(pointsOfRun(calls, 5)).toEqual([12, 13]);
    expect(result.output).toContain('##vso[task.setvariable variable=AZURE_PW_TEST_RUN_ID;isOutput=true]1005');
    expect(result.output).not.toContain('AZURE_PW_TEST_RUN_IDS');
    expect(result.output).not.toContain('Results are published to');
  });

  test('a plan whose run cannot be created does not stop the other plans', async ({ runInlineTest, server }) => {
    const calls = setupAzure(server, { points: POINTS, failRunCreationFor: [5] });

    const result = await runInlineTest(
      {
        'playwright.config.ts': reporterConfig(server.PORT, 'planId: [4, 5],'),
        'a.spec.js': threeTestsSpec,
      },
      { reporter: '' }
    );

    expect(calls.runs.map((run) => run.plan)).toEqual([4]);
    expect(pointsOfRun(calls, 4)).toEqual([11]);
    expect(calls.completed).toEqual([1004]);
    expect(result.output).toContain(
      'Failed to create a test run for test plan 5. Results for this plan are not published.'
    );
    expect(result.output).toContain('##vso[task.setvariable variable=AZURE_PW_TEST_RUN_IDS;isOutput=true]{"4":1004}');
  });

  test('testPointMapper gets the test points of all selected plans', async ({ runInlineTest, server }) => {
    const calls = setupAzure(server, { points: POINTS });

    const result = await runInlineTest(
      {
        'playwright.config.ts': reporterConfig(
          server.PORT,
          `planId: [4, 5],
           publishTestResultsMode: 'testRun',
           testPointMapper: async (testCase, testPoints) => {
             console.log('mapper ' + testCase.title + ': ' + testPoints.map((p) => p.testPlan.id).sort().join('+'));
             // keep the regression plan out for this one test
             return testCase.title.includes('[3]') ? testPoints.filter((p) => p.testPlan.id !== '4') : testPoints;
           },`
        ),
        'a.spec.js': threeTestsSpec,
      },
      { reporter: '' }
    );

    expect(result.output).toContain('mapper [3] in two plans: 4+5');
    expect(calls.runs.map((run) => run.plan)).toEqual([5]);
    expect(pointsOfRun(calls, 5)).toEqual([12, 13]);
  });

  test('errors outside of tests: attached to every run', async ({ runInlineTest, server }) => {
    const calls = setupAzure(server, { points: POINTS });

    await runInlineTest(
      {
        'playwright.config.ts': reporterConfig(server.PORT, 'planId: [4, 5], publishGlobalErrors: true,'),
        'a.spec.js': `
          import { test as base, expect } from '@playwright/test';
          const test = base.extend({
            broken: [async ({}, use) => {
              await use(1);
              throw new Error('worker teardown exploded');
            }, { scope: 'worker' }],
          });
          test('[3] in two plans', async ({ broken }) => {
            expect(broken).toBe(1);
          });
        `,
      },
      { reporter: '' }
    );

    expect(sorted(calls.attachments.map((attachment) => attachment.runId))).toEqual([1004, 1005]);
    expect(calls.attachments[0].fileName).toBe('playwright-global-errors.md');
    expect(calls.attachments[0].text).toContain('worker teardown exploded');
  });

  test('errors outside of tests with nothing published: a run in the first plan carries them', async ({
    runInlineTest,
    server,
  }) => {
    const calls = setupAzure(server, { points: POINTS, runIds: [4, 5] });

    const result = await runInlineTest(
      {
        'playwright.config.ts': reporterConfig(
          server.PORT,
          'planId: [5, 4], publishGlobalErrors: true,',
          "globalSetup: require.resolve('./global-setup.js'),"
        ),
        'global-setup.js': `module.exports = async () => { throw new Error('global setup exploded'); };`,
        'a.spec.js': threeTestsSpec,
      },
      { reporter: '' }
    );

    expect(result.exitCode).toBe(1);
    expect(calls.runs.map((run) => run.plan)).toEqual([5]);
    expect(calls.results.size).toBe(0);
    expect(calls.attachments.map((attachment) => attachment.runId)).toEqual([1005]);
    expect(calls.attachments[0].text).toContain('global setup exploded');
    expect(calls.completed).toEqual([1005]);
    expect(result.output).toContain('Run 1005 - Completed (test plan 5, errors outside of tests only)');
  });

  test('several test points inside one plan are still reported as ambiguous, per plan', async ({
    runInlineTest,
    server,
  }) => {
    // [3] has a second point in plan 4, for another configuration
    setupAzure(server, { points: [...POINTS, { id: 21, plan: 4, testCase: 3, configuration: 2 }] });

    const result = await runInlineTest(
      {
        'playwright.config.ts': reporterConfig(server.PORT, 'planId: [4, 5],'),
        'a.spec.js': threeTestsSpec,
      },
      { reporter: '' }
    );

    expect(result.output).toContain('There are 2 testPoints found for the test case');
    expect(result.output).toContain('in test plan 4,');
    expect(result.output).not.toContain('in test plan 5,');
    expect(result.output).toContain('you should set testRunConfig.configurationIds and/or a testPointMapper!');
  });

  test('AZURE_PW_TEST_RUN_ID from the environment is not exported again for several plans', async ({
    runInlineTest,
    server,
  }) => {
    const calls = setupAzure(server, { points: POINTS });

    const result = await runInlineTest(
      {
        'playwright.config.ts': reporterConfig(server.PORT, 'planId: [4, 5],'),
        'a.spec.js': threeTestsSpec,
      },
      { reporter: '' },
      { AZURE_PW_TEST_RUN_ID: '150' }
    );

    expect(calls.runs.map((run) => run.plan).sort()).toEqual([4, 5]);
    expect(result.output).not.toContain('variable=AZURE_PW_TEST_RUN_ID;');
    expect(result.output).toContain('{"4":1004,"5":1005}');
  });

  test('more than 10 plans: a warning, the run is not blocked', async ({ runInlineTest, server }) => {
    const calls = setupAzure(server, { points: POINTS });

    const result = await runInlineTest(
      {
        'playwright.config.ts': reporterConfig(server.PORT, 'planId: [4, 5, 21, 22, 23, 24, 25, 26, 27, 28, 29],'),
        'a.spec.js': threeTestsSpec,
      },
      { reporter: '' }
    );

    expect(result.output).toContain('11 test plans are selected, up to that many test runs are created');
    expect(calls.runs).toHaveLength(2);
  });
});

test.describe('several test plans: planId as a function', () => {
  const PLANS: Plan[] = [
    { id: 4, name: 'Regression', state: 'Active', startDate: '2020-01-01T00:00:00Z', endDate: '2099-01-01T00:00:00Z' },
    { id: 5, name: 'Release 2.0', state: 'Active', startDate: '2020-01-01T00:00:00Z', endDate: '2099-01-01T00:00:00Z' },
    {
      id: 6,
      name: 'Release 1.0',
      state: 'Inactive',
      startDate: '2019-01-01T00:00:00Z',
      endDate: '2019-02-01T00:00:00Z',
    },
  ];

  test('selects from the plans of the project, once per run', async ({ runInlineTest, server }) => {
    const calls = setupAzure(server, { points: POINTS, plans: PLANS });

    const result = await runInlineTest(
      {
        'playwright.config.ts': reporterConfig(
          server.PORT,
          `planId: ({ plans }) => {
             console.log('selector got ' + plans.map((p) => p.id + ':' + p.name + ':' + p.state).join(' | '));
             console.log('dates are Date: ' + plans.every((p) => p.startDate instanceof Date && p.endDate instanceof Date));
             const now = Date.now();
             return plans
               .filter((p) => p.name === 'Regression' || (p.startDate.getTime() <= now && now <= p.endDate.getTime()))
               .map((p) => p.id);
           },`
        ),
        'a.spec.js': threeTestsSpec,
      },
      { reporter: '' }
    );

    expect(result.output).toContain('selector got 4:Regression:Active | 5:Release 2.0:Active | 6:Release 1.0:Inactive');
    expect(result.output).toContain('dates are Date: true');
    expect(calls.planQueries).toBe(1);
    expect(result.output).toContain('Results are published to 2 test plan(s): 4 "Regression", 5 "Release 2.0".');
    expect(calls.runs.map((run) => run.plan).sort()).toEqual([4, 5]);
    expect(pointsOfRun(calls, 4)).toEqual([11]);
    expect(pointsOfRun(calls, 5)).toEqual([12, 13]);
    expect(result.output).toContain('{"4":1004,"5":1005}');
  });

  test('an async function and string ids are accepted, a single plan still uses the multi-plan variables', async ({
    runInlineTest,
    server,
  }) => {
    const calls = setupAzure(server, { points: POINTS, plans: PLANS });

    const result = await runInlineTest(
      {
        'playwright.config.ts': reporterConfig(server.PORT, "planId: async () => ['5', 5],"),
        'a.spec.js': threeTestsSpec,
      },
      { reporter: '' }
    );

    expect(calls.runs).toEqual([{ id: 1005, plan: 5, name: 'Playwright Test Run (plan 5)' }]);
    expect(result.output).toContain('##vso[task.setvariable variable=AZURE_PW_TEST_RUN_IDS;isOutput=true]{"5":1005}');
    expect(result.output).not.toContain('variable=AZURE_PW_TEST_RUN_ID;');
  });

  test('an inactive or unknown plan is published to, with a warning', async ({ runInlineTest, server }) => {
    const calls = setupAzure(server, { points: POINTS, plans: PLANS });

    const result = await runInlineTest(
      {
        'playwright.config.ts': reporterConfig(server.PORT, 'planId: () => [6, 77],'),
        'a.spec.js': threeTestsSpec,
      },
      { reporter: '' }
    );

    expect(result.output).toContain('Test plan 6 "Release 1.0" is Inactive. Azure DevOps still accepts results for it');
    expect(result.output).toContain("Test plan 77 returned by the 'planId' function is not in project SampleSample.");
    expect(calls.runs.map((run) => run.plan)).toEqual([6]);
    expect(pointsOfRun(calls, 6)).toEqual([14]);
  });

  for (const [title, selector, message] of [
    ['returns no plans', '() => []', "'planId' function returned no test plans. Reporting is disabled."],
    [
      'returns something that is not a plan id',
      "() => [4, 'release']",
      `'planId' function returned values that are not test plan ids: "release". Reporting is disabled.`,
    ],
    [
      'throws',
      "() => { throw new Error('plans.json is missing'); }",
      "'planId' function failed: plans.json is missing. Reporting is disabled.",
    ],
  ]) {
    test(`a function that ${title} disables reporting, the tests still run`, async ({ runInlineTest, server }) => {
      // the tests finish before the plans arrive: their results must not be published afterwards
      const calls = setupAzure(server, { points: POINTS, plans: PLANS, plansDelayMs: 1500 });

      const result = await runInlineTest(
        {
          'playwright.config.ts': reporterConfig(server.PORT, `planId: ${selector},`),
          'a.spec.js': threeTestsSpec,
        },
        { reporter: '' }
      );

      expect(result.output).toContain(message);
      expect(result.passed).toBe(2);
      expect(calls.runs).toHaveLength(0);
      expect(calls.pointsQueries).toBe(0);
    });
  }
});

test.describe('several test plans: options that belong to one plan', () => {
  for (const [title, options, env, message] of [
    [
      'an invalid list',
      "planId: [4, 'abc', 0],",
      {},
      `'planId' list contains values that are not test plan ids: "abc", 0. Reporting is disabled.`,
    ],
    ['an empty list', 'planId: [],', {}, "'planId' list is empty. Reporting is disabled."],
    [
      'rootSuiteId',
      'planId: [4, 5], rootSuiteId: 6,',
      {},
      "'rootSuiteId' (or AZURE_PW_ROOT_SUITE_ID) cannot be used with several test plans in 'planId'. Reporting is disabled.",
    ],
    [
      'AZURE_PW_ROOT_SUITE_ID',
      'planId: () => [4, 5],',
      { AZURE_PW_ROOT_SUITE_ID: '6' },
      "'rootSuiteId' (or AZURE_PW_ROOT_SUITE_ID) cannot be used with several test plans in 'planId'. Reporting is disabled.",
    ],
    [
      'an existing run',
      'planId: [4, 5], isExistingTestRun: true, testRunId: 150,',
      {},
      "'isExistingTestRun' cannot be used with several test plans in 'planId'. Reporting is disabled.",
    ],
    [
      'testRunADO mode',
      "planId: [4, 5], publishTestResultsMode: 'testRunADO', isExistingTestRun: true, testRunId: 150,",
      {},
      "'isExistingTestRun', 'publishTestResultsMode: testRunADO' cannot be used with several test plans in 'planId'. Reporting is disabled.",
    ],
  ] as Array<[string, string, NodeJS.ProcessEnv, string]>) {
    test(`${title}: reporting is disabled with a reason`, async ({ runInlineTest, server }) => {
      const calls = setupAzure(server, { points: POINTS });

      const result = await runInlineTest(
        {
          'playwright.config.ts': reporterConfig(server.PORT, options),
          'a.spec.js': threeTestsSpec,
        },
        { reporter: '' },
        env
      );

      expect(result.output).toContain(message);
      expect(result.passed).toBe(2);
      expect(calls.runs).toHaveLength(0);
      expect(calls.pointsQueries).toBe(0);
      // a disabled reporter exports no run id, also not the testRunId of the config
      expect(result.output).not.toContain('variable=AZURE_PW_TEST_RUN_ID');
    });
  }
});
