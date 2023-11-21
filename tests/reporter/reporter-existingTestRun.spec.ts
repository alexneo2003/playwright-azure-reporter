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

test.describe('testRun - Publish results - isExistingTestRun', () => {
  test('isExistingTestRun without testRunId', async ({ runInlineTest, server }) => {
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
              isExistingTestRun: true,
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
    expect(result.output).not.toMatch(/azure: Using existing run (\d.*) to publish test results/);
    expect(result.output).not.toContain('azure: AZURE_PW_TEST_RUN_ID: 150');
    expect(result.output).toContain(
      "azure: 'testRunId' or AZURE_PW_TEST_RUN_ID is not set for 'isExistingTestRun'=true mode. Reporting is disabled."
    );
    expect(result.output).not.toContain('azure: [3] foobar - failed');
    expect(result.output).not.toContain('azure: Start publishing test results for 1 test(s)');
    expect(result.output).not.toContain('azure: Left to publish: 0');
    expect(result.output).not.toContain('azure: Test results published for 1 test(s)');
    expect(result.output).not.toMatch(/azure: Run (\d.*) - Completed/);
    expect(result.exitCode).toBe(1);
    expect(result.failed).toBe(1);
  });

  test('isExistingTestRun with testRunId', async ({ runInlineTest, server }) => {
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
              isExistingTestRun: true,
              testRunId: 150,
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
    expect(result.output).toMatch(/azure: Using existing run (\d.*) to publish test results/);
    expect(result.output).toContain('azure: AZURE_PW_TEST_RUN_ID: 150');
    expect(result.output).not.toContain(
      "azure: 'testRunId' or AZURE_PW_TEST_RUN_ID is not set for 'isExistingTestRun'=true mode. Reporting is disabled."
    );
    expect(result.output).toContain('azure: [3] foobar - failed');
    expect(result.output).toContain('azure: Start publishing test results for 1 test(s)');
    expect(result.output).toContain('azure: Left to publish: 0');
    expect(result.output).toContain('azure: Test results published for 1 test(s)');
    expect(result.output).not.toMatch(/azure: Run (\d.*) - Completed/);
    expect(result.exitCode).toBe(1);
    expect(result.failed).toBe(1);
  });

  test('isExistingTestRun with AZURE_PW_TEST_RUN_ID', async ({ runInlineTest, server }) => {
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
              isExistingTestRun: true,
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
      { reporter: '' },
      { AZURE_PW_TEST_RUN_ID: '150' }
    );

    expect(result.output).not.toContain('Failed request: (401)');
    expect(result.output).toMatch(/azure: Using existing run (\d.*) to publish test results/);
    expect(result.output).toContain('azure: AZURE_PW_TEST_RUN_ID: 150');
    expect(result.output).not.toContain(
      "azure: 'testRunId' or AZURE_PW_TEST_RUN_ID is not set for 'isExistingTestRun'=true mode. Reporting is disabled."
    );
    expect(result.output).toContain('azure: [3] foobar - failed');
    expect(result.output).toContain('azure: Start publishing test results for 1 test(s)');
    expect(result.output).toContain('azure: Left to publish: 0');
    expect(result.output).toContain('azure: Test results published for 1 test(s)');
    expect(result.output).not.toMatch(/azure: Run (\d.*) - Completed/);
    expect(result.exitCode).toBe(1);
    expect(result.failed).toBe(1);
  });
});

test.describe('testResult - Publish results - isExistingTestRun', () => {
  test('isExistingTestRun without testRunId', async ({ runInlineTest, server }) => {
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
              publishTestResultsMode: 'testResult',
              isExistingTestRun: true,
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
    expect(result.output).not.toMatch(/azure: Using existing run (\d.*) to publish test results/);
    expect(result.output).not.toContain('azure: AZURE_PW_TEST_RUN_ID: 150');
    expect(result.output).toContain(
      "azure: 'testRunId' or AZURE_PW_TEST_RUN_ID is not set for 'isExistingTestRun'=true mode. Reporting is disabled."
    );
    expect(result.output).not.toContain('azure: [3] foobar - failed');
    expect(result.output).not.toContain('azure: Start publishing test results for 1 test(s)');
    expect(result.output).not.toContain('azure: Left to publish: 0');
    expect(result.output).not.toContain('azure: Test results published for 1 test(s)');
    expect(result.output).not.toMatch(/azure: Run (\d.*) - Completed/);
    expect(result.exitCode).toBe(1);
    expect(result.failed).toBe(1);
  });

  test('isExistingTestRun with testRunId', async ({ runInlineTest, server }) => {
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
              publishTestResultsMode: 'testResult',
              isExistingTestRun: true,
              testRunId: 150,
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
    expect(result.output).toMatch(/azure: Using existing run (\d.*) to publish test results/);
    expect(result.output).toContain('azure: AZURE_PW_TEST_RUN_ID: 150');
    expect(result.output).not.toContain(
      "azure: 'testRunId' or AZURE_PW_TEST_RUN_ID is not set for 'isExistingTestRun'=true mode. Reporting is disabled."
    );
    expect(result.output).toContain('azure: [3] foobar - failed');
    expect(result.output).toContain('azure: Start publishing: [3] foobar');
    expect(result.output).toContain('azure: Result published: [3] foobar');
    expect(result.output).not.toMatch(/azure: Run (\d.*) - Completed/);
    expect(result.exitCode).toBe(1);
    expect(result.failed).toBe(1);
  });

  test('isExistingTestRun with AZURE_PW_TEST_RUN_ID', async ({ runInlineTest, server }) => {
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
              publishTestResultsMode: 'testResult',
              isExistingTestRun: true,
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
      { reporter: '' },
      { AZURE_PW_TEST_RUN_ID: '150' }
    );

    expect(result.output).not.toContain('Failed request: (401)');
    expect(result.output).toMatch(/azure: Using existing run (\d.*) to publish test results/);
    expect(result.output).toContain('azure: AZURE_PW_TEST_RUN_ID: 150');
    expect(result.output).not.toContain(
      "azure: 'testRunId' or AZURE_PW_TEST_RUN_ID is not set for 'isExistingTestRun'=true mode. Reporting is disabled."
    );
    expect(result.output).toContain('azure: [3] foobar - failed');
    expect(result.output).toContain('azure: Start publishing: [3] foobar');
    expect(result.output).toContain('azure: Result published: [3] foobar');
    expect(result.output).not.toMatch(/azure: Run (\d.*) - Completed/);
    expect(result.exitCode).toBe(1);
    expect(result.failed).toBe(1);
  });
});
