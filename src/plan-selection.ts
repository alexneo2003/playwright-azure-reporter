import { parsePlanId } from './utils';

/** What the `planId` function gets for every test plan of the project. */
export interface AzureTestPlanInfo {
  id: number;
  name: string;
  /** `Active` or `Inactive`. Azure DevOps accepts results for inactive plans too. */
  state?: string;
  iteration?: string;
  areaPath?: string;
  startDate?: Date;
  endDate?: Date;
}

export type TPlanIdList = Array<number | string>;

/**
 * Selects the test plans to publish to. Called once, when the run starts, with all test plans of the project.
 * The tests may already run meanwhile; results are published once the selection is known.
 */
export type TPlanIdSelector = (context: { plans: AzureTestPlanInfo[] }) => TPlanIdList | Promise<TPlanIdList>;

export type TPlanIdOption = number | string | TPlanIdList | TPlanIdSelector;

/** More selected plans than this is usually a filter that is too wide. */
export const MANY_PLANS_THRESHOLD = 10;

/**
 * Turns a list of plan ids into distinct positive integers, keeping the order.
 * Anything that is not a plan id is returned in `invalid`, so a typo is reported instead of ignored.
 */
export function normalizePlanIds(value: unknown): { ids: number[]; invalid: string[] } {
  const result: { ids: number[]; invalid: string[] } = { ids: [], invalid: [] };
  const items = Array.isArray(value) ? value : [value];
  for (const item of items) {
    const id = parsePlanId(item);
    if (id === undefined) {
      result.invalid.push(describe(item));
    } else if (!result.ids.includes(id)) {
      result.ids.push(id);
    }
  }
  return result;
}

function describe(item: unknown): string {
  if (typeof item === 'string') return `"${item}"`;
  try {
    return JSON.stringify(item) ?? String(item);
  } catch {
    return String(item);
  }
}

type RawTestPlan = {
  id?: number;
  name?: string;
  state?: string;
  iteration?: string;
  areaPath?: string;
  startDate?: Date | string;
  endDate?: Date | string;
};

/** Keeps only the fields a plan filter needs, so the callback does not depend on the shape of the REST response. */
export function toTestPlanInfo(plan: RawTestPlan): AzureTestPlanInfo | undefined {
  if (typeof plan?.id !== 'number') return undefined;
  return {
    id: plan.id,
    name: plan.name ?? '',
    state: plan.state,
    iteration: plan.iteration,
    areaPath: plan.areaPath,
    startDate: toDate(plan.startDate),
    endDate: toDate(plan.endDate),
  };
}

function toDate(value: Date | string | undefined): Date | undefined {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return isNaN(date.getTime()) ? undefined : date;
}

export function isInactivePlan(plan: AzureTestPlanInfo): boolean {
  return !!plan.state && plan.state.toLowerCase() !== 'active';
}
