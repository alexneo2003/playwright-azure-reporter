import { execFile } from 'child_process';
import * as fs from 'fs';
import path from 'path';
import { promisify } from 'util';

import { getRequestBody, setHeaders } from '../config/utils';
import azureAreas from './assets/azure-reporter/azureAreas';
import headers from './assets/azure-reporter/azureHeaders';
import location from './assets/azure-reporter/azureLocationOptionsResponse.json';
import { reporterPath } from './reporterPath';
import { expect, test } from './test-fixtures';

const run = promisify(execFile);
const asset = (name: string) => path.join(__dirname, 'assets', 'azure-reporter', name);
const playwrightCli = require.resolve('@playwright/test/cli');

type Calls = {
  runsCreated: number;
  results: Array<{ outcome: string }>;
  stepUpdates: number;
  runUpdates: any[];
  attachments: Array<{ fileName: string; text: string }>;
};

function setupRoutes(server: any): Calls {
  const calls: Calls = { runsCreated: 0, results: [], stepUpdates: 0, runUpdates: [], attachments: [] };
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
    calls.runsCreated++;
    setHeaders(res, headers);
    server.serveFile(req, res, asset('createRunValidResponse.json'));
  });
  server.setRoute('/SampleSample/_apis/test/Points', (req: any, res: any) => {
    setHeaders(res, headers);
    server.serveFile(req, res, asset('points3Response.json'));
  });
  server.setRoute('/SampleSample/_apis/test/Runs/150', async (req: any, res: any) => {
    if (req.method === 'PATCH') calls.runUpdates.push(await getRequestBody(req));
    setHeaders(res, headers);
    server.serveFile(req, res, asset('completeRunValidResponse.json'));
  });
  server.setRoute('/SampleSample/_apis/test/Runs/150/Results', async (req: any, res: any) => {
    const body = await getRequestBody(req);
    if (req.method === 'POST') calls.results.push(...body);
    else calls.stepUpdates += body.length;
    setHeaders(res, headers);
    server.serveFile(req, res, asset('testRunResults3ValidResponse.json'));
  });
  server.setRoute('/SampleSample/_apis/test/Runs/150/Results/100000/Attachments', async (req: any, res: any) => {
    const body = await getRequestBody(req);
    calls.attachments.push({ fileName: body.fileName, text: Buffer.from(body.stream, 'base64').toString('utf8') });
    setHeaders(res, headers);
    server.serveFile(req, res, asset('runResultsAttachmentsResponse.json'));
  });
  return calls;
}

const reporterEntry = (port: number) => `['${reporterPath}', {
  orgUrl: 'http://localhost:${port}',
  projectName: 'SampleSample',
  planId: 4,
  token: 'token',
  logging: true,
  uploadAttachments: true,
  attachmentsType: [/^note$/, /^file$/],
  publishTestSteps: { enabled: true, alignWithTestCase: false },
}]`;

const specs = {
  'a.spec.js': `
    const { test } = require('@playwright/test');
    test('[3] first', async ({}, testInfo) => {
      await test.step('[1] a step', async () => {});
      await testInfo.attach('note', { body: 'hello from shard one', contentType: 'text/plain' });
    });
  `,
  'b.spec.js': `
    const { test, expect } = require('@playwright/test');
    test('[3] second', async ({}, testInfo) => {
      const file = testInfo.outputPath('log.txt');
      require('fs').writeFileSync(file, 'file from shard two');
      await testInfo.attach('file', { path: file, contentType: 'text/plain' });
      expect(1).toBe(2);
    });
  `,
};

function cleanEnv(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, FORCE_COLOR: '0', ...extra };
  for (const key of Object.keys(env)) if (key.startsWith('AZURE_PW_')) delete env[key];
  return env;
}

function writeProject(dir: string, files: Record<string, string>) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), '{ "name": "test-project" }');
  for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), content);
}

async function playwright(cwd: string, args: string[], env: NodeJS.ProcessEnv = {}) {
  try {
    const { stdout, stderr } = await run(process.execPath, [playwrightCli, ...args], { cwd, env: cleanEnv(env) });
    return { exitCode: 0, output: stdout + stderr };
  } catch (error: any) {
    return { exitCode: error.code as number, output: String(error.stdout) + String(error.stderr) };
  }
}

test.describe('sharded runs: merge-reports', () => {
  test('two shards merged and replayed to the reporter make one test run', async ({ server }, testInfo) => {
    const calls = setupRoutes(server);
    const dir = testInfo.outputPath('project');
    writeProject(dir, {
      ...specs,
      'playwright.config.js': "module.exports = { testDir: '.', testMatch: '*.spec.js', reporter: [['blob']] };",
      'merge.config.js': `module.exports = { reporter: [${reporterEntry(server.PORT)}] };`,
    });

    const all = path.join(dir, 'all-blob-reports');
    fs.mkdirSync(all);
    for (const shard of [1, 2]) {
      const blobs = path.join(dir, 'blobs', String(shard));
      await playwright(dir, ['test', `--shard=${shard}/2`], { PLAYWRIGHT_BLOB_OUTPUT_DIR: blobs });
      for (const file of fs.readdirSync(blobs)) fs.copyFileSync(path.join(blobs, file), path.join(all, file));
    }
    expect(fs.readdirSync(all)).toHaveLength(2);
    // the shards use the blob reporter: nothing reaches Azure DevOps yet
    expect(calls.runsCreated).toBe(0);

    const merged = await playwright(dir, ['merge-reports', '--config', 'merge.config.js', 'all-blob-reports']);

    // merge-reports reports reporter failures through its exit code, not failed tests
    expect(merged.exitCode).toBe(0);
    expect(calls.runsCreated).toBe(1);
    expect(calls.results.map((r) => r.outcome).sort()).toEqual(['Failed', 'Passed']);
    expect(calls.stepUpdates).toBeGreaterThanOrEqual(1);
    expect(calls.runUpdates).toEqual([{ state: 'Completed' }]);
    expect(merged.output).toContain('Test results published for 2 test(s)');
    // attachments of both shards are uploaded while merge-reports still has them unpacked
    expect(calls.attachments.map((a) => a.text).sort()).toEqual(['file from shard two', 'hello from shard one']);
  });

  test('without merge-reports every shard creates its own run', async ({ server }, testInfo) => {
    const calls = setupRoutes(server);
    const dir = testInfo.outputPath('project');
    writeProject(dir, {
      ...specs,
      'playwright.config.js': `module.exports = { testDir: '.', testMatch: '*.spec.js', reporter: [${reporterEntry(server.PORT)}] };`,
    });

    for (const shard of [1, 2]) await playwright(dir, ['test', `--shard=${shard}/2`]);

    expect(calls.runsCreated).toBe(2);
  });
});
