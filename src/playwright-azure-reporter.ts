/* eslint-disable no-control-regex */
import * as Test from 'azure-devops-node-api/TestApi'
import * as TestInterfaces from 'azure-devops-node-api/interfaces/TestInterfaces'
import * as azdev from 'azure-devops-node-api'

import { Reporter, TestCase, TestResult } from '@playwright/test/reporter'

import { TestPoint } from 'azure-devops-node-api/interfaces/TestInterfaces'
import { WebApi } from 'azure-devops-node-api'
import chalk from 'chalk'
import { readFileSync } from 'fs'

const Statuses = {
  passed: 'Passed',
  failed: 'Failed',
  skipped: 'Paused',
  timedOut: 'Failed'
}

export interface AzureOptions {
  token: string;
  planId: number;
  orgUrl: string;
  connection: WebApi;
  projectName: string;
  runId?: string;
  logging?: boolean;
  isDisabled?: boolean;
  environment?: string | undefined;
  testRunTitle: string;
  uploadAttachments?: boolean;
}

interface TestResultsToTestRun {
  statusCode: number;
  result: Result;
  headers: Headers;
}
interface Result {
  count: number;
  value?: ValueEntity[] | null;
}
interface ValueEntity {
  id: number;
  project: Project;
  outcome: string;
  testRun: TestRun;
  priority: number;
  url: string;
  lastUpdatedBy: LastUpdatedBy;
}
// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface Project {
}
interface TestRun {
  id: string;
}
interface LastUpdatedBy {
  displayName?: null;
  id?: null;
}
interface Headers {
  'cache-control': string;
  'pragma': string;
  'content-length': string;
  'content-type': string;
  'expires': string;
  'p3p': string;
  'x-tfs-processid': string;
  'strict-transport-security': string;
  'activityid': string;
  'x-tfs-session': string;
  'x-vss-e2eid': string;
  'x-vss-senderdeploymentid': string;
  'x-vss-userdata': string;
  'x-frame-options': string;
  'request-context': string;
  'access-control-expose-headers': string;
  'x-content-type-options': string;
  'x-cache': string;
  'x-msedge-ref': string;
  'date': string;
  'connection': string;
}

const alwaysUndefined = () => undefined

class PlaywrightReporter implements Reporter {
  private testApi!: Test.ITestApi;
  private options: AzureOptions;
  private planId: number | string;
  private runId?: number;
  private isDisabled = false;
  private publishedResultsCount = 0;
  private resultsToBePublished: string[] = [];
  private orgUrl: string;
  private connection: WebApi;
  private projectName: string;
  private environment: string | undefined;
  private logging = true;
  private testRunTitle: string;

  public constructor (_options: AzureOptions) {
    this.options = _options
    this.orgUrl = _options.orgUrl
    this.projectName = _options.projectName
    this.environment = _options.environment || undefined
    this.planId = _options.planId
    this.logging = _options.logging || true
    this.isDisabled = _options.isDisabled || false
    this.testRunTitle = `${this.environment ? `[${this.environment}]:` : ''} ${_options.testRunTitle || 'Playwright Test Run'}` ||
                        `${this.environment ? `[${this.environment}]:` : ''}Test plan ${this.planId}`
    this.connection = new azdev.WebApi(this.orgUrl, azdev.getPersonalAccessTokenHandler(this.options.token))
    this.options.uploadAttachments = _options.uploadAttachments || false

    if (!this.orgUrl) {
      this.log(chalk`{yellow 'orgUrl' is not set. Reporting is disabled.}`)
      this.isDisabled = true
      return
    }
    if (!this.projectName || !this.planId) {
      this.log(chalk`{yellow 'projectName' is not set. Reporting is disabled.}`)
      this.isDisabled = true
      return
    }
    if (!this.planId) {
      this.log(chalk`{yellow 'planId' is not set. Reporting is disabled.}`)
      this.isDisabled = true
      return
    }
    if (!this.options.token) {
      this.log(chalk`{yellow 'token' is not set. Reporting is disabled.}`)
      this.isDisabled = true
    }
  }

  public async onBegin (): Promise<void> {
    if (this.isDisabled) {
      return
    }
    this.testApi = await this.connection.getTestApi()

    return this.createRun(this.testRunTitle, (created) => {
      if (created) {
        this.runId = created.id
        this.log(chalk`{green Using run ${this.runId} to publish test results}`)
      } else {
        this.log(chalk`{red Could not create run in project ${this.options.projectName}}`)
        this.isDisabled = true
      }
    })
  }

  public async onTestEnd (test: TestCase, testResult: TestResult): Promise<void> {
    if (this.isDisabled) {
      return
    }

    return this.publishCaseResult(test, testResult).then(alwaysUndefined)
  }

  public async onEnd (): Promise<void> {
    if (this.isDisabled) {
      return
    }

    let prevCount = this.resultsToBePublished.length
    while (this.resultsToBePublished.length > 0) {
      // need wait all results to be published
      if (prevCount > this.resultsToBePublished.length) {
        this.log(
          chalk`{gray Waiting for all results to be published. Remaining ${this.resultsToBePublished.length} results}`
        )
        prevCount--
      }
      await new Promise((resolve) => setTimeout(resolve, 250))
    }

		if (this.publishedResultsCount === 0 && !this.runId) {
      this.log('No testcases were matched. Ensure that your tests are declared correctly.')
      return
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const runUpdate: TestInterfaces.RunUpdateModel = {
        state: 'Completed'
      }
      const runUpdated = await this.testApi.updateTestRun(runUpdate, this.projectName, this.runId as number)
      this.log(chalk`{green Run ${this.runId} - ${runUpdated.state}}`)
    } catch (err) {
      this.log(`Error on completing run ${err as string}`)
    }
  }

  private log (message?: any) {
    if (this.logging) {
      // eslint-disable-next-line no-console
      console.log(chalk`{bold {magenta azure:} ${message}}`)
    }
  }

  private getCaseIds (test: TestCase): string {
    const regexp = /\[([\d,]+)\]/
    const results = regexp.exec(test.title)
    if (results && results.length === 2) {
      return results[1]
    }
    return ''
  }

  private logTestItem (test: TestCase, testResult: TestResult) {
    const map = {
      failed: chalk`{red Test ${test.title} ${testResult.status}}`,
      passed: chalk`{green Test ${test.title} ${testResult.status}}`,
      skipped: chalk`{blueBright Test ${test.title} ${testResult.status}}`,
      pending: chalk`{blueBright Test ${test.title} ${testResult.status}}`,
      disabled: chalk`{gray Test ${test.title} ${testResult.status}}`,
      timedOut: chalk`{gray Test ${test.title} ${testResult.status}}`
    }
    if (testResult.status) {
      this.log(map[testResult.status])
    }
  }

  // eslint-disable-next-line no-unused-vars
  private async createRun (runName: string, cb: (adTestRun: TestInterfaces.TestRun | undefined) => void): Promise<void> {
    try {
      const runModel: TestInterfaces.RunCreateModel = {
        name: runName,
        automated: true,
        configurationIds: [1],
        plan: { id: `${this.planId}` }
      }
      const adTestRun = await this.testApi.createTestRun(runModel, this.projectName)
      cb(adTestRun)
    } catch (e) {
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      this.log(`While creating test points ids. Error: ${e}`)
      this.isDisabled = true
    }
  }

  private removePublished (testAlias: string): void {
    const resultIndex = this.resultsToBePublished.indexOf(testAlias)
    if (resultIndex !== -1) {
      this.resultsToBePublished.splice(resultIndex, 1)
    }
  }

  private async getTestPointIdsByTCIds (planId: number, testcaseIds: number[]): Promise<number[] | void> {
    try {
      const pointsQuery: TestInterfaces.TestPointsQuery = {
        pointsFilter: { testcaseIds }
      }
      const pointsQueryResult: TestInterfaces.TestPointsQuery = await this.testApi.getPointsByQuery(
        pointsQuery,
        this.projectName
      )
      const pointsIds: number[] = []
      if (pointsQueryResult.points) {
        pointsQueryResult.points.forEach((point: TestPoint) => {
          if (point.testPlan && point.testPlan.id && parseInt(point.testPlan.id, 10) === planId) {
            pointsIds.push(point.id)
          }
        })
      }
      return pointsIds
    } catch (e) {
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      console.error(`While getting test points ids, by test cases ids. Error: ${e}`)
    }
  }

  private addReportingOverride = (api: Test.ITestApi): Test.ITestApi => {
    api.addTestResultsToTestRun = function (results, projectName, runId) {
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      return new Promise(async (resolve, reject) => {
        const routeValues = {
          project: projectName,
          runId
        }

        try {
          const verData = await this.vsoClient.getVersioningData(
            '5.0-preview.5',
            'Test',
            '4637d869-3a76-4468-8057-0bb02aa385cf',
            routeValues
          )

          const url = verData.requestUrl
          const options = this.createRequestOptions('application/json', verData.apiVersion)
          const res = await this.rest.create(url as string, results, options)
          resolve(res as any)
        } catch (err) {
          reject(err)
        }
      })
    }
    return api
  };

  private getBase64 (filePath: string): string {
    return readFileSync(filePath, { encoding: 'base64' })
  }

  private async uploadAttachments (testResult: TestResult, caseId: number): Promise<string[]> {
    this.log(chalk`{gray Start upload attachments for test case [${caseId}]}`)
    return await Promise.all(
      testResult.attachments.map(async (attachment) => {
        const attachments: TestInterfaces.TestAttachmentRequestModel = {
          attachmentType: 'GeneralAttachment',
          fileName: attachment?.name + '.png',
          stream: this.getBase64(attachment.path as string)
        }

        const response = await this.testApi.createTestResultAttachment(
          attachments,
          this.projectName,
          this.runId!,
          caseId
        )
        return response.url
      })
    )
  }

  private async publishCaseResult (test: TestCase, testResult: TestResult): Promise<void> {
    this.logTestItem(test, testResult)
    const caseId = this.getCaseIds(test)
    if (caseId === '') {
      return
    }

    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    return new Promise(async (resolved, reject) => {
      const testAlias = `${caseId} - ${test.title}`
      this.resultsToBePublished.push(testAlias)
      this.log(chalk`{gray Start publishing: ${test.title}}`)
      try {
        while (!this.runId) {
          // need wait runId variable to be initialised in onBegin() hook
          await new Promise((resolve) => setTimeout(resolve, 50))
        }

        const pointIds = await this.getTestPointIdsByTCIds(this.planId as number, [parseInt(caseId, 10)])
        const results: TestInterfaces.TestCaseResult[] = [
          {
            testCase: { id: caseId },
            testPoint: { id: (pointIds as number[])[0].toString() },
            testCaseTitle: test.title,
            outcome: Statuses[testResult.status],
            state: 'Completed',
            durationInMs: testResult.duration,
            errorMessage: testResult.error
              ? `${test.title}: ${testResult.error?.message?.replace(/\u001b\[.*?m/g, '') as string}`
              : undefined,
            stackTrace: testResult.error?.stack?.replace(/\u001b\[.*?m/g, '')
          }
        ]

        const testCaseResult: TestResultsToTestRun = await this.addReportingOverride(this.testApi).addTestResultsToTestRun(results, this.projectName, this.runId) as unknown as TestResultsToTestRun
        if (this.options.uploadAttachments && testResult.attachments.length > 0) {
          await this.uploadAttachments(testResult, testCaseResult.result.value![0].id)
        }

        this.removePublished(testAlias)
        this.publishedResultsCount++
        this.log(chalk`{gray Result published: ${test.title}}`)
        resolved(testCaseResult)
      } catch (err) {
        this.removePublished(testAlias)
        this.log(chalk`{red ${err}}`)
        reject(err)
      }
    }).then(alwaysUndefined)
  }
}

export default PlaywrightReporter
