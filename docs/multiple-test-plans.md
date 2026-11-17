# Multiple Test Plans

Publish the results of **one** Playwright run to **several** Azure DevOps test plans.

Back to the [README](../README.md).

> **One test run per plan.** A test run in Azure DevOps belongs to exactly one test plan. With several plans in `planId` the reporter creates **one test run for every selected plan that has test points of the executed tests**. Three plans with matching test points mean three test runs for one Playwright run. A selected plan without matching test points gets no run.

## When you need it

- **The same test case is in several plans.** For example a regression plan and a plan per release or sprint. Run the test once, update its test points in all of them.
- **The tests of one run belong to different plans.** For example `npx playwright test --only-changed` touches test cases of several plans. Each result goes to the plan its test case is in.

With a single plan nothing changes: `planId: 4` works exactly as before.

## Ways to set `planId`

| `planId`               | Publishes to                                                                                                   |
| ---------------------- | -------------------------------------------------------------------------------------------------------------- |
| `4`                    | Test plan 4, one test run. The behaviour of every previous version.                                            |
| `[4, 12, 15]`          | Each of the listed plans that has test points of the executed tests.                                           |
| `({ plans }) => [...]` | The plans the function returns. It gets all test plans of the project and is called once, when the run starts (`onBegin`). |

A list with one plan (`[4]`) is the same as `4`.

### A list in the config

```typescript
{
  planId: [4, 12, 15],
}
```

### A list from an environment variable

```typescript
{
  // AZURE_PLAN_IDS=4,12,15
  planId: process.env.AZURE_PLAN_IDS!.split(','),
}
```

Ids may be numbers or numeric strings. Anything else (`'abc'`, `0`, an empty list) disables reporting with a warning, so a typo is not silently ignored.

### A list from a file

`playwright.config.ts` is code, a file needs nothing special:

```typescript
import { readFileSync } from 'fs';

{
  // plans.json: [4, 12, 15]
  planId: JSON.parse(readFileSync('plans.json', 'utf8')),
}
```

### A function: let Azure DevOps tell which plans exist

A list has to be maintained by hand. When plans come and go, for example a new plan for every release, select them by their properties instead. The function gets every test plan of the project:

| Field                  | Type     | Description                                     |
| ---------------------- | -------- | ----------------------------------------------- |
| `id`                   | `number` | ID of the plan                                  |
| `name`                 | `string` | Name of the plan                                |
| `state`                | `string` | `Active` or `Inactive`                          |
| `iteration`            | `string` | Iteration path, for example `Project\Sprint 12` |
| `areaPath`             | `string` | Area path                                       |
| `startDate`, `endDate` | `Date`   | Dates of the plan, `undefined` when not set     |

The regression plan and every release plan that is running today:

```typescript
{
  planId: ({ plans }) => {
    const now = Date.now();
    return plans
      .filter(
        (plan) =>
          plan.id === 4 ||
          (plan.name.startsWith('Release ') &&
            plan.startDate !== undefined &&
            plan.endDate !== undefined &&
            plan.startDate.getTime() <= now &&
            now <= plan.endDate.getTime())
      )
      .map((plan) => plan.id);
  },
}
```

By name and state:

```typescript
{
  planId: ({ plans }) =>
    plans.filter((plan) => plan.state === 'Active' && /^(Regression|Release \d+)/.test(plan.name)).map((plan) => plan.id),
}
```

By iteration or area path:

```typescript
{
  planId: ({ plans }) =>
    plans.filter((plan) => plan.iteration === process.env.SPRINT_ITERATION || plan.areaPath === 'Project\\Checkout').map((plan) => plan.id),
}
```

The function may be `async`, to read the list from anywhere else:

```typescript
{
  planId: async () => (await fetch('https://example.com/active-plans.json')).json(),
}
```

Things to know about the function:

- It is called **once**, when the run starts. Playwright does not wait for reporters there, so the tests already run while the plans are loaded; results are published once the selection is known. In a short run the selection, and a message about a function that failed, can therefore appear in the log after the Playwright summary. The selected plans are written to the log: `Results are published to 2 test plan(s): 4 "Regression", 15 "Release 2.0".`
- Loading the plans is one extra request per run. It is made only when `planId` is a function.
- A function that throws, returns no plans, or returns something that is not a plan id disables reporting with a message. The tests still run.
- A function always uses the [variables for several plans](#run-ids-in-the-pipeline), also when it returns a single plan.
- **Old plans are your filter's job.** Azure DevOps accepts results for an `Inactive` plan (verified on a live organization), and plans are often never set to `Inactive`. Prefer a filter by dates, iteration or name over `state` alone, and check that the dates of your plans are maintained before you rely on them. The reporter warns when a selected plan is `Inactive`.

## How results are routed

1. The reporter asks Azure DevOps for the test points of the test case ids of a test. The answer contains the points of **all** plans of the project.
2. Points of plans that are not selected are dropped. `testRunConfig.configurationIds` and `testPointMapper` narrow the rest as usual.
3. The remaining points are split by plan. The result is published once for every plan, into the run of that plan.

The run of a plan is created when the first result for it is published. That is why a selected plan without matching test points gets no run, and why selecting many plans costs nothing by itself.

- A test whose test cases are in none of the selected plans is reported as `No test points found`, exactly as with one plan, and is listed in the [test case summary](../README.md#test-case-summary).
- `testPointMapper` gets the test points of **all selected plans** in one call. Every point has `testPlan.id`, so the mapper can keep a test out of one plan:

  ```typescript
  {
    planId: [4, 15],
    testPointMapper: async (testCase, testPoints) =>
      testCase.tags.includes('@release-only') ? testPoints.filter((point) => point.testPlan.id !== '4') : testPoints,
  }
  ```

- Inside one plan nothing changes: a test case that is in several suites of the same plan still has several test points there, and all of them get the result.
- Step results, attachments, logs and `autoMarkTestCasesAsAutomated` work as with one plan. A test case is a single work item, it is marked as automated once, not once per plan.
- Both `publishTestResultsMode: 'testResult'` and `'testRun'` are supported.

## Run names

The run of every plan gets the plan in its name: `Playwright Test Run (plan 4)`, `Playwright Test Run (plan 15)`. `testRunTitle`, `environment` and `testRunContext` apply to all of them.

## Run ids in the pipeline

`AZURE_PW_TEST_RUN_ID` holds one run id and is also read back by the reporter as `testRunId`, so it is **not set** for several plans. These are set instead, as environment variables of the Playwright process and as output variables of the pipeline step:

| Variable                        | Value                                               |
| ------------------------------- | --------------------------------------------------- |
| `AZURE_PW_TEST_RUN_IDS`         | JSON map of plan id to run id: `{"4":701,"15":702}` |
| `AZURE_PW_TEST_RUN_ID_<planId>` | Run id of one plan: `AZURE_PW_TEST_RUN_ID_4=701`    |

Only plans that got a run are listed. With a function the plan ids are not known in advance, use the JSON map then:

```yaml
- script: npx playwright test
  name: playwright

- script: echo '$(playwright.AZURE_PW_TEST_RUN_IDS)' | jq -r 'to_entries[] | "plan \(.key): run \(.value)"'
  displayName: 'Print test run ids'
```

## How many test runs to expect

**Test runs per Playwright run = selected plans that have test points of the executed tests.**

- A narrow selection keeps the list of runs readable: a regression plan and the current release are two runs, like a CI matrix with two entries, but the tests run once.
- A filter that matches every plan ever created turns one nightly run into dozens of test runs. The reporter logs the selected plans when it starts, and warns when more than 10 are selected.
- **Sharding multiplies the number.** A reporter in every shard creates its runs in every shard: 4 shards and 5 plans are up to 20 test runs. Run the reporter once, on the merged report, to get one run per plan. See [Sharded Runs](sharded-runs.md).
- Runs from pull requests or from a developer machine update all selected plans too. Enable the reporter only where results should be published, for example with `isDisabled: !process.env.CI`.

When the run ends, the log lists every run:

```
Test results published for 42 test(s), 61 test point(s) in 2 test plan(s)
Run 701 - Completed (test plan 4, 42 result(s))
Run 702 - Completed (test plan 15, 19 result(s))
```

## What is not supported with several plans

These options describe one run or one suite, which belong to one plan. Combined with several plans they disable reporting with a message:

| Option                                   | Why                                      |
| ---------------------------------------- | ---------------------------------------- |
| `isExistingTestRun` / `testRunId`        | An existing run belongs to one plan.     |
| `publishTestResultsMode: 'testRunADO'`   | Updates the results of one existing run. |
| `rootSuiteId` / `AZURE_PW_ROOT_SUITE_ID` | A suite belongs to one plan.             |

Use a single `planId` for these.

## When something fails

- **A run cannot be created for one plan** (for example no access to it): the error is logged, the results for that plan are not published, the other plans are published as usual.
- **Errors outside of tests** ([`publishGlobalErrors`](../README.md#errors-outside-of-tests)) are attached to the run of every plan. When nothing was published at all, for example `globalSetup` failed, a run is created in the **first** selected plan only to carry them.

## Why one run per plan

Azure DevOps rejects a result whose test point belongs to another plan than the run, together with every other result of the same request (`404 Test point ... not found`, verified on a live organization). Results for several plans therefore cannot share a run.
