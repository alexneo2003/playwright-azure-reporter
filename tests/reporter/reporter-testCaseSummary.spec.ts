import path from 'path';

import { setHeaders } from '../config/utils';
import azureAreas from './assets/azure-reporter/azureAreas';
import headers from './assets/azure-reporter/azureHeaders';
import azureLocationOptions from './assets/azure-reporter/azureLocationOptionsResponse.json';
import { reporterPath } from './reporterPath';
import { expect, test } from './test-fixtures';

const location = azureLocationOptions;

test.describe('Test Case Summary Feature', () => {
  test.setTimeout(5_000);

  test('should generate summary when testCaseSummary is enabled and tests have no matching test points', async ({
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
      server.serveFile(req, res, path.join(__dirname, 'assets', 'azure-reporter', 'azureTestOptionsResponse.json'));
    });

    server.setRoute('/_apis/core', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, path.join(__dirname, 'assets', 'azure-reporter', 'azureCoreOptionsResponse.json'));
    });

    server.setRoute('/_apis/testplan', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, path.join(__dirname, 'assets', 'azure-reporter', 'azureTestPlanOptionsResponse.json'));
    });

    server.setRoute('/_apis/projects/SampleSample', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, path.join(__dirname, 'assets', 'azure-reporter', 'projectValidResponse.json'));
    });

    // Mock configuration API responses with names
    server.setRoute('/SampleSample/_apis/testplan/Configurations/10', (req, res) => {
      setHeaders(res, headers);
      res.end(JSON.stringify({ id: 10, name: 'Firefox on Ubuntu' }));
    });

    server.setRoute('/SampleSample/_apis/testplan/Configurations/20', (req, res) => {
      setHeaders(res, headers);
      res.end(JSON.stringify({ id: 20, name: 'Safari on macOS' }));
    });

    server.setRoute('/SampleSample/_apis/test/Runs', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, path.join(__dirname, 'assets', 'azure-reporter', 'createRunValidResponse.json'));
    });

    server.setRoute('/SampleSample/_apis/test/Points', async (req, res) => {
      setHeaders(res, headers);
      // Return empty points to simulate no matching test points
      res.end(JSON.stringify({ points: [] }));
    });

    server.setRoute('/SampleSample/_apis/test/Runs/150', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, path.join(__dirname, 'assets', 'azure-reporter', 'completeRunValidResponse.json'));
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
                testCaseSummary: {
                  enabled: true,
                  consoleOutput: true
                },
                testRunConfig: {
                  configurationIds: [10, 20],
                },
              }]
            ]
          };
        `,
        'a.spec.js': `
          import { test, expect } from '@playwright/test';
          test('[123] Test with non-existing test case ID', async () => {
            expect(1).toBe(1);
            });
          test('[456,789] Test with multiple non-existing test case IDs', async () => {
            expect(1).toBe(1);
          });
        `,
      },
      { reporter: '' },
      {
        AZUREPWDEBUG: '1',
      }
    );

    expect(result.output).toContain('Loaded 2 configuration(s): Firefox on Ubuntu, Safari on macOS');
    expect(result.output).toMatch(/azure:pw:log Run (\d.*) - Completed/);
    expect(result.output).toContain('Test Case Summary');
    expect(result.output).toContain("⚠️  Found 2 test(s) with test case IDs that don't match the test plan");
    expect(result.output).toContain('Tests with No Matching Test Points (2)');
    expect(result.output).toContain('[123] Test with non-existing test case ID');
    expect(result.output).toContain('[456,789] Test with multiple non-existing test case IDs');
    expect(result.output).toContain('Test Case IDs: [123]');
    expect(result.output).toContain('Test Case IDs: [456, 789]');
    expect(result.output).toContain('Verify test case IDs exist in Azure DevOps test plan 4');
    expect(result.output).toContain('No test points found for test case [123]');
    expect(result.output).toContain('No test points found for test case [456,789]');
    expect(result.exitCode).toBe(0);
  });

  test('should generate summary with configuration information when configurations are specified', async ({
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
      server.serveFile(req, res, path.join(__dirname, 'assets', 'azure-reporter', 'azureTestOptionsResponse.json'));
    });

    server.setRoute('/_apis/core', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, path.join(__dirname, 'assets', 'azure-reporter', 'azureCoreOptionsResponse.json'));
    });

    server.setRoute('/_apis/testplan', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, path.join(__dirname, 'assets', 'azure-reporter', 'azureTestPlanOptionsResponse.json'));
    });

    server.setRoute('/_apis/projects/SampleSample', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, path.join(__dirname, 'assets', 'azure-reporter', 'projectValidResponse.json'));
    });

    server.setRoute('/SampleSample/_apis/test/Runs', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, path.join(__dirname, 'assets', 'azure-reporter', 'createRunValidResponse.json'));
    });

    server.setRoute('/SampleSample/_apis/test/Points', async (req, res) => {
      setHeaders(res, headers);
      res.end(JSON.stringify({ points: [] }));
    });

    // Mock configuration API responses
    server.setRoute('/SampleSample/_apis/testplan/Configurations/1', (req, res) => {
      setHeaders(res, headers);
      res.end(JSON.stringify({ id: 1, name: 'Windows 10' }));
    });

    server.setRoute('/SampleSample/_apis/testplan/Configurations/2', (req, res) => {
      setHeaders(res, headers);
      res.end(JSON.stringify({ id: 2, name: 'Chrome' }));
    });

    server.setRoute('/SampleSample/_apis/test/Runs/150', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, path.join(__dirname, 'assets', 'azure-reporter', 'completeRunValidResponse.json'));
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
                testCaseSummary: {
                  enabled: true,
                  consoleOutput: true
                },
                testRunConfig: {
                  configurationIds: [1, 2]
                }
              }]
            ]
          };
        `,
        'a.spec.js': `
          import { test, expect } from '@playwright/test';
          test('[999] Test with configuration mismatch', async () => {
            expect(1).toBe(1);
          });
        `,
      },
      { reporter: '' }
    );

    expect(result.output).toContain('Loaded 2 configuration(s): Windows 10, Chrome');
    expect(result.output).toContain('Test Case Summary');
    expect(result.output).toContain("⚠️  Found 1 test(s) with test case IDs that don't match the test plan");
    expect(result.output).toContain('Check that test cases are assigned to configurations: [1, 2]');
    expect(result.output).toContain('Loaded 2 configuration(s): Windows 10, Chrome');
    expect(result.exitCode).toBe(0);
  });

  test('should not generate summary when testCaseSummary is disabled', async ({ runInlineTest, server }) => {
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
      server.serveFile(req, res, path.join(__dirname, 'assets', 'azure-reporter', 'azureTestOptionsResponse.json'));
    });

    server.setRoute('/_apis/core', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, path.join(__dirname, 'assets', 'azure-reporter', 'azureCoreOptionsResponse.json'));
    });

    server.setRoute('/_apis/testplan', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, path.join(__dirname, 'assets', 'azure-reporter', 'azureTestPlanOptionsResponse.json'));
    });

    server.setRoute('/_apis/projects/SampleSample', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, path.join(__dirname, 'assets', 'azure-reporter', 'projectValidResponse.json'));
    });

    server.setRoute('/SampleSample/_apis/test/Runs', (req, res) => {
      setHeaders(res, headers);
      res.end(JSON.stringify({ id: 150, name: 'Test Run', state: 'InProgress' }));
    });

    server.setRoute('/SampleSample/_apis/test/Points', async (req, res) => {
      setHeaders(res, headers);
      res.end(JSON.stringify({ points: [] }));
    });

    server.setRoute('/SampleSample/_apis/test/Runs/150', (req, res) => {
      setHeaders(res, headers);
      res.end(JSON.stringify({ id: 150, state: 'Completed' }));
    });

    // Mock configuration API responses with names
    server.setRoute('/SampleSample/_apis/testplan/Configurations/10', (req, res) => {
      setHeaders(res, headers);
      res.end(JSON.stringify({ id: 10, name: 'Firefox on Ubuntu' }));
    });

    server.setRoute('/SampleSample/_apis/testplan/Configurations/20', (req, res) => {
      setHeaders(res, headers);
      res.end(JSON.stringify({ id: 20, name: 'Safari on macOS' }));
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
                testCaseSummary: {
                  enabled: false
                },
                testRunConfig: {
                  configurationIds: [10, 20],
                },
              }]
            ]
          };
        `,
        'a.spec.js': `
          import { test, expect } from '@playwright/test';
          test('[999] Test with non-existing test case ID', async () => {
            expect(1).toBe(1);
          });
        `,
      },
      { reporter: '' }
    );

    expect(result.output).toContain('Loaded 2 configuration(s): Firefox on Ubuntu, Safari on macOS');
    expect(result.output).not.toContain('Test Case Summary');
    expect(result.output).not.toContain('⚠️  Found');
    expect(result.output).toContain('No test points found for test case [999]'); // Still logs the warning
    expect(result.exitCode).toBe(0);
  });

  test('should show positive summary when all tests match test plan', async ({ runInlineTest, server }) => {
    const POINTS_VALID_RESPONSE_PATH = path.join(__dirname, 'assets', 'azure-reporter', 'points3Response.json');

    const TEST_RUN_RESULTS_VALID_RESPONSE_PATH = path.join(
      __dirname,
      'assets',
      'azure-reporter',
      'testRunResults3ValidResponse.json'
    );

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
      server.serveFile(req, res, path.join(__dirname, 'assets', 'azure-reporter', 'azureTestOptionsResponse.json'));
    });

    server.setRoute('/_apis/testplan', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, path.join(__dirname, 'assets', 'azure-reporter', 'azureTestPlanOptionsResponse.json'));
    });

    server.setRoute('/_apis/core', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, path.join(__dirname, 'assets', 'azure-reporter', 'azureCoreOptionsResponse.json'));
    });

    server.setRoute('/_apis/projects/SampleSample', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, path.join(__dirname, 'assets', 'azure-reporter', 'projectValidResponse.json'));
    });

    server.setRoute('/SampleSample/_apis/test/Runs', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, path.join(__dirname, 'assets', 'azure-reporter', 'createRunValidResponse.json'));
    });

    server.setRoute('/SampleSample/_apis/test/Points', async (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, POINTS_VALID_RESPONSE_PATH);
    });

    server.setRoute('/SampleSample/_apis/test/Runs/150/Results', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, TEST_RUN_RESULTS_VALID_RESPONSE_PATH);
    });

    server.setRoute('/SampleSample/_apis/test/Runs/150', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, path.join(__dirname, 'assets', 'azure-reporter', 'completeRunValidResponse.json'));
    });

    // Mock configuration API responses with names
    server.setRoute('/SampleSample/_apis/testplan/Configurations/1', (req, res) => {
      setHeaders(res, headers);
      res.end(JSON.stringify({ id: 1, name: 'Windows 10' }));
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
                testCaseSummary: {
                  enabled: true,
                  consoleOutput: true
                },
                testRunConfig: {
                  configurationIds: [1],
                },
              }]
            ]
          };
        `,
        'a.spec.js': `
          import { test, expect } from '@playwright/test';
          test('[3] Test with valid test case ID', async () => {
            expect(1).toBe(1);
          });
        `,
      },
      { reporter: '' }
    );

    expect(result.output).toContain('Loaded 1 configuration(s): Windows 10');
    expect(result.output).toContain('Test Case Summary');
    expect(result.output).toContain('✅ All tests with test case IDs found matching test points in the test plan');
    expect(result.output).not.toContain('⚠️  Found');
    expect(result.output).not.toContain('Tests with No Matching Test Points');
    expect(result.exitCode).toBe(0);
  });

  test('should work with testRun publishing mode', async ({ runInlineTest, server }) => {
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
      server.serveFile(req, res, path.join(__dirname, 'assets', 'azure-reporter', 'azureTestOptionsResponse.json'));
    });

    server.setRoute('/_apis/core', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, path.join(__dirname, 'assets', 'azure-reporter', 'azureCoreOptionsResponse.json'));
    });

    server.setRoute('/_apis/testplan', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, path.join(__dirname, 'assets', 'azure-reporter', 'azureTestPlanOptionsResponse.json'));
    });

    server.setRoute('/_apis/projects/SampleSample', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, path.join(__dirname, 'assets', 'azure-reporter', 'projectValidResponse.json'));
    });

    server.setRoute('/SampleSample/_apis/test/Runs', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, path.join(__dirname, 'assets', 'azure-reporter', 'createRunValidResponse.json'));
    });

    server.setRoute('/SampleSample/_apis/test/Points', async (req, res) => {
      setHeaders(res, headers);
      res.end(JSON.stringify({ points: [] }));
    });

    server.setRoute('/SampleSample/_apis/test/Runs/150/Results', (req, res) => {
      setHeaders(res, headers);
      res.end(JSON.stringify({ count: 0, value: [] }));
    });

    server.setRoute('/SampleSample/_apis/test/Runs/150', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, path.join(__dirname, 'assets', 'azure-reporter', 'completeRunValidResponse.json'));
    });

    // Mock configuration API responses with names
    server.setRoute('/SampleSample/_apis/testplan/Configurations/10', (req, res) => {
      setHeaders(res, headers);
      res.end(JSON.stringify({ id: 10, name: 'Firefox on Ubuntu' }));
    });

    server.setRoute('/SampleSample/_apis/testplan/Configurations/20', (req, res) => {
      setHeaders(res, headers);
      res.end(JSON.stringify({ id: 20, name: 'Safari on macOS' }));
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
                testCaseSummary: {
                  enabled: true,
                  consoleOutput: true
                },
                testRunConfig: {
                  configurationIds: [10, 20],
                },
              }]
            ]
          };
        `,
        'a.spec.js': `
          import { test, expect } from '@playwright/test';
          test('[888] Test with testRun mode', async () => {
            expect(1).toBe(1);
          });
        `,
      },
      { reporter: '' }
    );

    expect(result.output).toContain('Loaded 2 configuration(s): Firefox on Ubuntu, Safari on macOS');
    expect(result.output).toContain('Test Case Summary');
    expect(result.output).toContain("⚠️  Found 1 test(s) with test case IDs that don't match the test plan");
    expect(result.output).toContain('[888] Test with testRun mode');
    expect(result.exitCode).toBe(0);
  });

  test('should handle file output when outputPath is specified', async ({ runInlineTest, server }) => {
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
      server.serveFile(req, res, path.join(__dirname, 'assets', 'azure-reporter', 'azureTestOptionsResponse.json'));
    });

    server.setRoute('/_apis/core', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, path.join(__dirname, 'assets', 'azure-reporter', 'azureCoreOptionsResponse.json'));
    });

    server.setRoute('/_apis/testplan', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, path.join(__dirname, 'assets', 'azure-reporter', 'azureTestPlanOptionsResponse.json'));
    });

    server.setRoute('/_apis/projects/SampleSample', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, path.join(__dirname, 'assets', 'azure-reporter', 'projectValidResponse.json'));
    });

    server.setRoute('/SampleSample/_apis/test/Runs', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, path.join(__dirname, 'assets', 'azure-reporter', 'createRunValidResponse.json'));
    });

    server.setRoute('/SampleSample/_apis/test/Points', async (req, res) => {
      setHeaders(res, headers);
      res.end(JSON.stringify({ points: [] }));
    });

    server.setRoute('/SampleSample/_apis/test/Runs/150', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, path.join(__dirname, 'assets', 'azure-reporter', 'completeRunValidResponse.json'));
    });

    // Mock configuration API responses with names
    server.setRoute('/SampleSample/_apis/testplan/Configurations/10', (req, res) => {
      setHeaders(res, headers);
      res.end(JSON.stringify({ id: 10, name: 'Firefox on Ubuntu' }));
    });

    server.setRoute('/SampleSample/_apis/testplan/Configurations/20', (req, res) => {
      setHeaders(res, headers);
      res.end(JSON.stringify({ id: 20, name: 'Safari on macOS' }));
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
                testCaseSummary: {
                  enabled: true,
                  outputPath: './test-case-summary.md',
                  consoleOutput: true
                },
                testRunConfig: {
                  configurationIds: [10, 20],
                },
              }]
            ]
          };
        `,
        'a.spec.js': `
          import { test, expect } from '@playwright/test';
          test('[777] Test with file output', async () => {
            expect(1).toBe(1);
          });
        `,
      },
      { reporter: '' }
    );

    expect(result.output).toContain('Loaded 2 configuration(s): Firefox on Ubuntu, Safari on macOS');
    expect(result.output).toContain('Test case summary written to: ./test-case-summary.md');
    expect(result.output).not.toContain('Test Case Summary'); // Console output disabled
    expect(result.exitCode).toBe(0);
  });

  test('should include configuration names in summary when available', async ({ runInlineTest, server }) => {
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
      server.serveFile(req, res, path.join(__dirname, 'assets', 'azure-reporter', 'azureTestOptionsResponse.json'));
    });

    server.setRoute('/_apis/testplan', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, path.join(__dirname, 'assets', 'azure-reporter', 'azureTestPlanOptionsResponse.json'));
    });

    server.setRoute('/_apis/core', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, path.join(__dirname, 'assets', 'azure-reporter', 'azureCoreOptionsResponse.json'));
    });

    server.setRoute('/_apis/projects/SampleSample', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, path.join(__dirname, 'assets', 'azure-reporter', 'projectValidResponse.json'));
    });

    server.setRoute('/SampleSample/_apis/test/Runs', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, path.join(__dirname, 'assets', 'azure-reporter', 'createRunValidResponse.json'));
    });

    server.setRoute('/SampleSample/_apis/test/Points', async (req, res) => {
      setHeaders(res, headers);
      res.end(JSON.stringify({ points: [] }));
    });

    // Mock configuration API responses with names
    server.setRoute('/SampleSample/_apis/testplan/Configurations/10', (req, res) => {
      setHeaders(res, headers);
      res.end(JSON.stringify({ id: 10, name: 'Firefox on Ubuntu' }));
    });

    server.setRoute('/SampleSample/_apis/testplan/Configurations/20', (req, res) => {
      setHeaders(res, headers);
      res.end(JSON.stringify({ id: 20, name: 'Safari on macOS' }));
    });

    server.setRoute('/SampleSample/_apis/test/Runs/150', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, path.join(__dirname, 'assets', 'azure-reporter', 'completeRunValidResponse.json'));
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
                testCaseSummary: {
                  enabled: true,
                  consoleOutput: true
                },
                testRunConfig: {
                  configurationIds: [10, 20]
                }
              }]
            ]
          };
        `,
        'a.spec.js': `
          import { test, expect } from '@playwright/test';
          test('[555] Test with named configurations', async () => {
            expect(1).toBe(1);
          });
        `,
      },
      { reporter: '' },
      {
        AZUREPWDEBUG: '1',
      }
    );

    expect(result.output).toContain('Test Case Summary');
    expect(result.output).toContain('Loaded 2 configuration(s): Firefox on Ubuntu, Safari on macOS');
    expect(result.output).toContain(
      'Check that test cases are assigned to configurations: [10, 20] (Firefox on Ubuntu, Safari on macOS)'
    );
    expect(result.exitCode).toBe(0);
  });

  test('should publish summary as run attachment when enabled', async ({ runInlineTest, server }) => {
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
      server.serveFile(req, res, path.join(__dirname, 'assets', 'azure-reporter', 'azureTestOptionsResponse.json'));
    });

    server.setRoute('/_apis/core', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, path.join(__dirname, 'assets', 'azure-reporter', 'azureCoreOptionsResponse.json'));
    });

    server.setRoute('/_apis/testplan', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, path.join(__dirname, 'assets', 'azure-reporter', 'azureTestPlanOptionsResponse.json'));
    });

    server.setRoute('/_apis/projects/SampleSample', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, path.join(__dirname, 'assets', 'azure-reporter', 'projectValidResponse.json'));
    });

    server.setRoute('/SampleSample/_apis/test/Runs', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, path.join(__dirname, 'assets', 'azure-reporter', 'createRunValidResponse.json'));
    });

    server.setRoute('/SampleSample/_apis/test/Points', async (req, res) => {
      setHeaders(res, headers);
      // Return empty points so summary will include unmatched tests
      res.end(JSON.stringify({ points: [] }));
    });

    // Mock run complete endpoint
    server.setRoute('/SampleSample/_apis/test/Runs/150', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, path.join(__dirname, 'assets', 'azure-reporter', 'completeRunValidResponse.json'));
    });

    // Mock run attachment creation endpoint
    server.setRoute('/SampleSample/_apis/test/Runs/150/Attachments', (req, res) => {
      setHeaders(res, headers);
      res.end(
        JSON.stringify({
          id: 42,
          url: `http://localhost:${server.PORT}/SampleSample/_apis/test/Runs/150/Attachments/42`,
        })
      );
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
                testCaseSummary: {
                  enabled: true,
                  consoleOutput: true,
                  outputPath: './test-case-summary.md',
                  publishToRun: true
                },
                testRunConfig: {
                  configurationIds: [10, 20],
                },
              }]
            ]
          };
        `,
        'a.spec.js': `
          import { test, expect } from '@playwright/test';
          test('[111] Test to produce unmatched summary', async () => {
            expect(1).toBe(1);
          });
        `,
      },
      { reporter: '' }
    );

    expect(result.output).toContain('Test Case Summary');
    expect(result.output).toContain('attached to run 150 as test-case-summary.md');
    expect(result.exitCode).toBe(0);
  });
});
