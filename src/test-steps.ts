import { TestStep } from '@playwright/test/reporter';
import * as TestInterfaces from 'azure-devops-node-api/interfaces/TestInterfaces';

import { stripAnsi } from './utils';

/**
 * Pure helpers that turn Playwright `TestStep`s into Azure DevOps step results
 * (`TestIterationDetailsModel.actionResults`). No I/O happens here: the reporter
 * fetches work item data and publishes, this module only maps.
 *
 * Azure DevOps identifies a test case step by its numeric `id` from the
 * `Microsoft.VSTS.TCM.Steps` XML. Ids start at 2 (1 is the `<steps>` root) and
 * are not guaranteed to be sequential once steps were deleted or reordered.
 * A step result references that id twice: as `stepIdentifier` (decimal) and as
 * `actionPath` (8-digit zero-padded hex).
 */

export type TStepOutcome = 'Passed' | 'Failed' | 'NotExecuted';

export interface TestStepsMappingOptions {
  /** Playwright step categories that are published. Default: `['test.step']`. */
  categories: string[];
  /** Extracts an explicit step number from the step title; group 1 must be the number. Default: `/\[(\d+)\]/`. */
  testStepIdMatcher: RegExp;
  /** How deep nested steps are collected. 1 = top-level steps only. */
  maxDepth: number;
}

export const DEFAULT_TEST_STEPS_OPTIONS: TestStepsMappingOptions = {
  categories: ['test.step'],
  testStepIdMatcher: /\[(\d+)\]/,
  maxDepth: 1,
};

/** A step of the Azure DevOps test case work item, in document order. */
export interface WorkItemStep {
  id: number;
  /** `true` for a `<compref>` element, i.e. a reference to a Shared Steps work item. */
  shared: boolean;
}

export interface TestStepsMappingContext {
  /** Azure DevOps iteration id. Default: 1. */
  iterationId?: number;
  /** Outcome of the whole test result, already mapped to the Azure DevOps vocabulary. */
  testOutcome: string;
  /** Duration of the whole test result in ms. */
  testDuration: number;
  /**
   * Steps of the test case work item. When present, Playwright step numbers are mapped onto these
   * ids and work item steps without a matching Playwright step are reported as `NotExecuted`.
   * When absent, step number N maps to id N + 1.
   */
  workItemSteps?: WorkItemStep[];
}

export interface UnmappedStep {
  title: string;
  stepNumber: number;
  reason: string;
}

export interface TestStepsMappingResult {
  iterationDetails: TestInterfaces.TestIterationDetailsModel;
  /** Playwright steps that could not be attached to a work item step. */
  unmapped: UnmappedStep[];
}

export const MAX_STEP_ERROR_MESSAGE_LENGTH = 4000;

export const hex8 = (id: number): string => id.toString(16).padStart(8, '0');

/**
 * Parses the `Microsoft.VSTS.TCM.Steps` field of a test case work item.
 * Returns the direct children of `<steps>` in document order: `<step>` elements and
 * `<compref>` shared step references.
 */
export function parseWorkItemSteps(xml: string | undefined | null): WorkItemStep[] {
  if (!xml) return [];
  const result: WorkItemStep[] = [];
  const elementRe = /<(step|compref)\b([^>]*)>/g;
  for (const match of xml.matchAll(elementRe)) {
    const idMatch = /\bid\s*=\s*"(\d+)"/.exec(match[2]);
    if (!idMatch) continue;
    result.push({ id: parseInt(idMatch[1], 10), shared: match[1] === 'compref' });
  }
  return result;
}

/** Playwright 1.63+ step fields, read through duck typing so older versions keep working. */
interface TestStepExtras {
  subtitle?: string;
  params?: Record<string, unknown>;
}

const stepExtras = (step: TestStep): TestStepExtras => step as unknown as TestStepExtras;

/**
 * Collects the steps to publish: steps whose category matches, down to `maxDepth` levels, in pre-order.
 */
export function collectSteps(steps: TestStep[], options: TestStepsMappingOptions): TestStep[] {
  const result: TestStep[] = [];
  const visit = (list: TestStep[], depth: number) => {
    for (const step of list) {
      if (options.categories.includes(step.category)) result.push(step);
      if (depth < options.maxDepth && step.steps?.length) visit(step.steps, depth + 1);
    }
  };
  visit(steps, 1);
  return result;
}

/**
 * Finds the error that fails a step: its own error, or the first error of a descendant.
 * Soft assertions (`expect.soft`) do not throw, so the `test.step` itself has no error while
 * the nested `expect` step does.
 */
export function findStepError(step: TestStep): TestStep['error'] | undefined {
  if (step.error) return step.error;
  for (const child of step.steps ?? []) {
    const error = findStepError(child);
    if (error) return error;
  }
  return undefined;
}

export function formatStepErrorMessage(error: NonNullable<TestStep['error']>): string {
  const message = stripAnsi(error.message ?? error.value ?? '') ?? '';
  if (message.length <= MAX_STEP_ERROR_MESSAGE_LENGTH) return message;
  return `${message.slice(0, MAX_STEP_ERROR_MESSAGE_LENGTH)}\n... [truncated]`;
}

const stepLabel = (step: TestStep): string => {
  const { subtitle } = stepExtras(step);
  return subtitle ? `${step.title} (${subtitle})` : step.title;
};

const stringifyParam = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (value === undefined) return '';
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

interface NumberedStep {
  step: TestStep;
  stepNumber: number;
}

/**
 * Assigns a 1-based step number to every collected step: an explicit `[N]` in the title wins,
 * otherwise the next number after the previous step is used.
 */
export function numberSteps(steps: TestStep[], matcher: RegExp): NumberedStep[] {
  const re = new RegExp(matcher.source, matcher.flags.replace('g', ''));
  let counter = 1;
  return steps.map((step) => {
    const match = re.exec(step.title);
    const explicit = match && match[1] ? parseInt(match[1], 10) : NaN;
    const stepNumber = Number.isInteger(explicit) && explicit > 0 ? explicit : counter;
    counter = stepNumber + 1;
    return { step, stepNumber };
  });
}

/**
 * Builds the Azure DevOps iteration with one action result per Playwright step.
 * Returns `undefined` when there is nothing to publish.
 */
export function buildIterationDetails(
  steps: TestStep[],
  options: TestStepsMappingOptions,
  context: TestStepsMappingContext
): TestStepsMappingResult | undefined {
  const collected = collectSteps(steps, options);
  if (collected.length === 0) return undefined;

  const iterationId = context.iterationId ?? 1;
  const unmapped: UnmappedStep[] = [];
  const actionResults: TestInterfaces.TestActionResultModel[] = [];
  const parameters: TestInterfaces.TestResultParameterModel[] = [];
  const usedNumbers = new Set<number>();
  const coveredWorkItemIds = new Set<number>();
  let firstFailure: { stepNumber: number; title: string } | undefined;

  for (const { step, stepNumber } of numberSteps(collected, options.testStepIdMatcher)) {
    if (usedNumbers.has(stepNumber)) {
      unmapped.push({ title: step.title, stepNumber, reason: `step number ${stepNumber} is used by another step` });
      continue;
    }
    usedNumbers.add(stepNumber);

    let id: number;
    if (context.workItemSteps) {
      const workItemStep = context.workItemSteps[stepNumber - 1];
      if (!workItemStep) {
        unmapped.push({
          title: step.title,
          stepNumber,
          reason: `test case has only ${context.workItemSteps.length} step(s)`,
        });
        continue;
      }
      if (workItemStep.shared) {
        unmapped.push({ title: step.title, stepNumber, reason: 'shared steps are not supported' });
        continue;
      }
      id = workItemStep.id;
      coveredWorkItemIds.add(id);
    } else {
      id = stepNumber + 1;
    }

    const error = findStepError(step);
    const outcome: TStepOutcome = error ? 'Failed' : 'Passed';
    if (error && !firstFailure) firstFailure = { stepNumber, title: step.title };

    const startedDate = step.startTime;
    const completedDate = new Date(step.startTime.getTime() + step.duration);
    actionResults.push({
      actionPath: hex8(id),
      stepIdentifier: String(id),
      iterationId,
      outcome,
      comment: stepLabel(step),
      errorMessage: error ? formatStepErrorMessage(error) : undefined,
      durationInMs: step.duration,
      startedDate,
      completedDate,
    });

    const { params } = stepExtras(step);
    if (params && typeof params === 'object') {
      for (const [parameterName, value] of Object.entries(params)) {
        parameters.push({
          actionPath: hex8(id),
          stepIdentifier: String(id),
          iterationId,
          parameterName,
          value: stringifyParam(value),
        });
      }
    }
  }

  if (context.workItemSteps) {
    context.workItemSteps.forEach((workItemStep, index) => {
      if (workItemStep.shared || coveredWorkItemIds.has(workItemStep.id)) return;
      const stepNumber = index + 1;
      const errorMessage =
        firstFailure && stepNumber > firstFailure.stepNumber
          ? `Not executed: test stopped after step ${firstFailure.stepNumber} failed ("${firstFailure.title}")`
          : 'Not executed: no matching test.step() in the Playwright test';
      actionResults.push({
        actionPath: hex8(workItemStep.id),
        stepIdentifier: String(workItemStep.id),
        iterationId,
        outcome: 'NotExecuted',
        errorMessage,
        durationInMs: 0,
      });
    });
  }

  if (actionResults.length === 0) return undefined;

  actionResults.sort((a, b) => parseInt(a.stepIdentifier!, 10) - parseInt(b.stepIdentifier!, 10));

  const iterationDetails: TestInterfaces.TestIterationDetailsModel = {
    id: iterationId,
    outcome: context.testOutcome,
    durationInMs: context.testDuration,
    actionResults,
  };
  if (parameters.length > 0) iterationDetails.parameters = parameters;

  return { iterationDetails, unmapped };
}
