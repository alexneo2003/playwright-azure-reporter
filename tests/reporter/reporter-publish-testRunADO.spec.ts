import path from 'path';

import { setHeaders } from '../config/utils';
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
const POINTS_3_VALID_RESPONSE_PATH = path.join(__dirname, '.', 'assets', 'azure-reporter', 'points3Response.json');
const EXISTING_TEST_RUN_RESULTS_3_RESPONSE_PATH = path.join(
  __dirname,
  '.',
  'assets',
  'azure-reporter',
  'existingTestRunResults3Response.json'
);
const UPDATED_TEST_RUN_RESULTS_3_RESPONSE_PATH = path.join(
  __dirname,
  '.',
  'assets',
  'azure-reporter',
  'updatedTestRunResults3Response.json'
);

// Mock response for pagination test - simulates large test run with multiple pages
function createMockPaginatedTestResults(skip: number, top: number, testCaseId: number, totalResults = 500) {
  const results: any[] = [];
  const startId = skip + 1;
  const endId = Math.min(skip + top, totalResults);

  // Only return results if we haven't exceeded the total
  if (skip < totalResults) {
    for (let i = startId; i <= endId; i++) {
      results.push({
        id: 123000 + i,
        testCase: {
          id: testCaseId.toString(),
        },
        testPoint: {
          id: (1000 + i).toString(),
        },
        testPlan: {
          id: '4',
        },
        testRun: {
          id: '999',
        },
        outcome: 'NotExecuted',
        state: 'InProgress',
        priority: 0,
        url: `http://localhost:3000/SampleSample/_apis/test/Runs/999/Results/${123000 + i}`,
        lastUpdatedBy: {
          displayName: 'Test User',
          id: 'test-user-id',
        },
        lastUpdatedDate: '2023-01-01T00:00:00Z',
        project: {
          id: 'sample-project-id',
        },
      });
    }
  }

  return results;
}

test.describe('Publish results - testRunADO', () => {
  test('testRunADO mode requires existing test run', async ({ runInlineTest }) => {
    const result = await runInlineTest(
      {
        'playwright.config.ts': `
        module.exports = {
          reporter: [
            ['line'],
            ['${reporterPath}', { 
              orgUrl: 'http://azure.devops.com',
              projectName: 'SampleSample',
              planId: 4,
              token: 'token',
              logging: true,
              publishTestResultsMode: 'testRunADO',
              isExistingTestRun: true,
              // Missing testRunId - should fail validation
            }]
          ]
        };
      `,
        'a.spec.js': `
        import { test, expect } from '@playwright/test';
        test('[3] foobar', async ({}) => {
          expect(1).toBe(0);
        });
      `,
      },
      { reporter: '' }
    );

    expect(result.output).toContain(
      "azure:pw:warn 'testRunADO' mode requires both 'testRunId' and 'isExistingTestRun=true' to be set. Reporting is disabled."
    );
    // When reporter is disabled, it doesn't log test results
    expect(result.output).not.toContain('azure:pw:log [3] foobar - failed');
    expect(result.exitCode).toBe(1);
    expect(result.failed).toBe(1);
  });

  test('testRunADO mode requires testRunId and isExistingTestRun=true', async ({ runInlineTest }) => {
    const result = await runInlineTest(
      {
        'playwright.config.ts': `
        module.exports = {
          reporter: [
            ['line'],
            ['${reporterPath}', { 
              orgUrl: 'http://azure.devops.com',
              projectName: 'SampleSample',
              planId: 4,
              token: 'token',
              logging: true,
              publishTestResultsMode: 'testRunADO',
              // Missing isExistingTestRun - should fail validation
            }]
          ]
        };
      `,
        'a.spec.js': `
        import { test, expect } from '@playwright/test';
        test('[3] foobar', async ({}) => {
          expect(1).toBe(0);
        });
      `,
      },
      { reporter: '' }
    );

    expect(result.output).toContain(
      "azure:pw:warn 'testRunADO' mode requires both 'testRunId' and 'isExistingTestRun=true' to be set. Reporting is disabled."
    );
    // When reporter is disabled, it doesn't log test results
    expect(result.output).not.toContain('azure:pw:log [3] foobar - failed');
    expect(result.exitCode).toBe(1);
    expect(result.failed).toBe(1);
  });

  test('testRunADO mode updates existing test result successfully', async ({ runInlineTest, server }) => {
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

    server.setRoute('/SampleSample/_apis/test/Points', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, POINTS_3_VALID_RESPONSE_PATH);
    });

    // Mock existing test results in the test run - handle both with and without query parameters
    server.setRoute('/SampleSample/_apis/test/Runs/789/Results?%24skip=0&%24top=200', (req, res) => {
      const method = req.method;
      setHeaders(res, headers);

      if (method === 'GET') {
        // Return existing test results - this should work with pagination parameters
        server.serveFile(req, res, EXISTING_TEST_RUN_RESULTS_3_RESPONSE_PATH);
      }
    });
    server.setRoute('/SampleSample/_apis/test/Runs/789/Results', (req, res) => {
      const method = req.method;
      setHeaders(res, headers);

      if (method === 'PATCH') {
        // Return updated test results after update
        server.serveFile(req, res, UPDATED_TEST_RUN_RESULTS_3_RESPONSE_PATH);
      }
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
              publishTestResultsMode: 'testRunADO',
              isExistingTestRun: true,
              testRunId: 789,
            }]
          ]
        };
      `,
        'a.spec.js': `
        import { test, expect } from '@playwright/test';
        test('[3] foobar', async ({}) => {
          expect(1).toBe(0);
        });
      `,
      },
      { reporter: '' },
      {
        AZUREPWDEBUG: '1',
      }
    );

    expect(result.output).not.toContain('Failed request: (401)');
    expect(result.output).toContain('azure:pw:log [3] foobar - failed');
    expect(result.output).not.toContain('azure:pw:warn No test points found for test case');
    expect(result.output).toContain('azure:pw:log Start publishing test results for 1 test(s)');
    expect(result.output).toContain('azure:pw:log Test results published for 1 test(s), 1 test point(s)');
    expect(result.exitCode).toBe(1);
    expect(result.failed).toBe(1);
  });

  test('testRunADO mode warns when no existing test results found', async ({ runInlineTest, server }) => {
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

    server.setRoute('/SampleSample/_apis/test/Points', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, POINTS_3_VALID_RESPONSE_PATH);
    });

    // Mock empty existing test results in the test run
    server.setRoute('/SampleSample/_apis/test/Runs/789/Results?%24skip=0&%24top=200', (req, res) => {
      setHeaders(res, headers);
      res.end(JSON.stringify([])); // Empty results array
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
              publishTestResultsMode: 'testRunADO',
              isExistingTestRun: true,
              testRunId: 789,
            }]
          ]
        };
      `,
        'a.spec.js': `
        import { test, expect } from '@playwright/test';
        test('[3] foobar', async ({}) => {
          expect(1).toBe(0);
        });
      `,
      },
      { reporter: '' }
    );

    expect(result.output).not.toContain('Failed request: (401)');
    expect(result.output).toContain('azure:pw:log [3] foobar - failed');
    expect(result.output).toContain('azure:pw:log Start publishing test results for 1 test(s)');
    // In testRunADO mode, when no test points are found, it logs a different message
    expect(result.output).toContain('azure:pw:warn No test points found for test case [3] associated with test plan 4');
    expect(result.output).toContain('azure:pw:log Test results published for 0 test(s), 0 test point(s)');
    expect(result.exitCode).toBe(1);
    expect(result.failed).toBe(1);
  });

  test('testRunADO mode does not complete test run automatically', async ({ runInlineTest, server }) => {
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

    server.setRoute('/SampleSample/_apis/test/Points', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, POINTS_3_VALID_RESPONSE_PATH);
    });

    server.setRoute('/SampleSample/_apis/test/Runs/789/Results?%24skip=0&%24top=200', (req, res) => {
      const method = req.method;
      setHeaders(res, headers);

      if (method === 'GET') {
        server.serveFile(req, res, EXISTING_TEST_RUN_RESULTS_3_RESPONSE_PATH);
      }
    });

    server.setRoute('/SampleSample/_apis/test/Runs/789/Results', (req, res) => {
      const method = req.method;
      setHeaders(res, headers);

      if (method === 'PATCH') {
        // Return updated test results after update
        server.serveFile(req, res, UPDATED_TEST_RUN_RESULTS_3_RESPONSE_PATH);
      }
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
              publishTestResultsMode: 'testRunADO',
              isExistingTestRun: true,
              testRunId: 789,
            }]
          ]
        };
      `,
        'a.spec.js': `
        import { test, expect } from '@playwright/test';
        test('[3] foobar', async ({}) => {
          expect(1).toBe(0);
        });
      `,
      },
      { reporter: '' },
      {
        AZUREPWDEBUG: '1',
      }
    );

    expect(result.output).not.toContain('Failed request: (401)');
    expect(result.output).toContain('azure:pw:log [3] foobar - failed');
    expect(result.output).not.toContain('azure:pw:warn No test points found for test case');
    expect(result.output).toContain('azure:pw:log Start publishing test results for 1 test(s)');
    expect(result.output).toContain('azure:pw:log Test results published for 1 test(s), 1 test point(s)');
    // Should NOT contain test run completion message
    expect(result.output).not.toContain('Run 789 - Completed');
    expect(result.exitCode).toBe(1);
    expect(result.failed).toBe(1);
  });

  test('testRunADO mode handles paginated responses with >200 test results', async ({ runInlineTest, server }) => {
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

    server.setRoute('/SampleSample/_apis/test/Points', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, POINTS_3_VALID_RESPONSE_PATH);
    });

    // Mock paginated test results responses
    // First call (skip=0, top=200) - returns full page
    server.setRoute('/SampleSample/_apis/test/Runs/999/Results?%24skip=0&%24top=200', (req, res) => {
      setHeaders(res, headers);
      const paginatedResults = createMockPaginatedTestResults(0, 200, 3, 500);
      res.end(JSON.stringify(paginatedResults));
    });

    // Second call (skip=200, top=200) - returns second page
    server.setRoute('/SampleSample/_apis/test/Runs/999/Results?%24skip=200&%24top=200', (req, res) => {
      setHeaders(res, headers);
      const paginatedResults = createMockPaginatedTestResults(200, 200, 3, 500);
      res.end(JSON.stringify(paginatedResults));
    });

    // Third call (skip=400, top=200) - returns remaining results
    server.setRoute('/SampleSample/_apis/test/Runs/999/Results?%24skip=400&%24top=200', (req, res) => {
      setHeaders(res, headers);
      const paginatedResults = createMockPaginatedTestResults(400, 200, 3, 500);
      res.end(JSON.stringify(paginatedResults));
    });

    // Fourth call (skip=500, top=200) - returns empty array (no more results)
    server.setRoute('/SampleSample/_apis/test/Runs/999/Results?%24skip=500&%24top=200', (req, res) => {
      setHeaders(res, headers);
      res.end(JSON.stringify([]));
    });

    // Handle PATCH request to update test results - return the first result that matches
    server.setRoute('/SampleSample/_apis/test/Runs/999/Results', (req, res) => {
      const method = req.method;
      setHeaders(res, headers);

      if (method === 'PATCH') {
        // Create a mock updated result based on the first test result
        const updatedResult = [
          {
            id: 123456,
            testCase: {
              id: '3',
            },
            testPoint: {
              id: '1',
            },
            testPlan: {
              id: '4',
            },
            testRun: {
              id: '999',
            },
            outcome: 'Failed',
            state: 'Completed',
            priority: 0,
            url: 'http://localhost:3000/SampleSample/_apis/test/Runs/999/Results/123456',
            lastUpdatedBy: {
              displayName: 'Test User',
              id: 'test-user-id',
            },
            lastUpdatedDate: '2023-01-01T00:00:00Z',
            project: {
              id: 'sample-project-id',
            },
          },
        ];
        res.end(JSON.stringify(updatedResult));
      }
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
              publishTestResultsMode: 'testRunADO',
              isExistingTestRun: true,
              testRunId: 999,
            }]
          ]
        };
      `,
        'a.spec.js': `
        import { test, expect } from '@playwright/test';
        test('[3] foobar', async ({}) => {
          expect(1).toBe(0);
        });
      `,
      },
      { reporter: '' },
      {
        AZUREPWDEBUG: '1',
      }
    );

    expect(result.output).not.toContain('Failed request: (401)');
    expect(result.output).toContain('azure:pw:log [3] foobar - failed');
    expect(result.output).toContain('azure:pw:log Start publishing test results for 1 test(s)');
    // Verify pagination is working - should see multiple fetch operations
    expect(result.output).toContain('azure:pw:log Fetching test results from existing test run (skip: 0, top: 200)');
    expect(result.output).toContain(
      'azure:pw:log Fetching next test results from existing test run (skip: 200, top: 200)'
    );
    expect(result.output).toContain(
      'azure:pw:log Fetching next test results from existing test run (skip: 400, top: 200)'
    );
    // Verify that it fetched all 500 test results (this proves pagination worked)
    expect(result.output).toContain('azure:pw:debug [_publishTestRunResults] ExistingTestCaseResultsForRun: 500');
    // Should NOT contain test run completion message
    expect(result.output).not.toContain('Run 999 - Completed');
    expect(result.exitCode).toBe(1);
    expect(result.failed).toBe(1);
  });
});
