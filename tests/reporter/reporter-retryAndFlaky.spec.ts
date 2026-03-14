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
const POINTS_3_VALID_RESPONSE_PATH = path.join(__dirname, '.', 'assets', 'azure-reporter', 'points3Response.json');
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

function setupDefaultRoutes(server: any) {
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

test.describe('publishRetryResults', () => {
  test.describe("publishRetryResults: 'all' (default)", () => {
    test('all retry attempts are published', async ({ runInlineTest, server }) => {
      setupDefaultRoutes(server);

      const publishedResults: any[] = [];
      server.setRoute('/SampleSample/_apis/test/Runs/150/Results', (req: any, res: any) => {
        getRequestBody(req).then((body: any) => {
          publishedResults.push(...body);
        });
        setHeaders(res, headers);
        server.serveFile(req, res, TEST_RUN_RESULTS_3_VALID_RESPONSE_PATH);
      });

      const result = await runInlineTest(
        {
          'playwright.config.ts': `
          module.exports = {
            retries: 2,
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
          test('[3] flakyTest', async ({}, testInfo) => {
            if (testInfo.retry < 1) {
              expect(1).toBe(0);
            }
          });
        `,
        },
        { reporter: '' }
      );

      expect(result.output).not.toContain('Failed request: (401)');
      expect(result.output).toContain('flakyTest - failed');
      expect(result.output).toContain('flakyTest - passed');
      // With 'all' mode (default), both attempts should be published
      expect(publishedResults.length).toBe(2);
      expect(result.exitCode).toBe(0);
      expect(result.flaky).toBe(1);
    });
  });

  test.describe("publishRetryResults: 'last'", () => {
    test('only final attempt is published in testResult mode', async ({ runInlineTest, server }) => {
      setupDefaultRoutes(server);

      const publishedResults: any[] = [];
      server.setRoute('/SampleSample/_apis/test/Runs/150/Results', (req: any, res: any) => {
        getRequestBody(req).then((body: any) => {
          publishedResults.push(...body);
        });
        setHeaders(res, headers);
        server.serveFile(req, res, TEST_RUN_RESULTS_3_VALID_RESPONSE_PATH);
      });

      const result = await runInlineTest(
        {
          'playwright.config.ts': `
          module.exports = {
            retries: 2,
            reporter: [
              ['line'],
              ['${reporterPath}', {
                orgUrl: 'http://localhost:${server.PORT}',
                projectName: 'SampleSample',
                planId: 4,
                token: 'token',
                logging: true,
                publishRetryResults: 'last',
              }]
            ]
          };
        `,
          'a.spec.js': `
          import { test, expect } from '@playwright/test';
          test('[3] flakyTest', async ({}, testInfo) => {
            if (testInfo.retry < 1) {
              expect(1).toBe(0);
            }
          });
        `,
        },
        { reporter: '' }
      );

      expect(result.output).not.toContain('Failed request: (401)');
      // Only the final (passing) attempt should be published
      expect(publishedResults.length).toBe(1);
      expect(publishedResults[0].outcome).toBe('Passed');
      expect(result.exitCode).toBe(0);
      expect(result.flaky).toBe(1);
    });

    test('publishes last attempt even when all retries fail', async ({ runInlineTest, server }) => {
      setupDefaultRoutes(server);

      const publishedResults: any[] = [];
      server.setRoute('/SampleSample/_apis/test/Runs/150/Results', (req: any, res: any) => {
        getRequestBody(req).then((body: any) => {
          publishedResults.push(...body);
        });
        setHeaders(res, headers);
        server.serveFile(req, res, TEST_RUN_RESULTS_3_VALID_RESPONSE_PATH);
      });

      const result = await runInlineTest(
        {
          'playwright.config.ts': `
          module.exports = {
            retries: 2,
            reporter: [
              ['line'],
              ['${reporterPath}', {
                orgUrl: 'http://localhost:${server.PORT}',
                projectName: 'SampleSample',
                planId: 4,
                token: 'token',
                logging: true,
                publishRetryResults: 'last',
              }]
            ]
          };
        `,
          'a.spec.js': `
          import { test, expect } from '@playwright/test';
          test('[3] alwaysFails', async () => {
            expect(1).toBe(0);
          });
        `,
        },
        { reporter: '' }
      );

      // Only the final (3rd) attempt should be published
      expect(publishedResults.length).toBe(1);
      expect(publishedResults[0].outcome).toBe('Failed');
      expect(result.exitCode).toBe(1);
      expect(result.failed).toBe(1);
    });

    test('no retries configured - behaves normally', async ({ runInlineTest, server }) => {
      setupDefaultRoutes(server);

      const publishedResults: any[] = [];
      server.setRoute('/SampleSample/_apis/test/Runs/150/Results', (req: any, res: any) => {
        getRequestBody(req).then((body: any) => {
          publishedResults.push(...body);
        });
        setHeaders(res, headers);
        server.serveFile(req, res, TEST_RUN_RESULTS_3_VALID_RESPONSE_PATH);
      });

      const result = await runInlineTest(
        {
          'playwright.config.ts': `
          module.exports = {
            retries: 0,
            reporter: [
              ['line'],
              ['${reporterPath}', {
                orgUrl: 'http://localhost:${server.PORT}',
                projectName: 'SampleSample',
                planId: 4,
                token: 'token',
                logging: true,
                publishRetryResults: 'last',
              }]
            ]
          };
        `,
          'a.spec.js': `
          import { test, expect } from '@playwright/test';
          test('[3] passingTest', async () => {
            expect(1).toBe(1);
          });
        `,
        },
        { reporter: '' }
      );

      expect(publishedResults.length).toBe(1);
      expect(publishedResults[0].outcome).toBe('Passed');
      expect(result.exitCode).toBe(0);
      expect(result.passed).toBe(1);
    });

    test('only final attempt in testRun mode', async ({ runInlineTest, server }) => {
      setupDefaultRoutes(server);

      const publishedResults: any[] = [];
      server.setRoute('/SampleSample/_apis/test/Runs/150/Results', (req: any, res: any) => {
        getRequestBody(req).then((body: any) => {
          publishedResults.push(...body);
        });
        setHeaders(res, headers);
        server.serveFile(req, res, TEST_RUN_RESULTS_3_VALID_RESPONSE_PATH);
      });

      const result = await runInlineTest(
        {
          'playwright.config.ts': `
          module.exports = {
            retries: 2,
            reporter: [
              ['line'],
              ['${reporterPath}', {
                orgUrl: 'http://localhost:${server.PORT}',
                projectName: 'SampleSample',
                planId: 4,
                token: 'token',
                logging: true,
                publishTestResultsMode: 'testRun',
                publishRetryResults: 'last',
              }]
            ]
          };
        `,
          'a.spec.js': `
          import { test, expect } from '@playwright/test';
          test('[3] flakyTest', async ({}, testInfo) => {
            if (testInfo.retry < 1) {
              expect(1).toBe(0);
            }
          });
        `,
        },
        { reporter: '' }
      );

      expect(result.output).not.toContain('Failed request: (401)');
      // In testRun mode with 'last', only the final result is in the batch
      expect(publishedResults.length).toBe(1);
      expect(publishedResults[0].outcome).toBe('Passed');
      expect(result.exitCode).toBe(0);
      expect(result.flaky).toBe(1);
    });
  });

  test.describe("publishRetryResults: 'grouped'", () => {
    test('publishes grouped result with subResults for flaky test', async ({ runInlineTest, server }) => {
      setupDefaultRoutes(server);

      const publishedResults: any[] = [];
      server.setRoute('/SampleSample/_apis/test/Runs/150/Results', (req: any, res: any) => {
        getRequestBody(req).then((body: any) => {
          publishedResults.push(...body);
        });
        setHeaders(res, headers);
        server.serveFile(req, res, TEST_RUN_RESULTS_3_VALID_RESPONSE_PATH);
      });

      const result = await runInlineTest(
        {
          'playwright.config.ts': `
          module.exports = {
            retries: 2,
            reporter: [
              ['line'],
              ['${reporterPath}', {
                orgUrl: 'http://localhost:${server.PORT}',
                projectName: 'SampleSample',
                planId: 4,
                token: 'token',
                logging: true,
                publishRetryResults: 'grouped',
              }]
            ]
          };
        `,
          'a.spec.js': `
          import { test, expect } from '@playwright/test';
          test('[3] flakyTest', async ({}, testInfo) => {
            if (testInfo.retry < 1) {
              expect(1).toBe(0);
            }
          });
        `,
        },
        { reporter: '' }
      );

      expect(result.output).not.toContain('Failed request: (401)');
      // Should publish exactly 1 grouped result
      expect(publishedResults.length).toBe(1);

      const grouped = publishedResults[0];
      // resultGroupType 1 = Rerun
      expect(grouped.resultGroupType).toBe(1);
      // Should have 2 subResults: first failed, second passed
      expect(grouped.subResults).toBeDefined();
      expect(grouped.subResults.length).toBe(2);
      expect(grouped.subResults[0].outcome).toBe('Failed');
      expect(grouped.subResults[1].outcome).toBe('Passed');
      // Overall outcome should be Passed (final result)
      expect(grouped.outcome).toBe('Passed');
      // Should be marked as flaky
      expect(grouped.customFields).toBeDefined();
      expect(grouped.customFields).toContainEqual({ fieldName: 'IsTestResultFlaky', value: true });
      // SubResults should have AttemptId
      expect(grouped.subResults[0].customFields).toContainEqual({ fieldName: 'AttemptId', value: 1 });
      expect(grouped.subResults[1].customFields).toContainEqual({ fieldName: 'AttemptId', value: 2 });

      expect(result.exitCode).toBe(0);
      expect(result.flaky).toBe(1);
    });

    test('all-fail test is NOT marked as flaky', async ({ runInlineTest, server }) => {
      setupDefaultRoutes(server);

      const publishedResults: any[] = [];
      server.setRoute('/SampleSample/_apis/test/Runs/150/Results', (req: any, res: any) => {
        getRequestBody(req).then((body: any) => {
          publishedResults.push(...body);
        });
        setHeaders(res, headers);
        server.serveFile(req, res, TEST_RUN_RESULTS_3_VALID_RESPONSE_PATH);
      });

      const result = await runInlineTest(
        {
          'playwright.config.ts': `
          module.exports = {
            retries: 2,
            reporter: [
              ['line'],
              ['${reporterPath}', {
                orgUrl: 'http://localhost:${server.PORT}',
                projectName: 'SampleSample',
                planId: 4,
                token: 'token',
                logging: true,
                publishRetryResults: 'grouped',
              }]
            ]
          };
        `,
          'a.spec.js': `
          import { test, expect } from '@playwright/test';
          test('[3] alwaysFails', async () => {
            expect(1).toBe(0);
          });
        `,
        },
        { reporter: '' }
      );

      expect(publishedResults.length).toBe(1);

      const grouped = publishedResults[0];
      expect(grouped.resultGroupType).toBe(1);
      expect(grouped.subResults.length).toBe(3); // 3 attempts (0, 1, 2)
      expect(grouped.outcome).toBe('Failed');
      // Should NOT be marked as flaky since it never passed
      const flakyField = grouped.customFields?.find(
        (f: any) => f.fieldName === 'IsTestResultFlaky'
      );
      expect(flakyField).toBeUndefined();

      expect(result.exitCode).toBe(1);
      expect(result.failed).toBe(1);
    });

    test('test passes on first try - single subResult, not flaky', async ({ runInlineTest, server }) => {
      setupDefaultRoutes(server);

      const publishedResults: any[] = [];
      server.setRoute('/SampleSample/_apis/test/Runs/150/Results', (req: any, res: any) => {
        getRequestBody(req).then((body: any) => {
          publishedResults.push(...body);
        });
        setHeaders(res, headers);
        server.serveFile(req, res, TEST_RUN_RESULTS_3_VALID_RESPONSE_PATH);
      });

      const result = await runInlineTest(
        {
          'playwright.config.ts': `
          module.exports = {
            retries: 2,
            reporter: [
              ['line'],
              ['${reporterPath}', {
                orgUrl: 'http://localhost:${server.PORT}',
                projectName: 'SampleSample',
                planId: 4,
                token: 'token',
                logging: true,
                publishRetryResults: 'grouped',
              }]
            ]
          };
        `,
          'a.spec.js': `
          import { test, expect } from '@playwright/test';
          test('[3] passingTest', async () => {
            expect(1).toBe(1);
          });
        `,
        },
        { reporter: '' }
      );

      expect(publishedResults.length).toBe(1);

      const grouped = publishedResults[0];
      expect(grouped.resultGroupType).toBe(1);
      // Only 1 attempt
      expect(grouped.subResults.length).toBe(1);
      expect(grouped.subResults[0].outcome).toBe('Passed');
      expect(grouped.outcome).toBe('Passed');
      // Should NOT be marked as flaky (passed on first try, retry=0)
      const flakyField = grouped.customFields?.find(
        (f: any) => f.fieldName === 'IsTestResultFlaky'
      );
      expect(flakyField).toBeUndefined();

      expect(result.exitCode).toBe(0);
      expect(result.passed).toBe(1);
    });

    test('grouped mode in testRun mode', async ({ runInlineTest, server }) => {
      setupDefaultRoutes(server);

      const publishedResults: any[] = [];
      server.setRoute('/SampleSample/_apis/test/Runs/150/Results', (req: any, res: any) => {
        getRequestBody(req).then((body: any) => {
          publishedResults.push(...body);
        });
        setHeaders(res, headers);
        server.serveFile(req, res, TEST_RUN_RESULTS_3_VALID_RESPONSE_PATH);
      });

      const result = await runInlineTest(
        {
          'playwright.config.ts': `
          module.exports = {
            retries: 2,
            reporter: [
              ['line'],
              ['${reporterPath}', {
                orgUrl: 'http://localhost:${server.PORT}',
                projectName: 'SampleSample',
                planId: 4,
                token: 'token',
                logging: true,
                publishTestResultsMode: 'testRun',
                publishRetryResults: 'grouped',
              }]
            ]
          };
        `,
          'a.spec.js': `
          import { test, expect } from '@playwright/test';
          test('[3] flakyTest', async ({}, testInfo) => {
            if (testInfo.retry < 1) {
              expect(1).toBe(0);
            }
          });
        `,
        },
        { reporter: '' }
      );

      expect(result.output).not.toContain('Failed request: (401)');
      expect(publishedResults.length).toBe(1);

      const grouped = publishedResults[0];
      expect(grouped.resultGroupType).toBe(1);
      expect(grouped.subResults).toBeDefined();
      expect(grouped.subResults.length).toBe(2);
      expect(grouped.outcome).toBe('Passed');
      expect(grouped.customFields).toContainEqual({ fieldName: 'IsTestResultFlaky', value: true });

      expect(result.exitCode).toBe(0);
      expect(result.flaky).toBe(1);
    });
  });
});
