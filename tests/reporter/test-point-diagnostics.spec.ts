import { diagnoseMissingTestPoints, DiagnosticPoint } from '../../src/test-point-diagnostics';
import { expect, test } from './test-fixtures';

const point = (id: number, plan: string, testCase: string, configuration: string, name?: string): DiagnosticPoint => ({
  id,
  testPlan: { id: plan },
  testCase: { id: testCase },
  configuration: { id: configuration, name },
});

const points = [
  point(1, '4', '3', '1', 'Windows 10'),
  point(2, '4', '3', '7', 'Chrome'),
  point(3, '9', '5', '1', 'Windows 10'),
  point(4, '11', '5', '1', 'Windows 10'),
];

test.describe('test point diagnostics', () => {
  test('a test case without any point', () => {
    const [diagnosis] = diagnoseMissingTestPoints({ testCaseIds: ['33'], planId: 4, points });
    expect(diagnosis.reason).toBe('no-points');
    expect(diagnosis.message).toBe(
      'test case 33 has no test point in any test plan of the project. Check the id and that the test case is added to a suite of plan 4.'
    );
  });

  test('points only in other plans, listed once each', () => {
    const [diagnosis] = diagnoseMissingTestPoints({ testCaseIds: ['5'], planId: 4, points });
    expect(diagnosis.reason).toBe('other-plans');
    expect(diagnosis.message).toContain('test case 5 has test points only in other plans: 9, 11 (planId is 4)');
  });

  test('points in the plan, but not under rootSuiteId', () => {
    const [diagnosis] = diagnoseMissingTestPoints({
      testCaseIds: ['3'],
      planId: 4,
      rootSuite: { id: 12, pointIds: new Set(['99']) },
      points,
    });
    expect(diagnosis.reason).toBe('outside-root-suite');
    expect(diagnosis.message).toBe('test case 3 has test points in plan 4, but none under rootSuiteId 12.');
  });

  test('points in the plan only for other configurations, with their names', () => {
    const [diagnosis] = diagnoseMissingTestPoints({ testCaseIds: ['3'], planId: 4, configurationIds: [14], points });
    expect(diagnosis.reason).toBe('other-configurations');
    expect(diagnosis.message).toContain(
      'test case 3 has test points in plan 4 only for configurations: 1 (Windows 10), 7 (Chrome); testRunConfig.configurationIds is [14].'
    );
  });

  test('matching points that testPointMapper dropped', () => {
    const [diagnosis] = diagnoseMissingTestPoints({ testCaseIds: ['3'], planId: 4, configurationIds: [7], points });
    expect(diagnosis.reason).toBe('mapper-returned-none');
    expect(diagnosis.message).toBe(
      'test case 3 has test points in plan 4 (configurations: 7 (Chrome)), but testPointMapper returned none of them.'
    );
  });

  test('a throwing testPointMapper is reported as such, without looking at points', () => {
    expect(
      diagnoseMissingTestPoints({
        testCaseIds: ['3'],
        planId: 4,
        points: [],
        mapperError: 'invalid test configuration!',
      })
    ).toEqual([{ reason: 'mapper-threw', message: 'testPointMapper threw: invalid test configuration!' }]);
  });

  test('one diagnosis per distinct test case id', () => {
    const diagnoses = diagnoseMissingTestPoints({ testCaseIds: ['33', '5', '33'], planId: 4, points });
    expect(diagnoses.map((d) => [d.testCaseId, d.reason])).toEqual([
      ['33', 'no-points'],
      ['5', 'other-plans'],
    ]);
  });

  test('a configuration without a name is listed by id', () => {
    const [diagnosis] = diagnoseMissingTestPoints({
      testCaseIds: ['8'],
      planId: 4,
      configurationIds: [2],
      points: [point(5, '4', '8', '3')],
    });
    expect(diagnosis.message).toContain('only for configurations: 3;');
  });
});
