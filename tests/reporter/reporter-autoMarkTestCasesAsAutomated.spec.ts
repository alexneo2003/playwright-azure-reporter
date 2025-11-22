import * as path from 'path';

import { getRequestBody, setHeaders } from '../config/utils';
import azureAreas from './assets/azure-reporter/azureAreas';
import headers from './assets/azure-reporter/azureHeaders';
import location from './assets/azure-reporter/azureLocationOptionsResponse.json';
import { reporterPath } from './reporterPath';
import { expect, test } from './test-fixtures';

const CORE_OPTIONS_RESPONSE_PATH = path.join(__dirname, 'assets', 'azure-reporter', 'azureCoreOptionsResponse.json');
const TEST_OPTIONS_RESPONSE_PATH = path.join(__dirname, 'assets', 'azure-reporter', 'azureTestOptionsResponse.json');
const WORK_ITEM_TRACKING_OPTIONS_RESPONSE_PATH = path.join(
  __dirname,
  'assets',
  'azure-reporter',
  'azureWorkItemTrackingOptionsResponse.json'
);
const PROJECT_VALID_RESPONSE_PATH = path.join(__dirname, 'assets', 'azure-reporter', 'projectValidResponse.json');
const CREATE_RUN_VALID_RESPONSE_PATH = path.join(__dirname, 'assets', 'azure-reporter', 'createRunValidResponse.json');
const COMPLETE_RUN_VALID_RESPONSE_PATH = path.join(
  __dirname,
  'assets',
  'azure-reporter',
  'completeRunValidResponse.json'
);
const POINTS_1_RESPONSE_PATH = path.join(__dirname, 'assets', 'azure-reporter', 'points1Response.json');

test.describe('Auto-mark test cases as automated feature', () => {
  test('should not mark test cases when feature is disabled', async ({ runInlineTest, server }) => {
    const workItemGetRequests: any[] = [];
    const workItemUpdateRequests: any[] = [];

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

    server.setRoute('/_apis/wit', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, WORK_ITEM_TRACKING_OPTIONS_RESPONSE_PATH);
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
      server.serveFile(req, res, POINTS_1_RESPONSE_PATH);
    });

    server.setRoute('/SampleSample/_apis/test/Runs/150/Results', (req, res) => {
      setHeaders(res, headers);
      res.end(
        JSON.stringify({
          count: 1,
          value: [
            {
              id: 100000,
              project: {},
              outcome: 'Passed',
              testRun: { id: '150' },
              priority: 0,
              url: 'http://localhost/result',
              lastUpdatedBy: {},
            },
          ],
        })
      );
    });

    server.setRoute('/SampleSample/_apis/test/Runs/150', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, COMPLETE_RUN_VALID_RESPONSE_PATH);
    });

    // Work Item Tracking routes - should not be called
    server.setRoute('/_apis/wit/WorkItems/1', async (req, res) => {
      if (req.method === 'GET') {
        workItemGetRequests.push({ id: 1, url: req.url });
        setHeaders(res, headers);
        res.end(JSON.stringify({ id: 1, fields: { 'Microsoft.VSTS.TCM.AutomationStatus': 'Not Automated' } }));
      } else if (req.method === 'PATCH') {
        const body = await getRequestBody(req);
        workItemUpdateRequests.push(body);
        setHeaders(res, headers);
        res.end(JSON.stringify({ id: 1 }));
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
              publishTestResultsMode: 'testResult',
              // autoMarkTestCasesAsAutomated is not enabled
            }]
          ]
        };
      `,
        'a.spec.js': `
        import { test, expect } from '@playwright/test';
        test('[1] foobar', async ({}) => {
          expect(1).toBe(1);
        });
      `,
      },
      { reporter: '' }
    );

    expect(result.passed).toBe(1);
    expect(workItemGetRequests.length).toBe(0);
    expect(workItemUpdateRequests.length).toBe(0);
  });

  test('should mark "Not Automated" test case as automated with all fields', async ({ runInlineTest, server }) => {
    const workItemGetRequests: any[] = [];
    const workItemUpdateRequests: any[] = [];

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

    server.setRoute('/_apis/wit', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, WORK_ITEM_TRACKING_OPTIONS_RESPONSE_PATH);
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
      server.serveFile(req, res, POINTS_1_RESPONSE_PATH);
    });

    server.setRoute('/SampleSample/_apis/test/Runs/150/Results', (req, res) => {
      setHeaders(res, headers);
      res.end(
        JSON.stringify({
          count: 1,
          value: [
            {
              id: 100000,
              project: {},
              outcome: 'Passed',
              testRun: { id: '150' },
              priority: 0,
              url: 'http://localhost/result',
              lastUpdatedBy: {},
            },
          ],
        })
      );
    });

    server.setRoute('/SampleSample/_apis/test/Runs/150', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, COMPLETE_RUN_VALID_RESPONSE_PATH);
    });

    // Work Item Tracking routes
    server.setRoute(
      '/_apis/wit/WorkItems/1?fields=Microsoft.VSTS.TCM.AutomationStatus%2CMicrosoft.VSTS.TCM.AutomatedTestName%2CMicrosoft.VSTS.TCM.AutomatedTestStorage',
      (req, res) => {
        workItemGetRequests.push({ id: 1, url: req.url });
        setHeaders(res, headers);
        res.end(
          JSON.stringify({
            id: 1,
            fields: {
              'Microsoft.VSTS.TCM.AutomationStatus': 'Not Automated',
              'Microsoft.VSTS.TCM.AutomatedTestName': '',
              'Microsoft.VSTS.TCM.AutomatedTestStorage': '',
            },
          })
        );
      }
    );

    server.setRoute('/_apis/wit/WorkItems/1', async (req, res) => {
      const body = await getRequestBody(req);
      workItemUpdateRequests.push(body);
      setHeaders(res, headers);
      res.end(JSON.stringify({ id: 1 }));
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
              autoMarkTestCasesAsAutomated: {
                enabled: true,
                updateAutomatedTestName: true,
                updateAutomatedTestStorage: true,
              }
            }]
          ]
        };
      `,
        'a.spec.js': `
        import { test, expect } from '@playwright/test';
        test('[1] foobar', async ({}) => {
          expect(1).toBe(1);
        });
      `,
      },
      { reporter: '' }
    );

    expect(result.passed).toBe(1);
    expect(result.output).toContain('azure:pw:log Marking test case 1 as automated');
    expect(result.output).toContain('azure:pw:log Test case 1 marked as automated');
    expect(result.output).toContain('azure:pw:log Result published: [1] foobar');

    expect(workItemGetRequests.length).toBe(1);
    expect(workItemUpdateRequests.length).toBe(1);

    const patchDocument = workItemUpdateRequests[0];
    expect(patchDocument.length).toBe(4);

    // Check AutomationStatus
    const statusOp = patchDocument.find((op: any) => op.path === '/fields/Microsoft.VSTS.TCM.AutomationStatus');
    expect(statusOp).toBeDefined();
    expect(statusOp.op).toBe('add');
    expect(statusOp.value).toBe('Automated');

    // Check AutomatedTestName
    const testNameOp = patchDocument.find((op: any) => op.path === '/fields/Microsoft.VSTS.TCM.AutomatedTestName');
    expect(testNameOp).toBeDefined();
    expect(testNameOp.op).toBe('add');
    expect(testNameOp.value).toContain('[1] foobar');

    // Check AutomatedTestStorage
    const testStorageOp = patchDocument.find(
      (op: any) => op.path === '/fields/Microsoft.VSTS.TCM.AutomatedTestStorage'
    );
    expect(testStorageOp).toBeDefined();
    expect(testStorageOp.op).toBe('add');
    expect(testStorageOp.value).toBe('a.spec.js');

    // Check AutomatedTestId (32-character hex string)
    const testIdOp = patchDocument.find((op: any) => op.path === '/fields/Microsoft.VSTS.TCM.AutomatedTestId');
    expect(testIdOp).toBeDefined();
    expect(testIdOp.op).toBe('add');
    expect(testIdOp.value).toMatch(/^[0-9a-f]{32}$/i);
  });

  test('should not update already automated test case when no changes needed', async ({ runInlineTest, server }) => {
    const workItemGetRequests: any[] = [];
    const workItemUpdateRequests: any[] = [];

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

    server.setRoute('/_apis/wit', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, WORK_ITEM_TRACKING_OPTIONS_RESPONSE_PATH);
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
      server.serveFile(req, res, POINTS_1_RESPONSE_PATH);
    });

    server.setRoute('/SampleSample/_apis/test/Runs/150/Results', (req, res) => {
      setHeaders(res, headers);
      res.end(
        JSON.stringify({
          count: 1,
          value: [
            {
              id: 100000,
              project: {},
              outcome: 'Passed',
              testRun: { id: '150' },
              priority: 0,
              url: 'http://localhost/result',
              lastUpdatedBy: {},
            },
          ],
        })
      );
    });

    server.setRoute('/SampleSample/_apis/test/Runs/150', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, COMPLETE_RUN_VALID_RESPONSE_PATH);
    });

    // Work Item Tracking routes
    server.setRoute(
      '/_apis/wit/WorkItems/1?fields=Microsoft.VSTS.TCM.AutomationStatus%2CMicrosoft.VSTS.TCM.AutomatedTestName%2CMicrosoft.VSTS.TCM.AutomatedTestStorage',
      (req, res) => {
        workItemGetRequests.push({ id: 1, url: req.url });
        setHeaders(res, headers);
        res.end(
          JSON.stringify({
            id: 1,
            fields: {
              'Microsoft.VSTS.TCM.AutomationStatus': 'Automated',
              'Microsoft.VSTS.TCM.AutomatedTestName': '[1] foobar',
              'Microsoft.VSTS.TCM.AutomatedTestStorage': 'a.spec.js',
            },
          })
        );
      }
    );

    server.setRoute('/_apis/wit/WorkItems/1', async (req, res) => {
      const body = await getRequestBody(req);
      workItemUpdateRequests.push(body);
      setHeaders(res, headers);
      res.end(JSON.stringify({ id: 1 }));
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
              autoMarkTestCasesAsAutomated: {
                enabled: true,
                updateAutomatedTestName: true,
                updateAutomatedTestStorage: true,
              }
            }]
          ]
        };
      `,
        'a.spec.js': `
        import { test, expect } from '@playwright/test';
        test('[1] foobar', async ({}) => {
          expect(1).toBe(1);
        });
      `,
      },
      { reporter: '' }
    );

    expect(result.passed).toBe(1);
    // Debug messages are not shown with just logging:true, they require debug-level logging
    // Instead, verify that workItem was retrieved and no update was made
    expect(workItemGetRequests.length).toBe(1);
    // Should not update since values are the same
    expect(workItemUpdateRequests.length).toBe(0);
  });
});
