# Sharded Runs

Publish the results of a sharded Playwright run (`--shard=1/4` ... `--shard=4/4`) as **one** Azure DevOps test run.

Back to the [README](../README.md).

## How it works

Every shard is a separate Playwright process. If each of them loads this reporter, each creates its own test run. To get **one** test run for the whole suite, let the shards write Playwright blob reports and run the reporter once, on the merged result.

1. In the jobs that run the tests, use the `blob` reporter and **not** this reporter:

```typescript
// playwright.config.ts
export default defineConfig({
  reporter: process.env.CI ? 'blob' : 'list',
});
```

2. Put this reporter in a separate config that is used only for merging. It needs the `reporter` entry and nothing else, no `testDir` or `projects`:

```typescript
// merge.config.ts
export default {
  reporter: [
    [
      '@alex_neo/playwright-azure-reporter',
      {
        orgUrl: 'https://dev.azure.com/your-organization-name',
        projectName: 'your-project',
        planId: 4,
        token: process.env.AZURE_TOKEN,
        testRunTitle: 'Playwright Test Run',
        publishTestSteps: true,
      },
    ],
  ],
};
```

3. After all shards have finished, collect the `blob-report/*.zip` files of every shard into one folder and merge them:

```bash
npx playwright merge-reports --config=merge.config.ts ./all-blob-reports
```

`merge-reports` does not run any tests. It replays the recorded results of all shards, in one process, to the reporters of the merge config. The reporter sees every test, step, attachment and retry exactly as if the suite had run in one process, so it creates one test run, publishes all results and completes it.

## Azure Pipelines

```yaml
jobs:
  - job: test
    strategy:
      parallel: 4
    steps:
      - script: npx playwright test --shard=$(System.JobPositionInPhase)/$(System.TotalJobsInPhase)
      - publish: blob-report
        artifact: blob-report-$(System.JobPositionInPhase)
        condition: succeededOrFailed()

  - job: report
    dependsOn: test
    condition: succeededOrFailed()
    steps:
      - download: current
      - script: |
          mkdir all-blob-reports
          cp $(Pipeline.Workspace)/blob-report-*/*.zip all-blob-reports/
          npx playwright merge-reports --config=merge.config.ts ./all-blob-reports
        env:
          AZURE_TOKEN: $(AZURE_TOKEN)
```

## GitHub Actions

```yaml
jobs:
  test:
    strategy:
      fail-fast: false
      matrix:
        shard: [1, 2, 3, 4]
    steps:
      - run: npx playwright test --shard=${{ matrix.shard }}/4
      - uses: actions/upload-artifact@v4
        if: ${{ !cancelled() }}
        with:
          name: blob-report-${{ matrix.shard }}
          path: blob-report
          retention-days: 1

  report:
    needs: test
    if: ${{ !cancelled() }}
    steps:
      - uses: actions/download-artifact@v4
        with:
          path: all-blob-reports
          pattern: blob-report-*
          merge-multiple: true
      - run: npx playwright merge-reports --config=merge.config.ts ./all-blob-reports
        env:
          AZURE_TOKEN: ${{ secrets.AZURE_TOKEN }}
```

## Things to know


- Run the merge job even when a shard failed (`succeededOrFailed()` / `!cancelled()`), otherwise failures never reach Azure DevOps. A shard that crashed before it wrote its blob report is missing from the run.
- Nothing is published while the shards run. Results appear when the merge job runs.
- The exit code of `merge-reports` does not tell whether tests failed: it is non-zero only when a reporter fails, and `0` when the replayed tests failed (verified). Let the shard jobs fail the pipeline, the merge job only publishes the results.
- The config of the merged run has no shard, so `testRunContext.shardInTitle` adds nothing. Use `testRunTitle` (and `environment`) to name the run.
- Attachments (screenshots, video, trace) are unpacked to a temporary folder for the duration of the command and are uploaded while it runs, so `uploadAttachments` works as usual.
- All other options (`publishTestResultsMode`, `testRunConfig`, `testPointMapper`, `publishRetryResults`, and so on) behave as in a normal run.
