import path from 'path';

import { getRequestBody, setHeaders } from '../config/utils';
import azureAreas from './assets/azure-reporter/azureAreas';
import headers from './assets/azure-reporter/azureHeaders';
import location from './assets/azure-reporter/azureLocationOptionsResponse.json';
import { reporterPath } from './reporterPath';
import { expect, test } from './test-fixtures';

const asset = (name: string) => path.join(__dirname, 'assets', 'azure-reporter', name);

function setupRoutes(server: any) {
  const uploads: Array<{ fileName: string; text: string }> = [];
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
    server.serveFile(req, res, asset('azureTestOptionsResponse.json'));
  });
  server.setRoute('/_apis/core', (req: any, res: any) => {
    setHeaders(res, headers);
    server.serveFile(req, res, asset('azureCoreOptionsResponse.json'));
  });
  server.setRoute('/_apis/projects/SampleSample', (req: any, res: any) => {
    setHeaders(res, headers);
    server.serveFile(req, res, asset('projectValidResponse.json'));
  });
  server.setRoute('/SampleSample/_apis/test/Runs', (req: any, res: any) => {
    setHeaders(res, headers);
    server.serveFile(req, res, asset('createRunValidResponse.json'));
  });
  server.setRoute('/SampleSample/_apis/test/Points', (req: any, res: any) => {
    setHeaders(res, headers);
    server.serveFile(req, res, asset('points3Response.json'));
  });
  server.setRoute('/SampleSample/_apis/test/Runs/150', (req: any, res: any) => {
    setHeaders(res, headers);
    server.serveFile(req, res, asset('completeRunValidResponse.json'));
  });
  server.setRoute('/SampleSample/_apis/test/Runs/150/Results', (req: any, res: any) => {
    setHeaders(res, headers);
    server.serveFile(req, res, asset('testRunResults3ValidResponse.json'));
  });
  server.setRoute('/SampleSample/_apis/test/Runs/150/Results/100000/Attachments', async (req: any, res: any) => {
    const body = await getRequestBody(req);
    uploads.push({ fileName: body.fileName, text: Buffer.from(body.stream, 'base64').toString('utf8') });
    setHeaders(res, headers);
    server.serveFile(req, res, asset('runResultsAttachmentsResponse.json'));
  });
  return uploads;
}

const reporterConfig = (port: number, attachmentsType: string) => `
  module.exports = {
    reporter: [
      ['line'],
      ['${reporterPath}', {
        orgUrl: 'http://localhost:${port}',
        projectName: 'SampleSample',
        planId: 4,
        token: 'token',
        logging: true,
        uploadAttachments: true,
        ${attachmentsType}
      }]
    ]
  };
`;

const spec = `
  import { test, expect } from '@playwright/test';
  import * as fs from 'fs';
  test('[3] foobar', async ({}, testInfo) => {
    const file = testInfo.outputPath('error-context.md');
    fs.writeFileSync(file, '# Page snapshot\\n- button "Save"');
    await testInfo.attach('error-context', { path: file, contentType: 'text/markdown' });
    await testInfo.attach('error-context', { body: '# From a body', contentType: 'text/markdown' });
    await testInfo.attach('notes', { body: 'not uploaded', contentType: 'text/plain' });
  });
`;

test.describe('error-context attachments', () => {
  test("attachmentsType: ['error-context'] uploads the Markdown file with the .md extension", async ({
    runInlineTest,
    server,
  }) => {
    const uploads = setupRoutes(server);

    const result = await runInlineTest(
      {
        'playwright.config.ts': reporterConfig(server.PORT, "attachmentsType: ['error-context'],"),
        'a.spec.js': spec,
      },
      { reporter: '' }
    );

    expect(result.exitCode).toBe(0);
    expect(uploads).toHaveLength(2);
    for (const upload of uploads) expect(upload.fileName).toMatch(/^error_context_[0-9a-f]{32}\.md$/);
    expect(uploads.map((u) => u.text).sort()).toEqual(['# From a body', '# Page snapshot\n- button "Save"']);
  });

  test('error-context is not uploaded by default', async ({ runInlineTest, server }) => {
    const uploads = setupRoutes(server);

    const result = await runInlineTest(
      { 'playwright.config.ts': reporterConfig(server.PORT, ''), 'a.spec.js': spec },
      { reporter: '' }
    );

    expect(result.exitCode).toBe(0);
    expect(uploads).toEqual([]);
  });
});
