/**
 * Association of a created test run with the Azure Pipelines build (and the classic release) it runs in,
 * taken from the predefined pipeline variables.
 *
 * Pure: the environment is passed in, nothing here reads `process.env` or makes a request.
 */
import type * as TestInterfaces from 'azure-devops-node-api/interfaces/TestInterfaces';

export interface PipelineAssociationOptions {
  /** `build` and `pipelineReference` (build id and definition id). */
  build: boolean;
  /** Stage, phase and job with their attempts, inside `pipelineReference`. Needs `build`. */
  job: boolean;
  /** `releaseUri` and `releaseEnvironmentUri` of a classic release. */
  release: boolean;
}

export type TPipelineAssociationOption =
  | boolean
  | {
      enabled?: boolean;
      build?: boolean;
      job?: boolean;
      release?: boolean;
    };

/** `undefined` when the association is off. */
export function parsePipelineAssociation(option: unknown): PipelineAssociationOptions | undefined {
  if (!option) return undefined;
  if (option === true) return { build: true, job: true, release: true };
  if (typeof option !== 'object') return undefined;
  const sub = option as Exclude<TPipelineAssociationOption, boolean>;
  if (!sub.enabled) return undefined;
  return { build: sub.build !== false, job: sub.job !== false, release: sub.release !== false };
}

interface NamedAttempt {
  name: string;
  attempt?: number;
}

export interface PipelineContext {
  buildId?: number;
  definitionId?: number;
  /** `System.TeamProject`: the project the pipeline runs in. */
  teamProject?: string;
  stage?: NamedAttempt;
  phase?: NamedAttempt;
  job?: NamedAttempt;
  releaseUri?: string;
  releaseEnvironmentUri?: string;
}

type Env = Record<string, string | undefined>;

function positiveInteger(value: string | undefined): number | undefined {
  if (!value || !/^\d+$/.test(value.trim())) return undefined;
  const parsed = Number(value.trim());
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function text(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function namedAttempt(name: string | undefined, attempt: string | undefined): NamedAttempt | undefined {
  const value = text(name);
  if (!value) return undefined;
  const parsedAttempt = positiveInteger(attempt);
  return parsedAttempt === undefined ? { name: value } : { name: value, attempt: parsedAttempt };
}

/**
 * The pipeline the process runs in, or `undefined` outside Azure Pipelines (`TF_BUILD` is not `True`) or when
 * there is neither a build nor a release to associate with. Values that are missing or not usable are left out.
 */
export function readPipelineContext(env: Env): PipelineContext | undefined {
  if (text(env.TF_BUILD)?.toLowerCase() !== 'true') return undefined;
  const context: PipelineContext = {
    buildId: positiveInteger(env.BUILD_BUILDID),
    definitionId: positiveInteger(env.SYSTEM_DEFINITIONID),
    teamProject: text(env.SYSTEM_TEAMPROJECT),
    stage: namedAttempt(env.SYSTEM_STAGENAME, env.SYSTEM_STAGEATTEMPT),
    phase: namedAttempt(env.SYSTEM_PHASENAME, env.SYSTEM_PHASEATTEMPT),
    job: namedAttempt(env.SYSTEM_JOBNAME, env.SYSTEM_JOBATTEMPT),
    releaseUri: text(env.RELEASE_RELEASEURI),
    releaseEnvironmentUri: text(env.RELEASE_ENVIRONMENTURI),
  };
  if (context.buildId === undefined && context.releaseUri === undefined) return undefined;
  return context;
}

export type PipelineAssociation = Pick<
  TestInterfaces.RunCreateModel,
  'build' | 'pipelineReference' | 'releaseUri' | 'releaseEnvironmentUri'
>;

/** The fields of the create request that associate the run, as far as the options and the context allow. */
export function buildPipelineAssociation(
  context: PipelineContext,
  options: PipelineAssociationOptions
): PipelineAssociation {
  const association: PipelineAssociation = {};
  if (options.build && context.buildId !== undefined) {
    association.build = { id: String(context.buildId) };
    const pipelineReference: TestInterfaces.PipelineReference = { pipelineId: context.buildId };
    if (context.definitionId !== undefined) pipelineReference.pipelineDefinitionId = context.definitionId;
    if (options.job) {
      if (context.stage)
        pipelineReference.stageReference = { stageName: context.stage.name, attempt: context.stage.attempt };
      if (context.phase)
        pipelineReference.phaseReference = { phaseName: context.phase.name, attempt: context.phase.attempt };
      if (context.job) pipelineReference.jobReference = { jobName: context.job.name, attempt: context.job.attempt };
    }
    association.pipelineReference = pipelineReference;
  }
  if (options.release) {
    if (context.releaseUri) association.releaseUri = context.releaseUri;
    if (context.releaseEnvironmentUri) association.releaseEnvironmentUri = context.releaseEnvironmentUri;
  }
  return removeUndefined(association);
}

function removeUndefined<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

/**
 * Adds the association to a create request without overwriting what the user set in `testRunConfig`:
 * a `build` or `buildReference` keeps the build out, a `pipelineReference` keeps the pipeline reference out,
 * and each release field is added only when it is not set.
 * `added` names the fields that were added; empty means the request is unchanged.
 */
export function mergePipelineAssociation(
  runModel: TestInterfaces.RunCreateModel,
  association: PipelineAssociation
): { model: TestInterfaces.RunCreateModel; added: Array<keyof PipelineAssociation> } {
  const model: TestInterfaces.RunCreateModel = { ...runModel };
  const added: Array<keyof PipelineAssociation> = [];
  if (association.build && !runModel.build && !runModel.buildReference) {
    model.build = association.build;
    added.push('build');
  }
  if (association.pipelineReference && !runModel.pipelineReference) {
    model.pipelineReference = association.pipelineReference;
    added.push('pipelineReference');
  }
  if (association.releaseUri && !runModel.releaseUri) {
    model.releaseUri = association.releaseUri;
    added.push('releaseUri');
  }
  if (association.releaseEnvironmentUri && !runModel.releaseEnvironmentUri) {
    model.releaseEnvironmentUri = association.releaseEnvironmentUri;
    added.push('releaseEnvironmentUri');
  }
  return { model, added };
}

/** `build 1234, stage Test (attempt 1), job e2e (attempt 2)`, for the log. */
export function describePipelineAssociation(association: PipelineAssociation): string {
  const parts: string[] = [];
  if (association.build?.id) parts.push(`build ${association.build.id}`);
  const reference = association.pipelineReference;
  const withAttempt = (label: string, name?: string, attempt?: number) =>
    name ? `${label} ${name}${attempt ? ` (attempt ${attempt})` : ''}` : undefined;
  for (const part of [
    withAttempt('stage', reference?.stageReference?.stageName, reference?.stageReference?.attempt),
    withAttempt('phase', reference?.phaseReference?.phaseName, reference?.phaseReference?.attempt),
    withAttempt('job', reference?.jobReference?.jobName, reference?.jobReference?.attempt),
  ]) {
    if (part) parts.push(part);
  }
  if (association.releaseUri) parts.push(`release ${association.releaseUri}`);
  return parts.join(', ');
}

/** The pipeline runs in another project than the one the results are published to (#56). */
export function isCrossProject(context: PipelineContext, projectName: string): boolean {
  return !!context.teamProject && context.teamProject.toLowerCase() !== projectName.trim().toLowerCase();
}
