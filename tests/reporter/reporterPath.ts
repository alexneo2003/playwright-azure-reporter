import path from 'path';

export const reporterPath = path.resolve(__dirname, '../../dist/playwright-azure-reporter.js').replace(/\\/g, '/');
export const customReporterTestRunPath = path
  .resolve(__dirname, './assets/custom-reporter-testRun.ts')
  .replace(/\\/g, '/');
export const customReporterTestResultPath = path
  .resolve(__dirname, './assets/custom-reporter-testResult.ts')
  .replace(/\\/g, '/');
