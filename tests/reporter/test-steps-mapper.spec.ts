import { TestStep } from '@playwright/test/reporter';

import {
  buildIterationDetails,
  collectSteps,
  DEFAULT_TEST_STEPS_OPTIONS,
  findStepError,
  formatStepErrorMessage,
  hex8,
  MAX_STEP_ERROR_MESSAGE_LENGTH,
  numberSteps,
  parseWorkItemSteps,
  TestStepsMappingContext,
  WorkItemStep,
} from '../../src/test-steps';
import { expect, test } from './test-fixtures';

type StepInput = {
  title: string;
  category?: string;
  duration?: number;
  startTime?: Date;
  error?: { message?: string; stack?: string };
  steps?: StepInput[];
  subtitle?: string;
  params?: Record<string, unknown>;
};

const BASE_TIME = new Date('2026-10-09T10:00:00.000Z');

function makeStep(input: StepInput, index = 0): TestStep {
  return {
    title: input.title,
    category: input.category ?? 'test.step',
    duration: input.duration ?? 100,
    startTime: input.startTime ?? new Date(BASE_TIME.getTime() + index * 1000),
    error: input.error,
    steps: (input.steps ?? []).map((child, i) => makeStep(child, i)),
    titlePath: () => [input.title],
    subtitle: input.subtitle,
    params: input.params,
  } as unknown as TestStep;
}

const makeSteps = (inputs: StepInput[]): TestStep[] => inputs.map((s, i) => makeStep(s, i));

const context = (overrides: Partial<TestStepsMappingContext> = {}): TestStepsMappingContext => ({
  testOutcome: 'Passed',
  testDuration: 1234,
  ...overrides,
});

const workItemSteps = (...ids: number[]): WorkItemStep[] => ids.map((id) => ({ id, shared: false }));

test.describe('test-steps: hex8', () => {
  test('pads the hex id to 8 characters', () => {
    expect(hex8(2)).toBe('00000002');
    expect(hex8(16)).toBe('00000010');
    expect(hex8(255)).toBe('000000ff');
  });
});

test.describe('test-steps: parseWorkItemSteps', () => {
  test('returns ids of <step> elements in document order and ignores the <steps> root', () => {
    const xml =
      '<steps id="0" last="4"><step id="2" type="ValidateStep"><parameterizedString isformatted="true">a</parameterizedString></step>' +
      '<step id="3" type="ActionStep"></step><step id="4" type="ActionStep"/></steps>';
    expect(parseWorkItemSteps(xml)).toEqual(workItemSteps(2, 3, 4));
  });

  test('keeps non-sequential ids after steps were deleted or reordered', () => {
    const xml = '<steps id="0" last="7"><step id="2"/><step id="3"/><step id="5"/><step id="7"/></steps>';
    expect(parseWorkItemSteps(xml).map((s) => s.id)).toEqual([2, 3, 5, 7]);
  });

  test('marks <compref> shared step references', () => {
    const xml = '<steps id="0" last="4"><step id="2"/><compref id="3" ref="4242"/><step id="4"/></steps>';
    expect(parseWorkItemSteps(xml)).toEqual([
      { id: 2, shared: false },
      { id: 3, shared: true },
      { id: 4, shared: false },
    ]);
  });

  test('returns an empty list for missing or empty XML', () => {
    expect(parseWorkItemSteps(undefined)).toEqual([]);
    expect(parseWorkItemSteps(null)).toEqual([]);
    expect(parseWorkItemSteps('')).toEqual([]);
    expect(parseWorkItemSteps('<steps id="0" last="1"></steps>')).toEqual([]);
  });
});

test.describe('test-steps: collectSteps', () => {
  test('keeps only test.step steps by default', () => {
    const steps = makeSteps([
      { title: 'Before Hooks', category: 'hook' },
      { title: 'page.goto', category: 'pw:api' },
      { title: 'user step' },
      { title: 'expect.toBe', category: 'expect' },
    ]);
    expect(collectSteps(steps, DEFAULT_TEST_STEPS_OPTIONS).map((s) => s.title)).toEqual(['user step']);
  });

  test('honours custom categories', () => {
    const steps = makeSteps([
      { title: 'page.goto', category: 'pw:api' },
      { title: 'user step' },
      { title: 'expect.toBe', category: 'expect' },
    ]);
    const options = { ...DEFAULT_TEST_STEPS_OPTIONS, categories: ['test.step', 'pw:api'] };
    expect(collectSteps(steps, options).map((s) => s.title)).toEqual(['page.goto', 'user step']);
  });

  test('collects nested steps in pre-order up to maxDepth', () => {
    const steps = makeSteps([
      {
        title: 'outer',
        steps: [
          { title: 'inner', steps: [{ title: 'innermost' }] },
          { title: 'click', category: 'pw:api' },
        ],
      },
      { title: 'second' },
    ]);
    expect(collectSteps(steps, DEFAULT_TEST_STEPS_OPTIONS).map((s) => s.title)).toEqual(['outer', 'second']);
    expect(collectSteps(steps, { ...DEFAULT_TEST_STEPS_OPTIONS, maxDepth: 2 }).map((s) => s.title)).toEqual([
      'outer',
      'inner',
      'second',
    ]);
    expect(collectSteps(steps, { ...DEFAULT_TEST_STEPS_OPTIONS, maxDepth: 3 }).map((s) => s.title)).toEqual([
      'outer',
      'inner',
      'innermost',
      'second',
    ]);
  });
});

test.describe('test-steps: findStepError and formatStepErrorMessage', () => {
  test('returns the step error itself when present', () => {
    const step = makeStep({ title: 'failing', error: { message: 'own error' } });
    expect(findStepError(step)?.message).toBe('own error');
  });

  test('returns the first descendant error for a soft assertion inside a passing test.step', () => {
    const step = makeStep({
      title: 'soft',
      steps: [
        { title: 'expect.soft.toBe', category: 'expect' },
        { title: 'expect.soft.toBe', category: 'expect', error: { message: 'soft failure' } },
        { title: 'expect.soft.toBe', category: 'expect', error: { message: 'second soft failure' } },
      ],
    });
    expect(findStepError(step)?.message).toBe('soft failure');
  });

  test('returns undefined when nothing failed', () => {
    const step = makeStep({ title: 'ok', steps: [{ title: 'child', category: 'expect' }] });
    expect(findStepError(step)).toBeUndefined();
  });

  test('strips ANSI escape codes and truncates long messages', () => {
    expect(formatStepErrorMessage({ message: '\u001b[31mred\u001b[39m text' })).toBe('red text');
    const long = 'x'.repeat(MAX_STEP_ERROR_MESSAGE_LENGTH + 10);
    const formatted = formatStepErrorMessage({ message: long });
    expect(formatted.startsWith('x'.repeat(MAX_STEP_ERROR_MESSAGE_LENGTH))).toBe(true);
    expect(formatted.endsWith('[truncated]')).toBe(true);
    expect(formatted).not.toContain('x'.repeat(MAX_STEP_ERROR_MESSAGE_LENGTH + 1));
  });
});

test.describe('test-steps: numberSteps', () => {
  test('numbers steps positionally when titles carry no [N]', () => {
    const numbered = numberSteps(makeSteps([{ title: 'a' }, { title: 'b' }, { title: 'c' }]), /\[(\d+)\]/);
    expect(numbered.map((n) => n.stepNumber)).toEqual([1, 2, 3]);
  });

  test('explicit [N] wins and resets the counter', () => {
    const numbered = numberSteps(
      makeSteps([{ title: 'auto step' }, { title: '[3] tagged step' }, { title: 'auto after tag' }]),
      /\[(\d+)\]/
    );
    expect(numbered.map((n) => n.stepNumber)).toEqual([1, 3, 4]);
  });

  test('works with a global matcher and a custom pattern', () => {
    const numbered = numberSteps(makeSteps([{ title: 'step#7 login' }, { title: 'step#8 submit' }]), /step#(\d+)/g);
    expect(numbered.map((n) => n.stepNumber)).toEqual([7, 8]);
  });
});

test.describe('test-steps: buildIterationDetails without work item alignment', () => {
  test('returns undefined when the test has no publishable steps', () => {
    expect(buildIterationDetails([], DEFAULT_TEST_STEPS_OPTIONS, context())).toBeUndefined();
    const onlyApi = makeSteps([{ title: 'page.goto', category: 'pw:api' }]);
    expect(buildIterationDetails(onlyApi, DEFAULT_TEST_STEPS_OPTIONS, context())).toBeUndefined();
  });

  test('maps step N to id N + 1 with consistent actionPath and stepIdentifier', () => {
    const steps = makeSteps([{ title: '[1] first' }, { title: '[2] second' }, { title: 'third' }]);
    const result = buildIterationDetails(steps, DEFAULT_TEST_STEPS_OPTIONS, context());
    expect(result).toBeDefined();
    const actions = result!.iterationDetails.actionResults!;
    expect(actions.map((a) => [a.stepIdentifier, a.actionPath, a.outcome])).toEqual([
      ['2', '00000002', 'Passed'],
      ['3', '00000003', 'Passed'],
      ['4', '00000004', 'Passed'],
    ]);
    expect(actions.every((a) => a.iterationId === 1)).toBe(true);
    expect(result!.unmapped).toEqual([]);
  });

  test('iteration carries the test outcome and duration', () => {
    const steps = makeSteps([{ title: 'one' }]);
    const result = buildIterationDetails(
      steps,
      DEFAULT_TEST_STEPS_OPTIONS,
      context({ testOutcome: 'Failed', testDuration: 4321, iterationId: 2 })
    );
    expect(result!.iterationDetails.id).toBe(2);
    expect(result!.iterationDetails.outcome).toBe('Failed');
    expect(result!.iterationDetails.durationInMs).toBe(4321);
    expect(result!.iterationDetails.actionResults![0].iterationId).toBe(2);
    expect(result!.iterationDetails.parameters).toBeUndefined();
  });

  test('fills dates, duration and comment from the Playwright step', () => {
    const start = new Date('2026-10-09T12:00:00.000Z');
    const steps = makeSteps([{ title: 'Add to cart', subtitle: 'SKU 42', duration: 1500, startTime: start }]);
    const [action] = buildIterationDetails(steps, DEFAULT_TEST_STEPS_OPTIONS, context())!.iterationDetails
      .actionResults!;
    expect(action.startedDate).toEqual(start);
    expect(action.completedDate).toEqual(new Date(start.getTime() + 1500));
    expect(action.durationInMs).toBe(1500);
    expect(action.comment).toBe('Add to cart (SKU 42)');
    expect(action.errorMessage).toBeUndefined();
  });

  test('uses the plain title as comment when there is no subtitle', () => {
    const [action] = buildIterationDetails(makeSteps([{ title: 'Login' }]), DEFAULT_TEST_STEPS_OPTIONS, context())!
      .iterationDetails.actionResults!;
    expect(action.comment).toBe('Login');
  });

  test('marks a failed step and keeps later executed steps with their real outcome', () => {
    const steps = makeSteps([
      { title: 'passes' },
      { title: 'fails', error: { message: '\u001b[31mexpected 1 to be 0\u001b[39m' } },
      { title: 'runs after soft failure' },
    ]);
    const actions = buildIterationDetails(steps, DEFAULT_TEST_STEPS_OPTIONS, context())!.iterationDetails
      .actionResults!;
    expect(actions.map((a) => a.outcome)).toEqual(['Passed', 'Failed', 'Passed']);
    expect(actions[1].errorMessage).toBe('expected 1 to be 0');
  });

  test('a test.step with a failed soft assertion inside is reported as Failed', () => {
    const steps = makeSteps([
      {
        title: 'checks',
        steps: [{ title: 'expect.soft.toHaveText', category: 'expect', error: { message: 'text mismatch' } }],
      },
    ]);
    const [action] = buildIterationDetails(steps, DEFAULT_TEST_STEPS_OPTIONS, context())!.iterationDetails
      .actionResults!;
    expect(action.outcome).toBe('Failed');
    expect(action.errorMessage).toBe('text mismatch');
  });

  test('reports a duplicate explicit step number as unmapped and keeps the first', () => {
    const steps = makeSteps([{ title: '[2] first' }, { title: '[2] duplicate' }, { title: 'next' }]);
    const result = buildIterationDetails(steps, DEFAULT_TEST_STEPS_OPTIONS, context())!;
    expect(result.iterationDetails.actionResults!.map((a) => a.comment)).toEqual(['[2] first', 'next']);
    expect(result.unmapped).toEqual([
      { title: '[2] duplicate', stepNumber: 2, reason: 'step number 2 is used by another step' },
    ]);
  });

  test('exposes Playwright 1.63 step params as iteration parameters', () => {
    const steps = makeSteps([
      { title: 'checkout', params: { orderId: 42, user: 'admin', flags: { fast: true } } },
      { title: 'no params' },
    ]);
    const result = buildIterationDetails(steps, DEFAULT_TEST_STEPS_OPTIONS, context())!;
    expect(result.iterationDetails.parameters).toEqual([
      { actionPath: '00000002', stepIdentifier: '2', iterationId: 1, parameterName: 'orderId', value: '42' },
      { actionPath: '00000002', stepIdentifier: '2', iterationId: 1, parameterName: 'user', value: 'admin' },
      { actionPath: '00000002', stepIdentifier: '2', iterationId: 1, parameterName: 'flags', value: '{"fast":true}' },
    ]);
  });
});

test.describe('test-steps: buildIterationDetails aligned with the work item', () => {
  test('maps step numbers onto non-sequential work item ids', () => {
    const steps = makeSteps([{ title: 'one' }, { title: 'two' }, { title: 'three' }]);
    const result = buildIterationDetails(
      steps,
      DEFAULT_TEST_STEPS_OPTIONS,
      context({ workItemSteps: workItemSteps(2, 3, 7) })
    )!;
    expect(result.iterationDetails.actionResults!.map((a) => [a.stepIdentifier, a.actionPath])).toEqual([
      ['2', '00000002'],
      ['3', '00000003'],
      ['7', '00000007'],
    ]);
    expect(result.unmapped).toEqual([]);
  });

  test('reports work item steps after a failure as NotExecuted', () => {
    const steps = makeSteps([{ title: 'open page' }, { title: 'login', error: { message: 'wrong password' } }]);
    const result = buildIterationDetails(
      steps,
      DEFAULT_TEST_STEPS_OPTIONS,
      context({ testOutcome: 'Failed', workItemSteps: workItemSteps(2, 3, 4, 5) })
    )!;
    const actions = result.iterationDetails.actionResults!;
    expect(actions.map((a) => [a.stepIdentifier, a.outcome])).toEqual([
      ['2', 'Passed'],
      ['3', 'Failed'],
      ['4', 'NotExecuted'],
      ['5', 'NotExecuted'],
    ]);
    const skipped = actions[2];
    expect(skipped.errorMessage).toBe('Not executed: test stopped after step 2 failed ("login")');
    expect(skipped.durationInMs).toBe(0);
    expect(skipped.startedDate).toBeUndefined();
    expect(skipped.completedDate).toBeUndefined();
    expect(skipped.comment).toBeUndefined();
  });

  test('reports a work item step with no matching Playwright step as NotExecuted with a neutral message', () => {
    const steps = makeSteps([{ title: '[2] second only' }]);
    const result = buildIterationDetails(
      steps,
      DEFAULT_TEST_STEPS_OPTIONS,
      context({ workItemSteps: workItemSteps(2, 3) })
    )!;
    const actions = result.iterationDetails.actionResults!;
    expect(actions.map((a) => [a.stepIdentifier, a.outcome])).toEqual([
      ['2', 'NotExecuted'],
      ['3', 'Passed'],
    ]);
    expect(actions[0].errorMessage).toBe('Not executed: no matching test.step() in the Playwright test');
  });

  test('reports Playwright steps beyond the work item step count as unmapped', () => {
    const steps = makeSteps([{ title: 'one' }, { title: 'two' }, { title: 'three' }]);
    const result = buildIterationDetails(
      steps,
      DEFAULT_TEST_STEPS_OPTIONS,
      context({ workItemSteps: workItemSteps(2, 3) })
    )!;
    expect(result.iterationDetails.actionResults!.map((a) => a.stepIdentifier)).toEqual(['2', '3']);
    expect(result.unmapped).toEqual([{ title: 'three', stepNumber: 3, reason: 'test case has only 2 step(s)' }]);
  });

  test('skips shared steps with a reason and never reports them as NotExecuted', () => {
    const steps = makeSteps([{ title: 'one' }, { title: 'two' }, { title: 'three' }]);
    const result = buildIterationDetails(
      steps,
      DEFAULT_TEST_STEPS_OPTIONS,
      context({
        workItemSteps: [
          { id: 2, shared: false },
          { id: 3, shared: true },
          { id: 4, shared: false },
        ],
      })
    )!;
    expect(result.iterationDetails.actionResults!.map((a) => [a.stepIdentifier, a.outcome])).toEqual([
      ['2', 'Passed'],
      ['4', 'Passed'],
    ]);
    expect(result.unmapped).toEqual([{ title: 'two', stepNumber: 2, reason: 'shared steps are not supported' }]);
  });

  test('returns undefined when every Playwright step is unmapped', () => {
    const steps = makeSteps([{ title: 'shared only' }]);
    const result = buildIterationDetails(
      steps,
      DEFAULT_TEST_STEPS_OPTIONS,
      context({ workItemSteps: [{ id: 2, shared: true }] })
    );
    expect(result).toBeUndefined();
  });

  test('sorts action results by work item step id', () => {
    const steps = makeSteps([{ title: '[3] third' }, { title: '[1] first' }]);
    const result = buildIterationDetails(
      steps,
      DEFAULT_TEST_STEPS_OPTIONS,
      context({ workItemSteps: workItemSteps(2, 3, 4) })
    )!;
    expect(result.iterationDetails.actionResults!.map((a) => [a.stepIdentifier, a.outcome])).toEqual([
      ['2', 'Passed'],
      ['3', 'NotExecuted'],
      ['4', 'Passed'],
    ]);
  });
});
