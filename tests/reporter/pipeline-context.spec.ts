import {
  buildPipelineAssociation,
  describePipelineAssociation,
  isCrossProject,
  mergePipelineAssociation,
  parsePipelineAssociation,
  readPipelineContext,
} from '../../src/pipeline-context';
import { expect, test } from './test-fixtures';

/** The variables of a job in a YAML pipeline, as Azure Pipelines exposes them to scripts. */
const yamlPipeline = {
  TF_BUILD: 'True',
  BUILD_BUILDID: '1234',
  SYSTEM_DEFINITIONID: '56',
  SYSTEM_TEAMPROJECT: 'SampleSample',
  SYSTEM_STAGENAME: 'Test',
  SYSTEM_STAGEATTEMPT: '1',
  SYSTEM_PHASENAME: 'e2e',
  SYSTEM_PHASEATTEMPT: '2',
  SYSTEM_JOBNAME: '__default',
  SYSTEM_JOBATTEMPT: '2',
};

const all = { build: true, job: true, release: true };

test.describe('pipeline association: option', () => {
  test('off unless enabled', () => {
    for (const value of [undefined, false, null, 0, '', 'yes', {}, { enabled: false }, { build: true }]) {
      expect(parsePipelineAssociation(value)).toBeUndefined();
    }
  });

  test('true and { enabled: true } turn everything on, single parts can be switched off', () => {
    expect(parsePipelineAssociation(true)).toEqual(all);
    expect(parsePipelineAssociation({ enabled: true })).toEqual(all);
    expect(parsePipelineAssociation({ enabled: true, job: false, release: false })).toEqual({
      build: true,
      job: false,
      release: false,
    });
  });
});

test.describe('pipeline association: context', () => {
  test('outside Azure Pipelines there is no context', () => {
    expect(readPipelineContext({})).toBeUndefined();
    expect(readPipelineContext({ ...yamlPipeline, TF_BUILD: undefined })).toBeUndefined();
    expect(readPipelineContext({ ...yamlPipeline, TF_BUILD: 'False' })).toBeUndefined();
  });

  test('a pipeline without a build and without a release has nothing to associate with', () => {
    expect(readPipelineContext({ TF_BUILD: 'True', BUILD_BUILDID: 'abc' })).toBeUndefined();
  });

  test('a YAML pipeline job', () => {
    expect(readPipelineContext({ ...yamlPipeline, TF_BUILD: 'true' })).toEqual({
      buildId: 1234,
      definitionId: 56,
      teamProject: 'SampleSample',
      stage: { name: 'Test', attempt: 1 },
      phase: { name: 'e2e', attempt: 2 },
      job: { name: '__default', attempt: 2 },
      releaseUri: undefined,
      releaseEnvironmentUri: undefined,
    });
  });

  test('missing or unusable values are left out', () => {
    const context = readPipelineContext({
      TF_BUILD: 'True',
      BUILD_BUILDID: '1234',
      SYSTEM_DEFINITIONID: '0',
      SYSTEM_STAGENAME: '  ',
      SYSTEM_PHASENAME: 'e2e',
      SYSTEM_PHASEATTEMPT: 'x',
    });
    expect(context).toEqual({
      buildId: 1234,
      definitionId: undefined,
      teamProject: undefined,
      stage: undefined,
      phase: { name: 'e2e' },
      job: undefined,
      releaseUri: undefined,
      releaseEnvironmentUri: undefined,
    });
  });

  test('a classic release without a build artifact', () => {
    expect(
      readPipelineContext({
        TF_BUILD: 'True',
        RELEASE_RELEASEURI: 'vstfs:///ReleaseManagement/Release/7',
        RELEASE_ENVIRONMENTURI: 'vstfs:///ReleaseManagement/Environment/12',
      })
    ).toMatchObject({
      buildId: undefined,
      releaseUri: 'vstfs:///ReleaseManagement/Release/7',
      releaseEnvironmentUri: 'vstfs:///ReleaseManagement/Environment/12',
    });
  });

  test('cross-project: the pipeline runs in another project than the one results go to', () => {
    const context = readPipelineContext(yamlPipeline)!;
    expect(isCrossProject(context, 'SampleSample')).toBe(false);
    expect(isCrossProject(context, ' samplesample ')).toBe(false);
    expect(isCrossProject(context, 'Other')).toBe(true);
    expect(isCrossProject({ buildId: 1 }, 'Other')).toBe(false);
  });
});

test.describe('pipeline association: fields', () => {
  test('build, pipeline reference with stage, phase and job', () => {
    expect(buildPipelineAssociation(readPipelineContext(yamlPipeline)!, all)).toEqual({
      build: { id: '1234' },
      pipelineReference: {
        pipelineId: 1234,
        pipelineDefinitionId: 56,
        stageReference: { stageName: 'Test', attempt: 1 },
        phaseReference: { phaseName: 'e2e', attempt: 2 },
        jobReference: { jobName: '__default', attempt: 2 },
      },
    });
  });

  test('job: false keeps only the build in the pipeline reference', () => {
    expect(buildPipelineAssociation(readPipelineContext(yamlPipeline)!, { ...all, job: false })).toEqual({
      build: { id: '1234' },
      pipelineReference: { pipelineId: 1234, pipelineDefinitionId: 56 },
    });
  });

  test('a stage without an attempt has no attempt field', () => {
    const association = buildPipelineAssociation(
      readPipelineContext({ TF_BUILD: 'True', BUILD_BUILDID: '9', SYSTEM_STAGENAME: 'Test' })!,
      all
    );
    expect(association.pipelineReference).toEqual({ pipelineId: 9, stageReference: { stageName: 'Test' } });
  });

  test('build: false leaves the release only, release: false the build only', () => {
    const context = readPipelineContext({
      ...yamlPipeline,
      RELEASE_RELEASEURI: 'vstfs:///ReleaseManagement/Release/7',
      RELEASE_ENVIRONMENTURI: 'vstfs:///ReleaseManagement/Environment/12',
    })!;
    expect(buildPipelineAssociation(context, { ...all, build: false })).toEqual({
      releaseUri: 'vstfs:///ReleaseManagement/Release/7',
      releaseEnvironmentUri: 'vstfs:///ReleaseManagement/Environment/12',
    });
    expect(Object.keys(buildPipelineAssociation(context, { ...all, release: false }))).toEqual([
      'build',
      'pipelineReference',
    ]);
  });

  test('describes the association for the log', () => {
    expect(describePipelineAssociation(buildPipelineAssociation(readPipelineContext(yamlPipeline)!, all))).toBe(
      'build 1234, stage Test (attempt 1), phase e2e (attempt 2), job __default (attempt 2)'
    );
  });
});

test.describe('pipeline association: merge with testRunConfig', () => {
  const association = {
    build: { id: '1234' },
    pipelineReference: { pipelineId: 1234 },
    releaseUri: 'vstfs:///ReleaseManagement/Release/7',
    releaseEnvironmentUri: 'vstfs:///ReleaseManagement/Environment/12',
  };
  const base = { name: 'Run', automated: true, plan: { id: '4' }, configurationIds: [1] };

  test('fills what is missing', () => {
    const { model, added } = mergePipelineAssociation(base, association);
    expect(model).toEqual({ ...base, ...association });
    expect(added).toEqual(['build', 'pipelineReference', 'releaseUri', 'releaseEnvironmentUri']);
  });

  test('values set by the user always win', () => {
    const user = {
      ...base,
      buildReference: { id: 99 },
      pipelineReference: { pipelineId: 99 },
      releaseUri: 'mine',
    };
    const { model, added } = mergePipelineAssociation(user, association);
    expect(model).toEqual({ ...user, releaseEnvironmentUri: association.releaseEnvironmentUri });
    expect(added).toEqual(['releaseEnvironmentUri']);
    expect(mergePipelineAssociation({ ...base, build: { id: '99' } }, association).model.build).toEqual({ id: '99' });
  });

  test('the request given in is not changed', () => {
    const copy = JSON.parse(JSON.stringify(base));
    mergePipelineAssociation(base, association);
    expect(base).toEqual(copy);
  });

  test('nothing to add leaves the request as it was', () => {
    expect(mergePipelineAssociation(base, {})).toEqual({ model: base, added: [] });
  });
});
