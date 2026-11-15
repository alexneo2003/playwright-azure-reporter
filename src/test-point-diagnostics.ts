/**
 * Explains why a test with test case ids ended up with no test point to publish its result to.
 *
 * Pure: the caller fetches the points of the test cases (in every plan, without the configuration filter)
 * and passes them in. Used only on the failure path, so a run where every test has a point makes no
 * extra request.
 */

export type MissingPointReason =
  | 'no-points'
  | 'other-plans'
  | 'outside-root-suite'
  | 'other-configurations'
  | 'mapper-returned-none'
  | 'mapper-threw';

export interface DiagnosticPoint {
  id?: number | string;
  testPlan?: { id?: string; name?: string };
  testCase?: { id?: string };
  configuration?: { id?: string; name?: string };
}

export interface MissingPointInput {
  testCaseIds: string[];
  planId: number;
  /** `testRunConfig.configurationIds`, when set. */
  configurationIds?: number[];
  /** `rootSuiteId` and the ids of the points under it, when set. */
  rootSuite?: { id: number; pointIds: Set<string> };
  /** The points of the test cases in every plan of the project. */
  points: DiagnosticPoint[];
  /** Message of the exception thrown by `testPointMapper` for this test. */
  mapperError?: string;
}

export interface MissingPointDiagnosis {
  testCaseId?: string;
  reason: MissingPointReason;
  message: string;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function describeConfigurations(points: DiagnosticPoint[]): string {
  const configurations = new Map<string, string | undefined>();
  for (const point of points) {
    const id = point.configuration?.id;
    if (id && !configurations.has(id)) configurations.set(id, point.configuration?.name);
  }
  return [...configurations.entries()].map(([id, name]) => (name ? `${id} (${name})` : id)).join(', ');
}

export function diagnoseMissingTestPoints(input: MissingPointInput): MissingPointDiagnosis[] {
  if (input.mapperError !== undefined) {
    return [{ reason: 'mapper-threw', message: `testPointMapper threw: ${input.mapperError}` }];
  }

  const plan = String(input.planId);
  return unique(input.testCaseIds).map((testCaseId): MissingPointDiagnosis => {
    const own = input.points.filter((point) => String(point.testCase?.id) === testCaseId);
    if (own.length === 0) {
      return {
        testCaseId,
        reason: 'no-points',
        message: `test case ${testCaseId} has no test point in any test plan of the project. Check the id and that the test case is added to a suite of plan ${plan}.`,
      };
    }

    const inPlan = own.filter((point) => String(point.testPlan?.id) === plan);
    if (inPlan.length === 0) {
      const plans = unique(own.map((point) => String(point.testPlan?.id)).filter((id) => id !== 'undefined'));
      return {
        testCaseId,
        reason: 'other-plans',
        message: `test case ${testCaseId} has test points only in other plans: ${plans.join(', ')} (planId is ${plan}). Add it to a suite of plan ${plan} or change planId.`,
      };
    }

    let candidates = inPlan;
    if (input.rootSuite) {
      candidates = inPlan.filter((point) => input.rootSuite!.pointIds.has(String(point.id)));
      if (candidates.length === 0) {
        return {
          testCaseId,
          reason: 'outside-root-suite',
          message: `test case ${testCaseId} has test points in plan ${plan}, but none under rootSuiteId ${input.rootSuite.id}.`,
        };
      }
    }

    if (input.configurationIds?.length) {
      const wanted = new Set(input.configurationIds.map(String));
      const matching = candidates.filter((point) => wanted.has(String(point.configuration?.id)));
      if (matching.length === 0) {
        return {
          testCaseId,
          reason: 'other-configurations',
          message: `test case ${testCaseId} has test points in plan ${plan} only for configurations: ${describeConfigurations(candidates)}; testRunConfig.configurationIds is [${input.configurationIds.join(', ')}]. Assign one of these configurations to the test case in plan ${plan} or change configurationIds.`,
        };
      }
      candidates = matching;
    }

    return {
      testCaseId,
      reason: 'mapper-returned-none',
      message: `test case ${testCaseId} has test points in plan ${plan} (configurations: ${describeConfigurations(candidates)}), but testPointMapper returned none of them.`,
    };
  });
}
