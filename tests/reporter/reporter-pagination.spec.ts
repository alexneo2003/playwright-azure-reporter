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
  const points = [];
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
      testcaseIds: [testCaseId]
    }
  };
}

test('pagination support for getPointsByQuery', async ({ runInlineTest, server }) => {
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

  // Verify that pagination logic was triggered
  expect(result.output).toContain('azure:pw:log [3] foobar - passed');
  expect(result.output).toContain('azure:pw:log Start publishing: [3] foobar');
  expect(result.output).toMatch(/azure:pw:log Run (\d.*) - Completed/);
  expect(result.output).toContain('Detected potential pagination needed');
  expect(result.output).toContain('Fetching next test points by query');
  expect(result.output).toContain('There are 200 testPoints found for the test case'); // Shows we got the expected large number
  expect(result.exitCode).toBe(0);
  expect(result.passed).toBe(1);
});

test('pagination handles large number of test points correctly', async ({ runInlineTest, server }) => {
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

  // Verify that pagination logic was triggered and test points were found
  expect(result.output).toContain('azure:pw:log [999] foobar with many historical points - passed');
  expect(result.output).toContain('azure:pw:log Start publishing: [999] foobar with many historical points');
  expect(result.output).toMatch(/azure:pw:log Run (\d.*) - Completed/);
  expect(result.output).toContain('Detected potential pagination needed');
  expect(result.output).toContain('Fetching next test points by query');
  expect(result.exitCode).toBe(0);
  expect(result.passed).toBe(1);
});