import path from 'path';

export const reporterPath = path.join(__dirname, '../../dist/playwright-azure-reporter.js');
export const customReporterTestRunPath = path.join(__dirname, './assets/custom-reporter-testRun.ts');
export const customReporterTestResultPath = path.join(__dirname, './assets/custom-reporter-testResult.ts');
