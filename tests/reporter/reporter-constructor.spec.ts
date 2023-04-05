import { expect, stripAnsi, test } from "./test-fixtures";
import path from 'path';

const reporterPath = path.join(__dirname, '../../src/playwright-azure-reporter.ts')

test.describe("Reporter constructor", () => {
  test("'orgUrl' in config expected", async ({ runInlineTest }) => {
    const result = await runInlineTest({
      'playwright.config.ts': `
        import path from 'path';
        module.exports = { 
          reporter: [
            ['list'],
            ['${reporterPath}']
          ]
        };
      `,
      'a.spec.js': `
        import { test, expect } from '@playwright/test';
        test('foobar', async () => {
          expect(1).toBe(0);
        });
      `
    }, { reporter: '' });
    
    expect(stripAnsi(result.output)).toContain("azure: 'orgUrl' is not set. Reporting is disabled.");
    expect(result.exitCode).toBe(1);
    expect(result.failed).toBe(1);
  });

  test("'projectName' in config expected", async ({ runInlineTest }) => {
    const result = await runInlineTest({
      'playwright.config.ts': `
        module.exports = { 
          reporter: [
            ['list'],
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
      `
    }, { reporter: '' });
    expect(stripAnsi(result.output)).toContain("azure: 'projectName' is not set. Reporting is disabled.");
    expect(result.exitCode).toBe(1);
    expect(result.failed).toBe(1);
  });

  test("'planId' in config expected", async ({ runInlineTest }) => {
    const result = await runInlineTest({
      'playwright.config.ts': `
        module.exports = { 
          reporter: [
            ['list'],
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
      `
    }, { reporter: '' });
    expect(stripAnsi(result.output)).toContain("azure: 'planId' is not set. Reporting is disabled.");
    expect(result.exitCode).toBe(1);
    expect(result.failed).toBe(1);
  });

  test("'token' in config expected", async ({ runInlineTest }) => {
    const result = await runInlineTest({
      'playwright.config.ts': `
        module.exports = { 
          reporter: [
            ['list'],
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
      `
    }, { reporter: '' });
    expect(stripAnsi(result.output)).toContain("azure: 'token' is not set. Reporting is disabled.");
    expect(result.exitCode).toBe(1);
    expect(result.failed).toBe(1);
  });

  test('correct orgUrl config expected', async ({ runInlineTest }) => {
    const result = await runInlineTest({
      'playwright.config.ts': `
        module.exports = { 
          reporter: [
            ['list'],
            ['${reporterPath}', { 
              orgUrl: 'http://azure.devops.com',
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
      `
    }, { reporter: '' });
    expect(stripAnsi(result.output)).toContain('Failed to create test run. Check your orgUrl. Reporting is disabled.');
    expect(result.exitCode).toBe(1);
    expect(result.failed).toBe(1);
  });
});