import { isInactivePlan, normalizePlanIds, toTestPlanInfo } from '../../src/plan-selection';
import { expect, test } from './test-fixtures';

test.describe('plan selection: ids', () => {
  test('numbers and numeric strings become distinct ids in the given order', () => {
    expect(normalizePlanIds([7, '4', ' 12 ', 7, '4'])).toEqual({ ids: [7, 4, 12], invalid: [] });
  });

  test('a single value is a list of one', () => {
    expect(normalizePlanIds(5)).toEqual({ ids: [5], invalid: [] });
    expect(normalizePlanIds('5')).toEqual({ ids: [5], invalid: [] });
  });

  test('anything that is not a plan id is reported, not dropped', () => {
    expect(normalizePlanIds([4, 'abc', 0, -1, 1.5, '12abc', null, undefined, { id: 4 }, NaN])).toEqual({
      ids: [4],
      invalid: ['"abc"', '0', '-1', '1.5', '"12abc"', 'null', 'undefined', '{"id":4}', 'null'],
    });
  });

  test('an empty list has no ids', () => {
    expect(normalizePlanIds([])).toEqual({ ids: [], invalid: [] });
  });
});

test.describe('plan selection: plan info', () => {
  test('keeps the fields a filter needs and turns dates into Date', () => {
    const info = toTestPlanInfo({
      id: 32,
      name: 'Release 2.0',
      state: 'Active',
      iteration: 'Project\\Sprint 12',
      areaPath: 'Project\\Team',
      startDate: '2026-11-16T14:21:45.183Z',
      endDate: new Date('2026-11-23T14:21:45.183Z'),
    });
    expect(info).toEqual({
      id: 32,
      name: 'Release 2.0',
      state: 'Active',
      iteration: 'Project\\Sprint 12',
      areaPath: 'Project\\Team',
      startDate: new Date('2026-11-16T14:21:45.183Z'),
      endDate: new Date('2026-11-23T14:21:45.183Z'),
    });
  });

  test('missing or unreadable dates are undefined, a plan without an id is skipped', () => {
    expect(toTestPlanInfo({ id: 1, startDate: 'not a date' })).toEqual({
      id: 1,
      name: '',
      state: undefined,
      iteration: undefined,
      areaPath: undefined,
      startDate: undefined,
      endDate: undefined,
    });
    expect(toTestPlanInfo({ name: 'no id' })).toBeUndefined();
  });

  test('only a plan with a state other than Active is inactive', () => {
    expect(isInactivePlan({ id: 1, name: 'a', state: 'Inactive' })).toBe(true);
    expect(isInactivePlan({ id: 1, name: 'a', state: 'active' })).toBe(false);
    expect(isInactivePlan({ id: 1, name: 'a' })).toBe(false);
  });
});
