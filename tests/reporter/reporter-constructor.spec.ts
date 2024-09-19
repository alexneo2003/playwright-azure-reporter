import path from 'path';
import { isRegExp } from 'util/types';

import AzureDevOpsReporter from '../../dist/playwright-azure-reporter';
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
const PROJECT_INVALID_RESPONSE_PATH = path.join(
  __dirname,
  '.',
  'assets',
  'azure-reporter',
  'projectInvalidResponse.json'
);
const CREATE_RUN_INVALID_RESPONSE_PATH = path.join(
  __dirname,
  '.',
  'assets',
  'azure-reporter',
  'createRunInvalidResponse.json'
);

const CREATE_RUN_VALID_RESPONSE_PATH = path.join(
  __dirname,
  '.',
  'assets',
  'azure-reporter',
  'createRunValidResponse.json'
);
const POINTS_3_VALID_RESPONSE_PATH = path.join(__dirname, '.', 'assets', 'azure-reporter', 'points3Response.json');
const POINTS_7_VALID_RESPONSE_PATH = path.join(__dirname, '.', 'assets', 'azure-reporter', 'points7Response.json');
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
const TEST_RUN_RESULTS_7_VALID_RESPONSE_PATH = path.join(
  __dirname,
  '.',
  'assets',
  'azure-reporter',
  'testRunResults7ValidResponse.json'
);
const RUN_RESULTS_ATTACHMENTS_VALID_RESPONSE_PATH = path.join(
  __dirname,
  '.',
  'assets',
  'azure-reporter',
  'runResultsAttachmentsResponse.json'
);

test.describe('Reporter constructor', () => {
  test("'orgUrl' in config expected", async ({ runInlineTest }) => {
    const result = await runInlineTest(
      {
        'playwright.config.ts': `
        module.exports = { 
          reporter: [
            ['line'],
            ['${reporterPath}']
          ]
        };
      `,
        'a.spec.js': `
        import { test, expect } from '@playwright/test';
        test('foobar', async () => {
          expect(1).toBe(0);
        });
      `,
      },
      { reporter: '' }
    );

    expect(result.output).toContain("azure:pw:warn 'orgUrl' is not set. Reporting is disabled.");
    expect(result.exitCode).toBe(1);
    expect(result.failed).toBe(1);
  });

  test("'projectName' in config expected", async ({ runInlineTest }) => {
    const result = await runInlineTest(
      {
        'playwright.config.ts': `
        module.exports = { 
          reporter: [
            ['line'],
            ['${reporterPath}', { 
              orgUrl: 'http://azure.devops.com' 
            }]
          ]
        };
      `,
        'a.spec.js': `
        import { test, expect } from '@playwright/test';
        test('foobar', async ({}) => {
          expect(1).toBe(0);
        });
      `,
      },
      { reporter: '' }
    );
    expect(result.output).toContain("azure:pw:warn 'projectName' is not set. Reporting is disabled.");
    expect(result.exitCode).toBe(1);
    expect(result.failed).toBe(1);
  });

  test("'planId' in config expected", async ({ runInlineTest }) => {
    const result = await runInlineTest(
      {
        'playwright.config.ts': `
        module.exports = { 
          reporter: [
            ['line'],
            ['${reporterPath}', { 
              orgUrl: 'http://azure.devops.com',
              projectName: 'test',
            }]
          ]
        };
      `,
        'a.spec.js': `
        import { test, expect } from '@playwright/test';
        test('foobar', async ({}) => {
          expect(1).toBe(0);
        });
      `,
      },
      { reporter: '' }
    );
    expect(result.output).toContain("azure:pw:warn 'planId' is not set. Reporting is disabled.");
    expect(result.exitCode).toBe(1);
    expect(result.failed).toBe(1);
  });

  test("'token' in config expected", async ({ runInlineTest }) => {
    const result = await runInlineTest(
      {
        'playwright.config.ts': `
        module.exports = { 
          reporter: [
            ['line'],
            ['${reporterPath}', { 
              orgUrl: 'http://azure.devops.com',
              projectName: 'test',
              planId: 231
            }]
          ]
        };
      `,
        'a.spec.js': `
        import { test, expect } from '@playwright/test';
        test('foobar', async ({}) => {
          expect(1).toBe(0);
        });
      `,
      },
      { reporter: '' }
    );
    expect(result.output).toContain("azure:pw:warn 'token' is not set. Reporting is disabled.");
    expect(result.exitCode).toBe(1);
    expect(result.failed).toBe(1);
  });

  test('correct orgUrl config expected', async ({ runInlineTest }) => {
    const result = await runInlineTest(
      {
        'playwright.config.ts': `
        module.exports = { 
          reporter: [
            ['dot'],
            ['${reporterPath}', { 
              orgUrl: 'http://fake.azure.devops.com',
              projectName: 'test',
              planId: 231,
              token: 'token',
            }]
          ]
        };
      `,
        'a.spec.js': `
        import { test, expect } from '@playwright/test';
        test('foobar', async ({}) => {
          throw new Error('foobar')
        });
      `,
      },
      { reporter: '' },
      {
        AZUREPWDEBUG: '1',
      }
    );
    expect(result.output).toContain('"token": "*****"');
    expect(result.output).toContain('Failed to create test run. Check your orgUrl. Reporting is disabled.');
    expect(result.failed).toBe(1);
  });

  test('correct orgUrl config, incorrect token', async ({ runInlineTest, server }) => {
    server.setRoute('/_apis/Location', (_, res) => {
      setHeaders(res, headers);
      res.statusCode = 401;
      res.end('');
    });

    const result = await runInlineTest(
      {
        'playwright.config.ts': `
        module.exports = {
          reporter: [
            ['line'],
            ['${reporterPath}', {
              orgUrl: 'http://localhost:${server.PORT}',
              projectName: 'test',
              planId: 231,
              token: 'token',
            }]
          ]
        };
      `,
        'a.spec.js': `
        import { test, expect } from '@playwright/test';
        test('foobar', async ({}) => {
          expect(1).toBe(0);
        });
      `,
      },
      { reporter: '' }
    );
    expect(result.output).toContain(
      'azure:pw:error Failed to create test run. Check your token. Reporting is disabled.'
    );
    expect(result.exitCode).toBe(1);
    expect(result.failed).toBe(1);
  });

  test('incorrect project name', async ({ runInlineTest, server }) => {
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
      res.statusCode = 404;
      server.serveFile(req, res, PROJECT_INVALID_RESPONSE_PATH);
    });

    server.setRoute('/SampleSample/_apis/test/Runs', (req, res) => {
      setHeaders(res, headers);
      res.statusCode = 404;
      server.serveFile(req, res, CREATE_RUN_INVALID_RESPONSE_PATH);
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
    expect(result.output).toContain('azure:pw:error Project SampleSample does not exist. Reporting is disabled.');
    expect(result.output).not.toContain('azure:pw:log Using run');
    expect(result.output).not.toContain('azure:pw:log Start publishing:');
    expect(result.exitCode).toBe(1);
    expect(result.failed).toBe(1);
  });

  test('disabled reporter', async ({ runInlineTest, server }) => {
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
              isDisabled: true,
            }]
          ]
        };
      `,
        'a.spec.js': `
        import { test, expect } from '@playwright/test';
        test('[3] foobar', async () => {
          expect(1).toBe(1);
        });
        `,
      },
      { reporter: '' }
    );

    expect(result.output).not.toContain('Failed request: (401)');
    expect(result.output).not.toContain('azure:pw');
    expect(result.exitCode).toBe(0);
    expect(result.passed).toBe(1);
  });
});

let testCaseIdMatchers: {
  testCaseIdMatcher?: RegExp | RegExp[] | string | string[] | undefined;
  testTitle: string;
  tagsSection?: string;
  expected: string[];
}[] = [
  {
    testCaseIdMatcher: /@tag1=(\d+)/,
    testTitle: 'Test case @tag1=123',
    tagsSection: "['@tag1=7']",
    expected: ['123'],
  },
  {
    testCaseIdMatcher: /@TestCase=(\d+)/,
    testTitle: 'Test case @TestCase=123 [@TestCase=456]',
    tagsSection: "['@TestCase=7', '@TestCase=7']",
    expected: ['123', '456'],
  },
  {
    testCaseIdMatcher: [/[a-z]+(\d+)/, /[A-Z]+(\d+)/],
    testTitle: 'Test case test123 TEST456',
    tagsSection: "['@test7', '@TEST7']",
    expected: ['123', '456'],
  },
  {
    testCaseIdMatcher: ['@tag1=(\\d+)', '@tag2=(\\d+)'],
    testTitle: 'Test case @tag1=123 @tag2=456',
    tagsSection: "['@tag1=7', '@tag2=7']",
    expected: ['123', '456'],
  },
  {
    testCaseIdMatcher: undefined,
    testTitle: 'Test case [12345]',
    tagsSection: "['@[7]']",
    expected: ['12345'],
  },
];

testCaseIdMatchers.forEach((item) => {
  test(`_extractMatches should return ${item.expected} for ${item.testTitle}`, () => {
    const reporter = new AzureDevOpsReporter({
      orgUrl: 'http://localhost:4000',
      projectName: 'SampleSample',
      planId: 4,
      token: 'token',
      isDisabled: false,
      testCaseIdMatcher: item.testCaseIdMatcher,
    });

    const matches = (reporter as any)._extractMatches(item.testTitle);
    expect.soft(matches).toEqual(item.expected);
  });

  test(`match tags with own tags matcher for ${item.tagsSection}`, async ({ runInlineTest, server }) => {
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
      server.serveFile(req, res, PROJECT_INVALID_RESPONSE_PATH);
    });

    server.setRoute('/SampleSample/_apis/test/Runs', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, CREATE_RUN_VALID_RESPONSE_PATH);
    });

    server.setRoute('/SampleSample/_apis/test/Points', async (req, res) => {
      const body = await getRequestBody(req);
      setHeaders(res, headers);
      expect(body.pointsFilter?.testcaseIds[0]).toBeDefined();
      if (body.pointsFilter?.testcaseIds[0] === 3) server.serveFile(req, res, POINTS_3_VALID_RESPONSE_PATH);
      else if (body.pointsFilter?.testcaseIds[0] === 7) server.serveFile(req, res, POINTS_7_VALID_RESPONSE_PATH);
    });

    server.setRoute('/SampleSample/_apis/test/Runs/150/Results', async (req, res) => {
      const body = await getRequestBody(req);
      setHeaders(res, headers);
      expect(body[0].testPoint?.id).toBeDefined();
      if (body[0].testPoint?.id === '1') server.serveFile(req, res, TEST_RUN_RESULTS_3_VALID_RESPONSE_PATH);
      else if (body[0].testPoint?.id === '2') server.serveFile(req, res, TEST_RUN_RESULTS_7_VALID_RESPONSE_PATH);
    });

    server.setRoute('/SampleSample/_apis/test/Runs/150/Results/100001/Attachments', async (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, RUN_RESULTS_ATTACHMENTS_VALID_RESPONSE_PATH);
    });

    server.setRoute('/SampleSample/_apis/test/Runs/150', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, COMPLETE_RUN_VALID_RESPONSE_PATH);
    });

    const result = await runInlineTest(
      {
        'playwright.config.ts': `
        module.exports = { 
          use: {
            screenshot: 'only-on-failure',
            trace: 'retain-on-failure',
            video: 'retain-on-failure',
          },
          reporter: [
            ['dot'],
            ['${reporterPath}', { 
              orgUrl: 'http://localhost:${server.PORT}',
              projectName: 'SampleSample',
              planId: 4,
              token: 'token',
              uploadAttachments: true,
              logging: true,
              ${
                item.testCaseIdMatcher
                  ? `testCaseIdMatcher: ${
                      Array.isArray(item.testCaseIdMatcher)
                        ? `[${item.testCaseIdMatcher
                            .map((tag) => `${isRegExp(tag) ? tag.toString() : `'${tag.replace(/\\/g, '\\\\')}'`}`)
                            .join(',')}]`
                        : `[${item.testCaseIdMatcher}]`
                    }`
                  : ''
              } 
            }]
          ]
        };
      `,
        'a.spec.js': `
        import { test, expect } from '@playwright/test';
        test('[7] with screenshot', ${
          item.testCaseIdMatcher !== undefined ? `{ tag: ${item.tagsSection} }, ` : ''
        } async ({ page }) => {
          await page.goto('https://playwright.dev/')
          await page.locator('text=Get started').click()
          await expect(page).toHaveTitle(/Getting sttttarted/)
        });
      `,
      },
      { reporter: '' }
    );

    expect(result.output).not.toContain('Failed request: (401)');
    expect(result.output).toContain(
      "'attachmentsType' is not set. Attachments Type will be set to 'screenshot' by default."
    );
    expect(result.output).toMatch(/azure:pw:log Using run (\d.*) to publish test results/);
    expect(result.output).toContain(`azure:pw:log [7] with screenshot - failed`);
    expect(result.output).toContain('azure:pw:log Start publishing: [7] with screenshot');
    expect(result.output).toContain('azure:pw:log Uploading attachments for test: [7] with screenshot');
    expect(result.output).toContain('azure:pw:log Uploaded attachment');
    expect(result.output).toContain('azure:pw:log Result published: [7] with screenshot');
    expect(result.output).toMatch(/azure:pw:log Run (\d.*) - Completed/);
    expect(result.exitCode).toBe(1);
    expect(result.failed).toBe(1);
  });
});

testCaseIdMatchers = [
  {
    //@ts-ignore
    testCaseIdMatcher: [3432, 3944],
    testTitle: 'Test case [12345]',
    expected: ['12345'],
  },
];

testCaseIdMatchers.forEach((testCaseIdMatcher) => {
  test(`Test should throw an error for invalid testCaseIdMatcher: ${testCaseIdMatcher.testCaseIdMatcher}`, () => {
    try {
      new AzureDevOpsReporter({
        orgUrl: 'http://localhost:4000',
        projectName: 'SampleSample',
        planId: 4,
        token: 'token',
        isDisabled: false,
        testCaseIdMatcher: testCaseIdMatcher.testCaseIdMatcher,
      });
    } catch (error) {
      expect(error.message).toContain('Invalid testCaseIdMatcher. Must be a string or RegExp. Actual: 3432');
    }
  });
});
