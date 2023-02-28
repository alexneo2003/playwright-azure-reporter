/* eslint-disable no-unused-vars */
/* eslint-disable no-control-regex */
import * as azdev from 'azure-devops-node-api';
import * as TestInterfaces from 'azure-devops-node-api/interfaces/TestInterfaces';
import * as Test from 'azure-devops-node-api/TestApi';

import { Reporter, TestCase, TestResult } from '@playwright/test/reporter';

import { WebApi } from 'azure-devops-node-api';
import { ICoreApi } from 'azure-devops-node-api/CoreApi';
import { TeamProject } from 'azure-devops-node-api/interfaces/CoreInterfaces';
import { TestPoint } from 'azure-devops-node-api/interfaces/TestInterfaces';
import chalk from 'chalk';
import crypto from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { IRequestOptions } from 'azure-devops-node-api/interfaces/common/VsoBaseInterfaces';

export function createGuid(): string {
  return crypto.randomBytes(16).toString('hex');
}

export function shortID(): string {
  return crypto.randomBytes(8).toString('hex');
}

enum EAzureTestStatuses {
  passed = 'Passed',
  failed = 'Failed',
  skipped = 'Paused',
  timedOut = 'Failed',
  interrupted = 'Failed',
}

const attachmentTypesArray = ['screenshot', 'video', 'trace'] as const;

type TAttachmentType = Array<typeof attachmentTypesArray[number]>;
type TTestRunConfig = Omit<TestInterfaces.RunCreateModel, 'name' | 'automated' | 'plan' | 'pointIds'> | undefined;
type TTestPoint = {
  point: number | undefined;
  configurationId?: string;
  configurationName?: string;
  testCaseId: number;
};
type TTestResultsToBePublished = { test: ITestCaseExtended; testResult: TestResult };
type TPublishTestResults = 'testResult' | 'testRun';

interface ITestCaseExtended extends TestCase {
  testAlias: string;
  testCaseIds: string[];
}

export interface AzureReporterOptions {
  token: string;
  planId: number;
  orgUrl: string;
  projectName: string;
  publishTestResultsMode?: TPublishTestResults;
  logging?: boolean | undefined;
  isDisabled?: boolean | undefined;
  environment?: string | undefined;
  testRunTitle?: string | undefined;
  uploadAttachments?: boolean | undefined;
  attachmentsType?: TAttachmentType | undefined;
  testRunConfig?: TTestRunConfig;
  testPointMapper: () => TTestPoint[] | undefined;
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
interface Project {}
interface TestRun {
  id: string;
}
interface LastUpdatedBy {
  displayName?: null;
  id?: null;
}
interface Headers {
  'cache-control': string;
  pragma: string;
  'content-length': string;
  'content-type': string;
  expires: string;
  p3p: string;
  'x-tfs-processid': string;
  'strict-transport-security': string;
  activityid: string;
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
  date: string;
  connection: string;
}

class AzureDevOpsReporter implements Reporter {
  private _testApi!: Test.ITestApi;
  private _coreApi!: ICoreApi;
  private _publishedResultsCount = 0;
  private _testsAliasToBePublished: string[] = [];
  private _testResultsToBePublished: TTestResultsToBePublished[] = [];
  private _connection!: WebApi;
  private _orgUrl!: string;
  private _projectName!: string;
  private _environment?: string;
  private _planId = 0;
  private _logging = false;
  private _isDisabled = false;
  private _testRunTitle = '';
  private _uploadAttachments = false;
  private _attachmentsType?: TAttachmentType;
  private _token: string = '';
  private _runIdPromise: Promise<number | void>;
  private _resolveRunId: (value: number) => void = () => {};
  private _rejectRunId: (reason: any) => void = () => {};
  private _publishResultsPromise: Promise<any | void>;
  private _resolvePublishResults: () => void = () => {};
  private _rejectPublishResults: (reason: any) => void = () => {};
  private _testRunConfig: TTestRunConfig = {} as TTestRunConfig;
  private _testPointMapper: (testCase: ITestCaseExtended, testPoints: TestPoint[]) => TTestPoint[] | undefined;
  private _azureClientOptions = {
    allowRetries: true,
    maxRetries: 20,
  } as IRequestOptions;
  private _publishTestResultsMode: TPublishTestResults = 'testResult';

  public constructor(options: AzureReporterOptions) {
    this._runIdPromise = new Promise<number | void>((resolve, reject) => {
      this._resolveRunId = resolve;
      this._rejectRunId = reject;
    })
      .then((runId) => {
        return runId;
      })
      .catch((error) => {
        this._warning(error);
        this._isDisabled = true;
      });
    this._publishResultsPromise = new Promise<void>((resolve, reject) => {
      this._resolvePublishResults = resolve;
      this._rejectPublishResults = reject;
    })
      .then((runId) => {
        return runId;
      })
      .catch((error) => {
        this._warning(error);
        this._isDisabled = true;
      });
    this._validateOptions(options);
    // this is the default implementation, might be replaced by the options
    this._testPointMapper = (testCase, testPoints) => {
      let mappedTestPoints: TTestPoint[];
      
      // do we have any configurationIds set?
      if (this._testRunConfig && this._testRunConfig.configurationIds?.length) {
        // yes, so they must match
        mappedTestPoints = testPoints.filter((testPoint) => 
          testPoint.testCase.id && testCase.testCaseIds.indexOf(testPoint.testCase.id) !== -1 &&
          testPoint.testPlan && testPoint.testPlan.id && this._planId === parseInt(testPoint.testPlan.id, 10) &&
          this._testRunConfig!.configurationIds.includes(Number(testPoint.configuration.id))
       ).map((mappedTestPoint) => ({
          testCaseId: parseInt(mappedTestPoint.testCase.id!, 10),
          point: mappedTestPoint.id,
          configurationId: mappedTestPoint.configuration.id!,
          configurationName: mappedTestPoint.configuration.name!,
        } as TTestPoint));
      } else {
        // no, ignore them
        mappedTestPoints = testPoints.filter((testPoint) => {
          testPoint.testCase.id && testCase.testCaseIds.indexOf(testPoint.testCase.id) !== -1 &&
          testPoint.testPlan && testPoint.testPlan.id && this._planId === parseInt(testPoint.testPlan.id, 10)
        }).map((mappedTestPoint) => ({
          testCaseId: parseInt(mappedTestPoint.testCase.id!, 10),
          point: mappedTestPoint.id,
        } as TTestPoint));
      };

      if (mappedTestPoints.length > 1) {
        this._warning("there are " + testPoints.length + " testPoints found for this testCase, you should define configurationIds or use a custom testPointMapper!");
      }

      return mappedTestPoints;
    };
  }

  _validateOptions(options: AzureReporterOptions): void {
    if (options?.isDisabled) {
      this._isDisabled = true;
      return;
    }
    if (!options?.orgUrl) {
      this._warning("'orgUrl' is not set. Reporting is disabled.");
      this._isDisabled = true;
      return;
    }
    if (!options?.projectName) {
      this._warning("'projectName' is not set. Reporting is disabled.");
      this._isDisabled = true;
      return;
    }
    if (!options?.planId) {
      this._warning("'planId' is not set. Reporting is disabled.");
      this._isDisabled = true;
      return;
    }
    if (!options?.token) {
      this._warning("'token' is not set. Reporting is disabled.");
      this._isDisabled = true;
      return;
    }
    if (options?.uploadAttachments) {
      if (!options?.attachmentsType) {
        this._warning("'attachmentsType' is not set. Attachments Type will be set to 'screenshot' by default.");
        this._attachmentsType = ['screenshot'];
      } else {
        this._attachmentsType = options.attachmentsType;
      }
    }

    this._orgUrl = options.orgUrl;
    this._projectName = options.projectName;
    this._planId = options.planId;
    this._logging = options.logging || false;
    this._token = options.token;
    this._environment = options?.environment || undefined;
    this._testRunTitle =
      `${this._environment ? `[${this._environment}]:` : ''} ${options?.testRunTitle || 'Playwright Test Run'}` ||
      `${this._environment ? `[${this._environment}]:` : ''}Test plan ${this._planId}`;
    this._uploadAttachments = options?.uploadAttachments || false;
    this._connection = new azdev.WebApi(
      this._orgUrl,
      azdev.getPersonalAccessTokenHandler(this._token),
      this._azureClientOptions
    );
    this._testRunConfig = options?.testRunConfig || undefined;
    this._publishTestResultsMode = options?.publishTestResultsMode || 'testResult';
    if (options.testPointMapper) {
      this._testPointMapper = options.testPointMapper;
    }
  }

  async onBegin(): Promise<void> {
    if (this._isDisabled) return;
    try {
      this._testApi = await this._connection.getTestApi();

      if (this._publishTestResultsMode === 'testResult') {
        const run = await this._createRun(this._testRunTitle);
        if (run?.id) {
          this._resolveRunId(run.id);
          this._log(chalk.green(`Using run ${run.id} to publish test results`));
        } else {
          this._isDisabled = true;
          this._rejectRunId('Failed to create test run. Reporting is disabled.');
        }
      }
    } catch (error: any) {
      this._isDisabled = true;
      if (error.message.includes('401')) {
        this._warning('Failed to create test run. Check your token. Reporting is disabled.');
      } else if (error.message.includes('getaddrinfo ENOTFOUND')) {
        this._warning('Failed to create test run. Check your orgUrl. Reporting is disabled.');
      } else {
        this._warning('Failed to create test run. Reporting is disabled.');
        const parsedError = JSON.parse(String(error.message.trim()));
        this._warning(parsedError?.message || error.message);
      }
    }
  }

  async onTestEnd(test: TestCase, testResult: TestResult): Promise<void> {
    if (this._isDisabled) return;
    try {
      if (this._publishTestResultsMode === 'testResult') {
        const runId = await this._runIdPromise;

        if (!runId) return;

        this._logTestItem(test, testResult);
        await this._publishCaseResult(test, testResult);
      } else {
        this._logTestItem(test, testResult);
        const testCase: ITestCaseExtended = {
          ...test,
          testAlias: `${shortID()} - ${test.title}`,
          testCaseIds: this._getCaseIds(test),
        };
        this._testResultsToBePublished.push({ test: testCase, testResult });
      }
    } catch (error: any) {
      this._warning(`Failed to publish test result. \n ${error.message}`);
    }
  }

  async onEnd(): Promise<void> {
    if (this._isDisabled) return;
    try {
      let runId: number | void;

      if (this._publishTestResultsMode === 'testResult') {
        runId = await this._runIdPromise;

        let prevCount = this._testsAliasToBePublished.length;
        while (this._testsAliasToBePublished.length > 0) {
          // need wait all results to be published
          if (prevCount > this._testsAliasToBePublished.length) {
            this._log(
              chalk.gray(
                `Waiting for all results to be published. Remaining ${this._testsAliasToBePublished.length} results`
              )
            );
            prevCount--;
          }
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
      } else {
        this._logging = true;
        const createRunResponse = await this._createRun(this._testRunTitle);
        runId = createRunResponse?.id;
        if (runId) {
          this._resolveRunId(runId);
          this._log(chalk.green(`Using run ${runId} to publish test results`));
          await this._publishTestResults(runId, this._testResultsToBePublished);
        } else {
          this._isDisabled = true;
          this._rejectRunId('Failed to create test run. Reporting is disabled.');
        }

        await this._publishResultsPromise;
      }

      if (this._publishedResultsCount === 0 && !runId) {
        this._log(chalk.gray('No testcases were matched. Ensure that your tests are declared correctly.'));
        return;
      }

      if (!this._testApi) this._testApi = await this._connection.getTestApi();
      const runUpdatedResponse = await this._testApi.updateTestRun({ state: 'Completed' }, this._projectName, runId!);
      this._log(chalk.green(`Run ${runId} - ${runUpdatedResponse.state}`));
    } catch (error: any) {
      this._warning(chalk.red(`Error on completing run ${error as string}`));
    }
  }

  printsToStdio(): boolean {
    return true;
  }

  private _log(message: any) {
    if (this._logging) {
      console.log(chalk.magenta(`azure: ${message}`));
    }
  }

  private _warning(message: any) {
    console.log(`${chalk.magenta('azure:')} ${chalk.yellow(message)}`);
  }

  private _getCaseIds(test: TestCase): string[] {
    const result: string[] = [];
    const regex = new RegExp(/\[([\d,\s]+)\]/, 'gm');
    const matchesAll = test.title.matchAll(regex);
    const matches = [...matchesAll].map((match) => match[1]);
    matches.forEach((match) => {
      const ids = match.split(',').map((id) => id.trim());
      result.push(...ids);
    });
    return result;
  }

  private _logTestItem(test: TestCase, testResult: TestResult) {
    switch (testResult.status) {
      case 'passed':
        this._log(chalk.green(`${test.title} - ${testResult.status}`));
        break;
      case 'failed':
        this._log(chalk.red(`${test.title} - ${testResult.status}`));
        break;
      case 'timedOut':
        this._log(chalk.yellow(`${test.title} - ${testResult.status}`));
        break;
      case 'skipped':
        this._log(chalk.yellow(`${test.title} - ${testResult.status}`));
        break;
      case 'interrupted':
        this._log(chalk.red(`${test.title} - ${testResult.status}`));
        break;
      default:
        this._log(`${test.title} - ${testResult.status}`);
        break;
    }
  }

  private async _createRun(runName: string): Promise<TestInterfaces.TestRun | void> {
    try {
      const isExists = await this._checkProject(this._projectName);
      if (!isExists) {
        return;
      } else {
        const runModel: TestInterfaces.RunCreateModel = {
          name: runName,
          automated: true,
          plan: { id: String(this._planId) },
          ...(this._testRunConfig
            ? this._testRunConfig
            : {
                configurationIds: [1],
              }),
        };
        if (!this._testApi) this._testApi = await this._connection.getTestApi();
        const adTestRun = await this._testApi.createTestRun(runModel, this._projectName);
        if (adTestRun?.id) return adTestRun;
        else throw new Error('Failed to create test run');
      }
    } catch (error: any) {
      this._warning(chalk.red(error.message));
      this._isDisabled = true;
    }
  }

  private _removePublished(testAlias: string): void {
    const resultIndex = this._testsAliasToBePublished.indexOf(testAlias);
    if (resultIndex !== -1) this._testsAliasToBePublished.splice(resultIndex, 1);
  }

  private async _checkProject(projectName: string): Promise<TeamProject | void> {
    try {
      if (!this._coreApi) this._coreApi = await this._connection.getCoreApi();
      const project = await this._coreApi.getProject(projectName);
      if (project) return project;
      else throw new Error(`Project ${projectName} does not exist. Reporting is disabled.`);
    } catch (error: any) {
      this._warning(chalk.red(error.message));
      this._isDisabled = true;
    }
  }

  private async _getTestPointIdsByTCIds(planId: number, testsResults: ITestCaseExtended[]): Promise<TTestPoint[]> {
    const result = [] as TTestPoint[];
    try {
      const testcaseIds = testsResults.map((t) => t.testCaseIds.map((id) => parseInt(id, 10))).flat();
      const pointsQuery: TestInterfaces.TestPointsQuery = {
        pointsFilter: { testcaseIds: testcaseIds },
      };
      if (!this._testApi) this._testApi = await this._connection.getTestApi();
      const pointsQueryResult: TestInterfaces.TestPointsQuery = await this._testApi.getPointsByQuery(
        pointsQuery,
        this._projectName
      );
      if (pointsQueryResult.points) {
        testsResults.forEach((testsResult) => {
          const currentTestPoints = pointsQueryResult.points?.filter((testPoint) => {
            if (!testPoint.testPlan!.id || parseInt(testPoint.testPlan!.id, 10) !== planId) {
              this._log("testPoint: " + testPoint.id + " does not match the testPlan id: " + planId)
              return false;
            } else if (!testPoint.testCase.id || !testsResult.testCaseIds.find((testCaseId) => testPoint.testCase.id == testCaseId)) {
              this._log("testPoint: " + testPoint.id + " does not match any of the testcase ids: " + testsResult.testCaseIds)
              return false;
            }

            return true;
          });

          if (currentTestPoints && currentTestPoints.length > 0) {
            const mappedTestPoints = this._testPointMapper(testsResult, currentTestPoints);

            if (mappedTestPoints) {
              result.push(...mappedTestPoints);
            }
          }
        });
      }
      if (!result?.some((item) => item.point)) {
        this._warning(
          `Could not find test point for test cases [${testcaseIds.join(',')}] associated with test plan ${
            this._planId
          }. Check, maybe testPlanId, what you specified, is incorrect.`
        );
      }
    } catch (error: any) {
      this._warning(chalk.red(error.message));
    }
    return result;
  }

  private _addReportingOverride = (api: Test.ITestApi): Test.ITestApi => {
    /**
     * Override the default behavior of publishing test results to the test run.
     * This is necessary because Microsoft Azure API documentation at version higher than '5.0-preview.5'
     * has undocumented fields and they not implementing at 'azure-devops-node-api/TestApi' package.
     * This function is downgraded the API version to '5.0-preview.5'.
     * https://github.com/microsoft/azure-devops-node-api/issues/318#issuecomment-498802402
     */
    api.addTestResultsToTestRun = function (results, projectName, runId) {
      return new Promise(async (resolve, reject) => {
        const routeValues = {
          project: projectName,
          runId,
        };

        try {
          const verData = await this.vsoClient.getVersioningData(
            '5.0-preview.5',
            'Test',
            '4637d869-3a76-4468-8057-0bb02aa385cf',
            routeValues
          );
          const url = verData.requestUrl;
          const options = this.createRequestOptions('application/json', verData.apiVersion);
          const res = await this.rest.create(url as string, results, options);
          resolve(res as any);
        } catch (error) {
          reject(error);
        }
      });
    };
    return api;
  };

  private async _uploadAttachmentsFunc(
    testResult: TestResult,
    testCaseResultId: number,
    test: ITestCaseExtended | TestCase
  ): Promise<string[]> {
    this._log(chalk.gray(`Uploading attachments for test: ${test.title}`));
    const runId = await this._runIdPromise;
    const attachmentsResult: string[] = [];

    if (!runId) {
      throw new Error('Could not find test run id. Check, maybe testPlanId, what you specified, is incorrect.');
    }

    for (const attachment of testResult.attachments) {
      try {
        if (this._attachmentsType!.includes(attachment.name as TAttachmentType[number])) {
          if (existsSync(attachment.path!)) {
            const attachmentRequestModel: TestInterfaces.TestAttachmentRequestModel = {
              attachmentType: 'GeneralAttachment',
              fileName: `${attachment.name}-${createGuid()}.${attachment.contentType.split('/')[1]}`,
              stream: readFileSync(attachment.path!, { encoding: 'base64' }),
            };

            if (!this._testApi) this._testApi = await this._connection.getTestApi();
            const response = await this._testApi.createTestResultAttachment(
              attachmentRequestModel,
              this._projectName,
              runId!,
              testCaseResultId
            );
            if (!response?.id) throw new Error(`Failed to upload attachment for test: ${test.title}`);
            attachmentsResult.push(response.url);
          } else {
            throw new Error(`Attachment ${attachment.path} does not exist`);
          }
        }
      } catch (error: any) {
        this._log(chalk.red(error.message));
      }
    }
    this._log(chalk.gray('Uploaded attachments'));
    return attachmentsResult;
  }

  private async _publishCaseResult(test: TestCase, testResult: TestResult): Promise<TestResultsToTestRun | void> {
    const caseIds = this._getCaseIds(test);
    if (!caseIds || !caseIds.length) return;

    const testCase: ITestCaseExtended = {
      ...test,
      testAlias: `${shortID()} - ${test.title}`,
      testCaseIds: caseIds,
    };

    const mappedTestPoints = await this._getTestPointIdsByTCIds(this._planId as number, [testCase]);

    await Promise.all(
      caseIds.map(async (caseId) => {
        const testAlias = `${shortID()} - ${test.title}`;
        this._testsAliasToBePublished.push(testAlias);
        try {
          const runId = await this._runIdPromise;
          this._log(chalk.gray(`Start publishing: TC:${caseId} - ${test.title}`));

          const points = mappedTestPoints.filter((mappedTestPoint) => mappedTestPoint.testCaseId === parseInt(caseId, 10));
          if (!points || points.length == 0) {
            this._removePublished(testAlias);
            throw new Error(`No test points found for test case [${caseId}] associated with test plan ${this._planId}. Check, maybe testPlanId, what you specified, is incorrect.`);
          }

          const results: TestInterfaces.TestCaseResult[] = points.map((testPoint) => (
            {
              testCase: { id: String(caseId) },
              testPoint: { id: String(testPoint.point) },
              testCaseTitle: test.title,
              outcome: EAzureTestStatuses[testResult.status],
              state: 'Completed',
              durationInMs: testResult.duration,
              errorMessage: testResult.error
                ? `${test.title}: ${testResult.error?.message?.replace(/\u001b\[.*?m/g, '') as string}`
                : undefined,
              stackTrace: testResult.error?.stack?.replace(/\u001b\[.*?m/g, ''),
              ...(testPoint.configurationId && {
                configuration: { id: testPoint.configurationId, name: testPoint.configurationName },
              }),
            } as TestInterfaces.TestCaseResult
          ));

          if (!this._testApi) this._testApi = await this._connection.getTestApi();
          const testCaseResult: TestResultsToTestRun = (await this._addReportingOverride(
            this._testApi
          ).addTestResultsToTestRun(results, this._projectName, runId!)) as unknown as TestResultsToTestRun;
          if (!testCaseResult?.result) throw new Error(`Failed to publish test result for test case [${caseId}]`);

          if (this._uploadAttachments && testResult.attachments.length > 0)
            await this._uploadAttachmentsFunc(testResult, testCaseResult.result.value![0].id, test);

          this._removePublished(testAlias);
          this._publishedResultsCount++;
          this._log(chalk.gray(`Result published: TC:${caseId} - ${test.title}`));
          return testCaseResult;
        } catch (error: any) {
          this._removePublished(testAlias);
          this._warning(chalk.red(error.message));
        }
      })
    );
  }

  private async _publishTestResults(runId: number, testsResults: TTestResultsToBePublished[]) {
    if (!this._testApi) this._testApi = await this._connection.getTestApi();

    const testsPackSize = 50;
    const testsEndPack = Math.ceil(testsResults.length / testsPackSize);
    const testsPacksArray = Array.from({ length: testsEndPack }, (_, i) =>
      testsResults.slice(i * testsPackSize, (i + 1) * testsPackSize)
    );

    this._log(chalk.gray(`Start publishing test results for ${testsResults.length} test(s)`));

    try {
      for (const testsPack of testsPacksArray) {
        let testCaseIds: string[] = [];
        const testsPoints = await this._getTestPointIdsByTCIds(this._planId as number, testsPack.map((testsResult) => testsResult.test));
        const testCaseResults: TestInterfaces.TestCaseResult[] = [];

        for (const { test, testResult } of testsPack) {
          testCaseIds = test.testCaseIds;

          for (const id of testCaseIds) {
            const testPoint = testsPoints.find((p) => p.testCaseId === parseInt(id, 10));

            if (!testPoint) {
              this._warning(`No test points found for test case [${testCaseIds}]`);
            } else {
              testCaseResults.push({
                testCase: { id },
                testPoint: { id: String(testPoint.point) },
                testCaseTitle: test.title,
                outcome: EAzureTestStatuses[testResult.status],
                state: 'Completed',
                durationInMs: testResult.duration,
                errorMessage: testResult.error
                  ? `${test.title}: ${testResult.error?.message?.replace(/\u001b\[.*?m/g, '') as string}`
                  : undefined,
                stackTrace: testResult.error?.stack?.replace(/\u001b\[.*?m/g, ''),
                ...(testPoint.configurationId && {
                  configuration: { id: testPoint.configurationId, name: testPoint.configurationName },
                }),
              });
            }
          }
        }

        if (testCaseResults.length === 0) {
          continue;
        }

        const testCaseResult: TestResultsToTestRun = (await this._addReportingOverride(
          this._testApi
        ).addTestResultsToTestRun(testCaseResults, this._projectName, runId!)) as unknown as TestResultsToTestRun;

        if (!testCaseResult.result) {
          this._warning(`Failed to publish test result for test case [${testCaseIds.join(', ')}]`);
        }

        const testsWithAttachments = testsPack.filter((t) => t.testResult.attachments.length > 0);
        if (this._uploadAttachments && testsWithAttachments.length > 0) {
          this._log(chalk.gray(`Starting to uploading attachments for ${testsWithAttachments.length} test(s)`));
        }

        if (this._uploadAttachments && testsWithAttachments?.length > 0) {
          const testResultsQuery: TestInterfaces.TestResultsQuery = {
            fields: [''],
            results: testCaseResult.result.value?.map((r) => {
              return { id: r.id, testRun: { id: r.testRun?.id } };
            }),
          };

          const resultData = await this._testApi.getTestResultsByQuery(testResultsQuery, this._projectName);

          for (const publishedTestResult of resultData.results!) {
            const testWithAttachments = testsWithAttachments.find((t) =>
              t.test.testCaseIds.includes(publishedTestResult.testCase?.id as string)
            );

            if (testWithAttachments) {
              await this._uploadAttachmentsFunc(
                testWithAttachments.testResult,
                publishedTestResult.id!,
                testWithAttachments.test
              );
            }
          }
        }

        this._publishedResultsCount += testsPack.length;
        this._log(chalk.gray(`Left to publish: ${testsResults.length - this._publishedResultsCount}`));
      }
      this._log(chalk.gray(`Test results published for ${this._publishedResultsCount} test(s)`));
      this._resolvePublishResults();
    } catch (error: any) {
      this._warning(chalk.red(error.message));
      this._rejectPublishResults(error);
    }
  }
}

export default AzureDevOpsReporter;
