import { reporterPath } from './reporterPath';
import { expect, test } from './test-fixtures';

test.describe('Reporter build', () => {
  test('check if reporter is built correctly', async ({ runInlineTest }) => {
    const result = await runInlineTest(
      {
        'playwright.config.ts': `
        import { AzureReporterOptions } from '${reporterPath}';
        
        module.exports = { 
          reporter: [
            ['line'],
            ['${reporterPath}', {
                logging: true,
              } as AzureReporterOptions,
            ]
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

    expect(result.output).toContain("azure: 'orgUrl' is not set. Reporting is disabled.");
    expect(result.exitCode).toBe(1);
    expect(result.failed).toBe(1);
  });
});
