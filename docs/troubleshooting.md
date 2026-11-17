# Troubleshooting

The problems users run into most often, with what the log says and how to fix it.

Back to the [README](../README.md).

Before anything else, turn on the logs: `logging: true` in the reporter options, and `AZUREPWDEBUG=1` in the environment for the debug level. Enable `testCaseSummary` to get a list of every test that was not published, with the reason.

- [No test points found](#no-test-points-found)
- [Reporting is disabled, 401 or a failed test run](#reporting-is-disabled-401-or-a-failed-test-run)
- [User identity not found](#user-identity-not-found)
- [Attachments are not uploaded](#attachments-are-not-uploaded)
- [Results are in Test Plans but not in the pipeline Tests tab](#results-are-in-test-plans-but-not-in-the-pipeline-tests-tab)
- [planId from an environment variable](#planid-from-an-environment-variable)

## No test points found

A result is published to a **test point**: a test case in a suite of the test plan, for one configuration. When the reporter finds no point for a test, it logs a warning and names the reason for each test case id:

```
No test points found for test case [123] associated with test plan 4 for configurations [14]
Test "[123] Login works":
  - test case 123 has test points in plan 4 only for configurations: 1 (Windows 10), 7 (Chrome); testRunConfig.configurationIds is [14]. ...
```

| Reason in the log | What it means | Fix |
|---|---|---|
| `has no test point in any test plan of the project` | The id is wrong, the test case was deleted, or it is not added to any suite | Check the id in the test title, tag or annotation, and add the test case to a suite of the plan |
| `has test points only in other plans: 7, 9 (planId is 4)` | The test case is in other plans, not in `planId` | Add it to a suite of plan `planId`, or set `planId` to the plan you want |
| `has test points in plan 4, but none under rootSuiteId 5` | `rootSuiteId` limits the run to one suite tree and the test case is elsewhere in the plan | Move the test case under that suite, or change `rootSuiteId` |
| `only for configurations: 1 (Windows 10), 7 (Chrome); testRunConfig.configurationIds is [14]` | The test case has no point for the configurations you publish to | Assign one of your configurations to the test case in the plan, or change `testRunConfig.configurationIds` |
| `but testPointMapper returned none of them` | Your `testPointMapper` filtered every point out | Check the mapping, for example the `browserName` or `configuration.id` it compares |
| `testPointMapper threw: ...` | Your `testPointMapper` threw for this test. Only this test is skipped | Return `[]` for tests you do not want to publish instead of throwing |

To see the points of a test case in the Azure DevOps UI, open **Test Plans**, the plan, the suite, and the **Execute** tab: every row is a test point and shows its configuration. Configurations are assigned per test case in the suite, from the menu of the test case row (**Assign configuration**).

The reason is explained for the first 50 tests of a run without a point (it costs one extra request each). After that the warning keeps the short form. In `testRunADO` mode the warning keeps the short form, because points are matched against the results of the existing run.

## Reporting is disabled, 401 or a failed test run

- **`orgUrl`** is the organization URL only: `https://dev.azure.com/your-organization-name`. Do not add the project to it.
- **`projectName`** is the name of the project, not a URL. A URL here gives errors such as `A potentially dangerous Request.Path value was detected`.
- **Token:** a 401 means the token is missing, expired or has too few scopes. See [Required Token Scopes](../README.md#required-token-scopes). In a pipeline, a secret variable is not passed to scripts automatically: map it in `env:`.
- **`planId`** must be the id of a test plan in that project.

## User identity not found

This comes from `testRunConfig.owner`, for example an `owner.displayName` copied from an older example. Azure DevOps rejects an owner it cannot resolve. Remove `owner` from `testRunConfig` unless you need to set it, and then use an identity that exists in the organization.

## Attachments are not uploaded

- `uploadAttachments: true` must be set.
- `attachmentsType` matches the attachment **name**, by string or RegExp. The default is `['screenshot']`. Use `[/.*/]` to upload everything.
- Screenshots, videos and traces exist only when Playwright records them: set `screenshot`, `video` or `trace` in `use` of `playwright.config.ts`.
- Only attachments of the test result are seen: add your own files with `testInfo.attach(name, { path })` or `{ body }`.
- Logs (stdout and stderr) are a separate option: `uploadLogs: true`.

## Results are in Test Plans but not in the pipeline Tests tab

The reporter creates its own test run, and by default it is not linked to the pipeline. Turn on `pipelineAssociation` to associate the run with the build, the pipeline job and a classic release, see [Associate Runs with the Pipeline Build](../README.md#associate-runs-with-the-pipeline-build).

- The log says `Test runs are associated with build …` when the association is used. No such line: the reporter does not see the pipeline variables (`TF_BUILD`, `BUILD_BUILDID`), for example because the tests run in a container that does not get them.
- `The pipeline runs in project …, results are published to project …`: Azure DevOps does not associate a run with a build of another project, so the runs are created without it. Publish to the project of the pipeline to get the results into its Tests tab.
- `Creating the test run associated with build … failed (…). Retrying …`: Azure DevOps rejected the run, the line shows its error. `Number of tags 6 for this run are more than supported limit 5` means too many `testRunConfig.tags`: the run is then created without them, still associated.
- If you also publish a JUnit file with the `PublishTestResults` task, that creates a second, separate run. Remove it once the association is on.

## planId from an environment variable

`planId` accepts a number or a numeric string, so this works as is:

```typescript
planId: process.env.AZURE_PLAN_ID,
```

Surrounding whitespace is ignored. Anything that is not a positive integer, such as `'12abc'` or an empty string, disables reporting with a warning.
