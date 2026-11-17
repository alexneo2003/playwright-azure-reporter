import path from 'path';

import { getRequestBody, setHeaders } from '../config/utils';
import azureAreas from './assets/azure-reporter/azureAreas';
import headers from './assets/azure-reporter/azureHeaders';
import location from './assets/azure-reporter/azureLocationOptionsResponse.json';
import { reporterPath } from './reporterPath';
import { expect, test } from './test-fixtures';

const asset = (name: string) => path.join(__dirname, 'assets', 'azure-reporter', name);

// eslint-disable-next-line @typescript-eslint/no-require-imports
const [major, minor] = (require('@playwright/test/package.json').version as string)
  .split('.')
  .map((n: string) => parseInt(n, 10));
const hasConfigTags = major > 1 || (major === 1 && minor >= 57);

/** The variables of a job in a YAML pipeline, as Azure Pipelines exposes them to scripts. */
const PIPELINE_ENV = {
  TF_BUILD: 'True',
  BUILD_BUILDID: '1234',
  SYSTEM_DEFINITIONID: '56',
  SYSTEM_TEAMPROJECT: 'SampleSample',
  SYSTEM_STAGENAME: 'Test',
  SYSTEM_STAGEATTEMPT: '1',
  SYSTEM_PHASENAME: 'e2e',
  SYSTEM_PHASEATTEMPT: '1',
  SYSTEM_JOBNAME: '__default',
  SYSTEM_JOBATTEMPT: '1',
};

const ASSOCIATION = {
  build: { id: '1234' },
  pipelineReference: {
    pipelineId: 1234,
    pipelineDefinitionId: 56,
    stageReference: { stageName: 'Test', attempt: 1 },
    phaseReference: { phaseName: 'e2e', attempt: 1 },
    jobReference: { jobName: '__default', attempt: 1 },
  },
};

type Calls = { creates: any[]; resultsPosted: number };

/** `reject` returns the Azure DevOps error message for a create request it refuses. */
function setupRoutes(server: any, reject?: (body: any) => string | undefined): Calls {
  const calls: Calls = { creates: [], resultsPosted: 0 };
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
  server.setRoute('/SampleSample/_apis/test/Runs', async (req: any, res: any) => {
    const body = await getRequestBody(req);
    calls.creates.push(body);
    const message = reject?.(body);
    setHeaders(res, headers);
    if (message) {
      res.statusCode = 400;
      res.end(JSON.stringify({ message, typeKey: 'InvalidPropertyException' }));
      return;
    }
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
    if (req.method === 'POST') calls.resultsPosted++;
    setHeaders(res, headers);
    server.serveFile(req, res, asset('testRunResults3ValidResponse.json'));
  });
  return calls;
}

const reporterConfig = (port: number, extra: string, config = '') => `
  module.exports = {
    ${config}
    reporter: [
      ['line'],
      ['${reporterPath}', {
        orgUrl: 'http://localhost:${port}',
        projectName: 'SampleSample',
        planId: 4,
        token: 'token',
        logging: true,
        ${extra}
      }]
    ]
  };
`;

const spec = `
  import { test, expect } from '@playwright/test';
  test('[3] foobar', async () => {
    expect(1).toBe(1);
  });
`;

const rejectBuild = (body: any) => (body.build ? 'Build 1234 cannot be found.' : undefined);

test.describe('pipelineAssociation', () => {
  test('off: the create request is the same inside and outside a pipeline', async ({ runInlineTest, server }) => {
    const calls = setupRoutes(server);
    const files = { 'playwright.config.ts': reporterConfig(server.PORT, ''), 'a.spec.js': spec };

    await runInlineTest(files, { reporter: '' });
    await runInlineTest(files, { reporter: '' }, PIPELINE_ENV);

    expect(calls.creates).toHaveLength(2);
    expect(calls.creates[1]).toEqual(calls.creates[0]);
    expect(calls.creates[0].build).toBeUndefined();
    expect(calls.creates[0].pipelineReference).toBeUndefined();
  });

  test('on outside a pipeline: the create request is unchanged', async ({ runInlineTest, server }) => {
    const calls = setupRoutes(server);

    await runInlineTest(
      { 'playwright.config.ts': reporterConfig(server.PORT, ''), 'a.spec.js': spec },
      { reporter: '' }
    );
    const result = await runInlineTest(
      { 'playwright.config.ts': reporterConfig(server.PORT, 'pipelineAssociation: true,'), 'a.spec.js': spec },
      { reporter: '' }
    );

    expect(calls.creates[1]).toEqual(calls.creates[0]);
    expect(result.output).not.toContain('Test runs are associated with');
  });

  for (const mode of ['testResult', 'testRun'] as const) {
    test(`${mode}: the run is associated with the build and the job`, async ({ runInlineTest, server }) => {
      const calls = setupRoutes(server);

      const result = await runInlineTest(
        {
          'playwright.config.ts': reporterConfig(
            server.PORT,
            `pipelineAssociation: true, publishTestResultsMode: '${mode}',`
          ),
          'a.spec.js': spec,
        },
        { reporter: '' },
        PIPELINE_ENV
      );

      expect(result.passed).toBe(1);
      expect(calls.creates).toHaveLength(1);
      expect(calls.creates[0]).toMatchObject({ ...ASSOCIATION, automated: true, plan: { id: '4' } });
      expect(calls.resultsPosted).toBe(1);
      expect(result.output).toContain(
        'Test runs are associated with build 1234, stage Test (attempt 1), phase e2e (attempt 1), job __default (attempt 1)'
      );
    });
  }

  test('parts can be switched off', async ({ runInlineTest, server }) => {
    const calls = setupRoutes(server);

    await runInlineTest(
      {
        'playwright.config.ts': reporterConfig(server.PORT, 'pipelineAssociation: { enabled: true, job: false },'),
        'a.spec.js': spec,
      },
      { reporter: '' },
      PIPELINE_ENV
    );

    expect(calls.creates[0].build).toEqual({ id: '1234' });
    expect(calls.creates[0].pipelineReference).toEqual({ pipelineId: 1234, pipelineDefinitionId: 56 });
  });

  test('a classic release is associated through its URIs', async ({ runInlineTest, server }) => {
    const calls = setupRoutes(server);

    await runInlineTest(
      { 'playwright.config.ts': reporterConfig(server.PORT, 'pipelineAssociation: true,'), 'a.spec.js': spec },
      { reporter: '' },
      {
        TF_BUILD: 'True',
        RELEASE_RELEASEURI: 'vstfs:///ReleaseManagement/Release/7',
        RELEASE_ENVIRONMENTURI: 'vstfs:///ReleaseManagement/Environment/12',
      }
    );

    expect(calls.creates[0]).toMatchObject({
      releaseUri: 'vstfs:///ReleaseManagement/Release/7',
      releaseEnvironmentUri: 'vstfs:///ReleaseManagement/Environment/12',
    });
    expect(calls.creates[0].build).toBeUndefined();
  });

  test('values from testRunConfig win', async ({ runInlineTest, server }) => {
    const calls = setupRoutes(server);

    await runInlineTest(
      {
        'playwright.config.ts': reporterConfig(
          server.PORT,
          "pipelineAssociation: true, testRunConfig: { configurationIds: [1], build: { id: '99' } },"
        ),
        'a.spec.js': spec,
      },
      { reporter: '' },
      PIPELINE_ENV
    );

    expect(calls.creates[0].build).toEqual({ id: '99' });
    expect(calls.creates[0].pipelineReference).toEqual(ASSOCIATION.pipelineReference);
  });

  test('a run that Azure DevOps rejects with the association is created without it', async ({
    runInlineTest,
    server,
  }) => {
    const calls = setupRoutes(server, rejectBuild);

    const result = await runInlineTest(
      { 'playwright.config.ts': reporterConfig(server.PORT, 'pipelineAssociation: true,'), 'a.spec.js': spec },
      { reporter: '' },
      PIPELINE_ENV
    );

    expect(result.passed).toBe(1);
    expect(calls.creates).toHaveLength(2);
    expect(calls.creates[0].build).toEqual({ id: '1234' });
    expect(calls.creates[1].build).toBeUndefined();
    expect(calls.creates[1].pipelineReference).toBeUndefined();
    expect(calls.resultsPosted).toBe(1);
    expect(result.output).toContain('Creating the test run associated with build 1234');
    expect(result.output).toContain('Build 1234 cannot be found.');
    expect(result.output).toContain('Retrying without the pipeline association.');
  });

  test('too many tags in testRunConfig: the run keeps the association, only the tags are dropped', async ({
    runInlineTest,
    server,
  }) => {
    // the answer of a live organization to 6 tags
    const calls = setupRoutes(server, (body) =>
      (body.tags?.length ?? 0) > 5
        ? `Number of tags ${body.tags.length} for this run are more than supported limit 5`
        : undefined
    );
    const tags = ['a', 'b', 'c', 'd', 'e', 'f'].map((name) => `{ name: 'tag${name}' }`).join(', ');

    const result = await runInlineTest(
      {
        'playwright.config.ts': reporterConfig(
          server.PORT,
          `pipelineAssociation: true, testRunConfig: { configurationIds: [1], tags: [${tags}] },`
        ),
        'a.spec.js': spec,
      },
      { reporter: '' },
      PIPELINE_ENV
    );

    expect(result.passed).toBe(1);
    expect(calls.creates).toHaveLength(2);
    expect(calls.creates[0].tags).toHaveLength(6);
    expect(calls.creates[1]).toMatchObject(ASSOCIATION);
    expect(calls.creates[1].tags).toBeUndefined();
    expect(result.output).toContain('testRunConfig.tags has 6 tags, Azure DevOps accepts at most 5 on a run.');
    expect(result.output).toContain('more than supported limit 5). Retrying without the tags of testRunConfig.');
  });

  test('a rejected build: first the tags of testRunConfig go, then the association', async ({
    runInlineTest,
    server,
  }) => {
    const calls = setupRoutes(server, rejectBuild);

    const result = await runInlineTest(
      {
        'playwright.config.ts': reporterConfig(
          server.PORT,
          "pipelineAssociation: true, testRunConfig: { configurationIds: [1], tags: [{ name: 'nightly' }] },"
        ),
        'a.spec.js': spec,
      },
      { reporter: '' },
      PIPELINE_ENV
    );

    expect(result.passed).toBe(1);
    expect(calls.creates).toHaveLength(3);
    expect(calls.creates[0]).toMatchObject({ build: { id: '1234' }, tags: [{ name: 'nightly' }] });
    expect(calls.creates[1]).toMatchObject({ build: { id: '1234' } });
    expect(calls.creates[1].tags).toBeUndefined();
    expect(calls.creates[2].build).toBeUndefined();
    expect(calls.creates[2].tags).toBeUndefined();
    expect(result.output).toContain('Retrying without the tags of testRunConfig.');
    expect(result.output).toContain('Retrying without the pipeline association.');
  });

  test('order of the retries: config tags first, then the association', async ({ runInlineTest, server }) => {
    test.skip(!hasConfigTags, 'FullConfig.tags needs Playwright 1.57');
    const calls = setupRoutes(server, rejectBuild);

    const result = await runInlineTest(
      {
        'playwright.config.ts': reporterConfig(
          server.PORT,
          'pipelineAssociation: true, testRunContext: true,',
          "tag: ['@smoke'],"
        ),
        'a.spec.js': spec,
      },
      { reporter: '' },
      PIPELINE_ENV
    );

    expect(result.passed).toBe(1);
    expect(calls.creates).toHaveLength(3);
    expect(calls.creates[0]).toMatchObject({ build: { id: '1234' }, tags: [{ name: 'smoke' }] });
    expect(calls.creates[1]).toMatchObject({ build: { id: '1234' } });
    expect(calls.creates[1].tags).toBeUndefined();
    expect(calls.creates[2].build).toBeUndefined();
    expect(result.output).toContain('Retrying without them.');
    expect(result.output).toContain('Retrying without the pipeline association.');
  });

  test('several plans: the run of every plan is associated', async ({ runInlineTest, server }) => {
    const calls = setupRoutes(server);

    await runInlineTest(
      {
        'playwright.config.ts': reporterConfig(server.PORT, 'pipelineAssociation: true,').replace(
          'planId: 4,',
          'planId: [4, 5],'
        ),
        'a.spec.js': spec,
      },
      { reporter: '' },
      PIPELINE_ENV
    );

    // the points mock has test case 3 in plan 4 only, so one run is created
    expect(calls.creates).toHaveLength(1);
    expect(calls.creates[0]).toMatchObject({ ...ASSOCIATION, plan: { id: '4' } });
  });

  test('the pipeline runs in another project: the runs are not associated', async ({ runInlineTest, server }) => {
    const calls = setupRoutes(server);

    const result = await runInlineTest(
      { 'playwright.config.ts': reporterConfig(server.PORT, 'pipelineAssociation: true,'), 'a.spec.js': spec },
      { reporter: '' },
      { ...PIPELINE_ENV, SYSTEM_TEAMPROJECT: 'Pipelines' }
    );

    expect(result.output).toContain(
      'The pipeline runs in project Pipelines, results are published to project SampleSample.'
    );
    expect(result.output).toContain('Azure DevOps does not associate a run with a build of another project');
    expect(result.output).not.toContain('Test runs are associated with');
    // no request that is known to fail
    expect(calls.creates).toHaveLength(1);
    expect(calls.creates[0].build).toBeUndefined();
    expect(calls.creates[0].pipelineReference).toBeUndefined();
  });

  test('an existing run is never modified', async ({ runInlineTest, server }) => {
    const calls = setupRoutes(server);

    await runInlineTest(
      {
        'playwright.config.ts': reporterConfig(
          server.PORT,
          'pipelineAssociation: true, isExistingTestRun: true, testRunId: 150,'
        ),
        'a.spec.js': spec,
      },
      { reporter: '' },
      PIPELINE_ENV
    );

    expect(calls.creates).toHaveLength(0);
    expect(calls.resultsPosted).toBe(1);
  });
});
