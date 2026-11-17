import path from 'path';

import { getRequestBody, setHeaders } from '../config/utils';
import azureAreas from './assets/azure-reporter/azureAreas';
import headers from './assets/azure-reporter/azureHeaders';
import location from './assets/azure-reporter/azureLocationOptionsResponse.json';
import { reporterPath } from './reporterPath';
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
  'testRunResults3Response.json'
);

// Mock response for pagination test - simulates first page of results
function createMockPaginatedResponse(skip: number, top: number, testCaseId: number, forceFullPage = false) {
  const points: any[] = [];
  // Simulate having 500 test points total, return based on skip/top
  const totalPoints = 500;
  const startId = skip + 1;
  let endId = Math.min(skip + top, totalPoints);

  // For the first call (skip=0), always return exactly 200 to trigger pagination
  if (skip === 0 && forceFullPage) {
    endId = 200;
  }

  for (let i = startId; i <= endId; i++) {
    points.push({
      id: i,
      url: `http://localhost:3000/SampleSample/_apis/test/Plans/4/Suites/6/Points/${i}`,
      assignedTo: {
        displayName: 'Alex',
        id: '230e55b4-9e71-6a10-a0fa-777777777',
      },
      automated: false,
      configuration: {
        id: '1',
        name: 'Windows 10',
      },
      lastTestRun: {
        id: '238',
      },
      lastResult: {
        id: (100000 + i).toString(),
      },
      outcome: 'Passed',
      state: 'Completed',
      lastResultState: 'Completed',
      suite: {
        id: '6',
      },
      testCase: {
        id: testCaseId.toString(),
      },
      testPlan: {
        id: '4',
      },
      workItemProperties: [
        {
          workItem: {
            key: 'Microsoft.VSTS.TCM.AutomationStatus',
            value: 'Not Automated',
          },
        },
      ],
    });
  }

  return {
    points: points,
    pointsFilter: {
      testcaseIds: [testCaseId],
    },
  };
}

test('configuration filtering for getPointsByQuery', async ({ runInlineTest, server }) => {
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

  // This route will be called and should return exactly 200 items to trigger pagination logic
  server.setRoute('/SampleSample/_apis/test/Points', async (req, res) => {
    setHeaders(res, headers);

    // Get request body to find testCaseId
    const body = await getRequestBody(req);
    const testCaseId = body.pointsFilter?.testcaseIds?.[0] || 3;

    // Return exactly 200 test points to trigger pagination detection
    const response = createMockPaginatedResponse(0, 200, testCaseId, true);
    res.end(JSON.stringify(response));
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
          }]
        ]
      };
    `,
      'a.spec.js': `
      import { test, expect } from '@playwright/test';
      test('[3] foobar', async ({}) => {
        expect(1).toBe(1);
      });
    `,
    },
    { reporter: '' }
  );

  // Verify that test run completed successfully
  expect(result.output).toContain('azure:pw:log [3] foobar - passed');
  expect(result.output).toContain('azure:pw:log Start publishing: [3] foobar');
  expect(result.output).toMatch(/azure:pw:log Run (\d.*) - Completed/);
  expect(result.output).toContain('There are 200 testPoints found for the test case'); // Shows we got the expected large number
  expect(result.exitCode).toBe(0);
  expect(result.passed).toBe(1);
});

test('handles large number of test points correctly with configuration filtering', async ({
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

  // Simulate the scenario where the desired test point comes after many pages of results
  server.setRoute('/SampleSample/_apis/test/Points', async (req, res) => {
    setHeaders(res, headers);

    // Get request body to find testCaseId
    const body = await getRequestBody(req);
    const testCaseId = body.pointsFilter?.testcaseIds?.[0] || 999;

    // Return exactly 200 points to trigger pagination, but all with the correct test case ID
    // This simulates a scenario where pagination is needed but the results are found
    const response = createMockPaginatedResponse(0, 200, testCaseId, true);
    res.end(JSON.stringify(response));
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
          }]
        ]
      };
    `,
      'a.spec.js': `
      import { test, expect } from '@playwright/test';
      test('[999] foobar with many historical points', async ({}) => {
        expect(1).toBe(1);
      });
    `,
    },
    { reporter: '' }
  );

  // Verify that test points were found and published successfully
  expect(result.output).toContain('azure:pw:log [999] foobar with many historical points - passed');
  expect(result.output).toContain('azure:pw:log Start publishing: [999] foobar with many historical points');
  expect(result.output).toMatch(/azure:pw:log Run (\d.*) - Completed/);
  expect(result.exitCode).toBe(0);
  expect(result.passed).toBe(1);
});

test.describe('points query limits of Azure DevOps', () => {
  const asset = (name: string) => path.join(__dirname, 'assets', 'azure-reporter', name);
  const point = (id: number, plan: number, testCase: number) => ({
    id,
    configuration: { id: '1', name: 'Windows 10' },
    suite: { id: '6' },
    testCase: { id: String(testCase) },
    testPlan: { id: String(plan) },
  });

  /** Routes of a run that accepts everything; the Points route is set by each test. */
  function setupRoutes(server: any) {
    const published: number[] = [];
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
    server.setRoute('/SampleSample/_apis/test/Runs/150/Results', async (req: any, res: any) => {
      const body = await getRequestBody(req);
      published.push(...body.map((result: any) => parseInt(result.testPoint.id, 10)));
      setHeaders(res, headers);
      server.serveFile(req, res, asset('testRunResults3ValidResponse.json'));
    });
    server.setRoute('/SampleSample/_apis/test/Runs/150', (req: any, res: any) => {
      setHeaders(res, headers);
      server.serveFile(req, res, COMPLETE_RUN_VALID_RESPONSE_PATH);
    });
    return published;
  }

  const config = (port: number) => `
    module.exports = {
      reporter: [
        ['line'],
        ['${reporterPath}', {
          orgUrl: 'http://localhost:${port}',
          projectName: 'SampleSample',
          planId: 4,
          token: 'token',
          logging: true,
        }]
      ]
    };
  `;

  test('a full page of 1000 test points is followed by $skip requests', async ({ runInlineTest, server }) => {
    const published = setupRoutes(server);
    // 2500 points of test case 3 in other plans come first, the point of plan 4 is the very last one
    const all = [...Array.from({ length: 2500 }, (_, i) => point(i + 1, 900 + (i % 50), 3)), point(5000, 4, 3)];
    const requests: string[] = [];
    const servePage = (skip: number) => async (req: any, res: any) => {
      requests.push(req.url);
      setHeaders(res, headers);
      res.end(JSON.stringify({ points: all.slice(skip, skip + 1000) }));
    };
    server.setRoute('/SampleSample/_apis/test/Points', servePage(0));
    for (const skip of [1000, 2000, 3000]) {
      server.setRoute(`/SampleSample/_apis/test/Points?%24skip=${skip}`, servePage(skip));
    }

    const result = await runInlineTest(
      {
        'playwright.config.ts': config(server.PORT),
        'a.spec.js': `
          import { test, expect } from '@playwright/test';
          test('[3] foobar', async () => { expect(1).toBe(1); });
        `,
      },
      { reporter: '' }
    );

    expect(requests).toEqual([
      '/SampleSample/_apis/test/Points',
      '/SampleSample/_apis/test/Points?%24skip=1000',
      '/SampleSample/_apis/test/Points?%24skip=2000',
    ]);
    expect(published).toEqual([5000]);
    expect(result.output).not.toContain('No test points found');
    expect(result.output).toContain('Result published: [3] foobar');
  });

  test('a short page is not followed by another request', async ({ runInlineTest, server }) => {
    const published = setupRoutes(server);
    let requests = 0;
    server.setRoute('/SampleSample/_apis/test/Points', (req: any, res: any) => {
      requests++;
      setHeaders(res, headers);
      res.end(
        JSON.stringify({ points: [...Array.from({ length: 998 }, (_, i) => point(i + 1, 900, 3)), point(5000, 4, 3)] })
      );
    });

    await runInlineTest(
      {
        'playwright.config.ts': config(server.PORT),
        'a.spec.js': `
          import { test, expect } from '@playwright/test';
          test('[3] foobar', async () => { expect(1).toBe(1); });
        `,
      },
      { reporter: '' }
    );

    expect(requests).toBe(1);
    expect(published).toEqual([5000]);
  });

  test('a next page that fails keeps the test points already fetched', async ({ runInlineTest, server }) => {
    const published = setupRoutes(server);
    server.setRoute('/SampleSample/_apis/test/Points', (req: any, res: any) => {
      setHeaders(res, headers);
      res.end(
        JSON.stringify({ points: [point(5000, 4, 3), ...Array.from({ length: 999 }, (_, i) => point(i + 1, 900, 3))] })
      );
    });
    server.setRoute('/SampleSample/_apis/test/Points?%24skip=1000', (req: any, res: any) => {
      res.statusCode = 500;
      res.end(JSON.stringify({ message: 'boom' }));
    });

    const result = await runInlineTest(
      {
        'playwright.config.ts': config(server.PORT),
        'a.spec.js': `
          import { test, expect } from '@playwright/test';
          test('[3] foobar', async () => { expect(1).toBe(1); });
        `,
      },
      { reporter: '' }
    );

    expect(published).toEqual([5000]);
    expect(result.output).toContain('Failed to fetch test points after the first 1000');
  });

  test('more than 200 test case ids are queried in parts', async ({ runInlineTest, server }) => {
    const published = setupRoutes(server);
    const queried: number[][] = [];
    server.setRoute('/SampleSample/_apis/test/Points', async (req: any, res: any) => {
      const body = await getRequestBody(req);
      const ids: number[] = body.pointsFilter.testcaseIds;
      queried.push(ids);
      setHeaders(res, headers);
      if (ids.length > 200) {
        res.statusCode = 400;
        res.end(JSON.stringify({ message: 'Maximum of 200 test case id(s) can be specified at a time.' }));
        return;
      }
      res.end(JSON.stringify({ points: ids.filter((id) => id === 1 || id === 250).map((id) => point(id, 4, id)) }));
    });
    const ids = Array.from({ length: 250 }, (_, i) => i + 1).join(',');

    const result = await runInlineTest(
      {
        'playwright.config.ts': config(server.PORT),
        'a.spec.js': `
          import { test, expect } from '@playwright/test';
          test('[${ids}] many test cases', async () => { expect(1).toBe(1); });
        `,
      },
      { reporter: '' }
    );

    expect(queried.map((part) => part.length)).toEqual([200, 50]);
    expect(published.sort((a, b) => a - b)).toEqual([1, 250]);
    expect(result.output).not.toContain('azure:pw:error');
  });
});
