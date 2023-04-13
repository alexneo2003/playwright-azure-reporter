/* eslint-disable no-unused-vars */
/* eslint-disable no-control-regex */
import { Reporter, TestCase, TestResult } from '@playwright/test/reporter';
import * as azdev from 'azure-devops-node-api';
import { WebApi } from 'azure-devops-node-api';
import { ICoreApi } from 'azure-devops-node-api/CoreApi';
import { IRequestOptions } from 'azure-devops-node-api/interfaces/common/VsoBaseInterfaces';
import { TeamProject } from 'azure-devops-node-api/interfaces/CoreInterfaces';
import * as TestInterfaces from 'azure-devops-node-api/interfaces/TestInterfaces';
import { TestPoint } from 'azure-devops-node-api/interfaces/TestInterfaces';
import * as Test from 'azure-devops-node-api/TestApi';
import chalk from 'chalk';
import { existsSync, readFileSync } from 'fs';

import debug from './debug';
import { createGuid, getExtensionFromContentType, getExtensionFromFilename, shortID } from './utils';

enum EAzureTestStatuses {
  passed = 'Passed',
  failed = 'Failed',
  skipped = 'Paused',
  timedOut = 'Failed',
  interrupted = 'Failed',
}

const attachmentTypesArray = ['screenshot', 'video', 'trace'] as const;

type TAttachmentType = Array<(typeof attachmentTypesArray)[number] | RegExp>;
type TTestRunConfig = Omit<TestInterfaces.RunCreateModel, 'name' | 'automated' | 'plan' | 'pointIds'> | undefined;
type TTestResultsToBePublished = { testCase: ITestCaseExtended; testResult: TestResult };
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
  testPointMapper?: (testCase: TestCase, testPoints: TestPoint[]) => Promise<TestPoint[] | undefined>;
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
  private _debug = debug('azure');
  private _debugWarning = debug('azure:warning');
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
  private _attachmentsType: RegExp[] = [];
  private _token: string = '';
  private _runIdPromise: Promise<number | void>;
  private _resolveRunId: (value: number) => void = () => {};
  private _rejectRunId: (reason: any) => void = () => {};
  private _publishResultsPromise: Promise<any | void>;
  private _resolvePublishResults: () => void = () => {};
  private _rejectPublishResults: (reason: any) => void = () => {};
  private _testRunConfig: TTestRunConfig = {} as TTestRunConfig;
  private _testPointMapper: (testCase: TestCase, testPoints: TestPoint[]) => Promise<TestPoint[] | undefined>;
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
    // this is the default implementation, might be replaced by the options
    this._testPointMapper = async (testCase, testPoints) => {
      if (testPoints.length > 1) {
        this._warning(
          `There are ${testPoints.length} testPoints found for the test case \n\t ${testCase.title}, \n\t you should set testRunConfig.configurationIds and/or use set a testPointMapper!`
        );
      }

      return testPoints;
    };
    this._validateOptions(options);
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
        this._attachmentsType = [new RegExp('screenshot')];
      } else {
        this._attachmentsType = options.attachmentsType.map((pattern) => {
          if (pattern instanceof RegExp) {
            return pattern;
          } else {
            return new RegExp(pattern);
          }
        });
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
    if (this._logging) {
      debug.enable('azure');
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
        const caseIds = this._getCaseIds(test);
        if (!caseIds || !caseIds.length) return;
        const testCase: ITestCaseExtended = {
          ...test,
          testAlias: `${shortID()} - ${test.title}`,
          testCaseIds: caseIds,
        };
        this._testResultsToBePublished.push({ testCase: testCase, testResult });
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

        if (this._testResultsToBePublished.length === 0) {
          this._log(chalk.gray('No test results to publish'));
          return;
        } else {
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
      debug.enable('azure');
      this._debug(message);
    }
  }

  private _warning(message: any) {
    debug.enable('azure:warning');
    this._debugWarning(`${chalk.yellow(message)}`);
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

  private async _getTestPointsOfTestResults(
    planId: number,
    testsResults: TTestResultsToBePublished[]
  ): Promise<Map<TTestResultsToBePublished, TestPoint[]>> {
    const result = new Map<TTestResultsToBePublished, TestPoint[]>();
    try {
      const testcaseIds = testsResults.map((t) => t.testCase.testCaseIds.map((id) => parseInt(id, 10))).flat();
      const pointsQuery: TestInterfaces.TestPointsQuery = {
        pointsFilter: { testcaseIds: testcaseIds },
      };
      if (!this._testApi) this._testApi = await this._connection.getTestApi();
      const pointsQueryResult: TestInterfaces.TestPointsQuery = await this._testApi.getPointsByQuery(
        pointsQuery,
        this._projectName
      );
      if (pointsQueryResult.points) {
        for (const testsResult of testsResults) {
          const currentTestPoints = pointsQueryResult.points?.filter((testPoint) => {
            if (!testPoint.testPlan!.id || parseInt(testPoint.testPlan!.id, 10) !== planId) {
              // the testPlan id is not matching
              return false;
            } else if (
              !testPoint.testCase.id ||
              !testsResult.testCase.testCaseIds.find((testCaseId) => testPoint.testCase.id == testCaseId)
            ) {
              // the testCase id is not matching
              return false;
            } else if (this._testRunConfig && this._testRunConfig.configurationIds?.length) {
              // configuration ids are set, so they must match
              return (
                testPoint.configuration.id &&
                this._testRunConfig!.configurationIds.includes(parseInt(testPoint.configuration.id, 10))
              );
            } else {
              // no configuration ids to filter, ignore them
              return true;
            }
          });

          if (currentTestPoints && currentTestPoints.length > 0) {
            const mappedTestPoints = await this._testPointMapper(testsResult.testCase, currentTestPoints);

            if (mappedTestPoints && mappedTestPoints.length > 0) {
              result.set(testsResult, mappedTestPoints);
            } else {
              // logging will happen outside
              result.set(testsResult, []);
            }
          } else {
            // logging will happen outside
            result.set(testsResult, []);
          }
        }
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
        if (this._attachmentsType.find((regex) => regex.test(attachment.name))) {
          let attachmentRequestModel: TestInterfaces.TestAttachmentRequestModel;
          const name = attachment.name.split(/[^a-zA-Z0-9]+/).join('_') + '_' + createGuid();
          if (attachment.body) {
            const ext = getExtensionFromContentType(attachment.contentType);
            attachmentRequestModel = {
              attachmentType: 'GeneralAttachment',
              fileName: name + '.' + ext,
              stream: attachment.body.toString('base64'),
            };
          } else if (existsSync(attachment.path!)) {
            const ext = getExtensionFromFilename(attachment.path!);
            attachmentRequestModel = {
              attachmentType: 'GeneralAttachment',
              fileName: name + '.' + ext,
              stream: readFileSync(attachment.path!, { encoding: 'base64' }),
            };
          } else {
            throw new Error(`Attachment ${attachment.path} does not exist`);
          }
          if (!this._testApi) this._testApi = await this._connection.getTestApi();
          const response = await this._testApi.createTestResultAttachment(
            attachmentRequestModel,
            this._projectName,
            runId!,
            testCaseResultId
          );
          if (!response?.id) throw new Error(`Failed to upload attachment for test: ${test.title}`);
          attachmentsResult.push(response.url);
        }
      } catch (error: any) {
        this._warning(chalk.red(error.message));
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

    this._testsAliasToBePublished.push(testCase.testAlias);

    try {
      const runId = await this._runIdPromise;
      this._log(chalk.gray(`Start publishing: ${test.title}`));
      const toBePublished: TTestResultsToBePublished = { testCase: testCase, testResult };
      const mappedTestPoints = (await this._getTestPointsOfTestResults(this._planId as number, [toBePublished])).get(
        toBePublished
      );

      if (!mappedTestPoints || mappedTestPoints.length == 0) {
        throw new Error(
          `No test points found for test case [${caseIds}] associated with test plan ${this._planId}. Check, maybe testPlanId, what you specified, is incorrect.`
        );
      }

      const results: TestInterfaces.TestCaseResult[] = mappedTestPoints.map(
        (testPoint) =>
          ({
            // the testPoint is the testCase + configuration, there is not need to set these
            testPoint: { id: String(testPoint.id) },
            outcome: EAzureTestStatuses[testResult.status],
            state: 'Completed',
            durationInMs: testResult.duration,
            errorMessage: testResult.error
              ? `${test.title}: ${testResult.error?.message?.replace(/\u001b\[.*?m/g, '') as string}`
              : undefined,
            stackTrace: testResult.error?.stack?.replace(/\u001b\[.*?m/g, ''),
          } as TestInterfaces.TestCaseResult)
      );

      if (!this._testApi) this._testApi = await this._connection.getTestApi();
      const testCaseResult: TestResultsToTestRun = (await this._addReportingOverride(
        this._testApi
      ).addTestResultsToTestRun(results, this._projectName, runId!)) as unknown as TestResultsToTestRun;

      if (!testCaseResult?.result) throw new Error(`Failed to publish test result for test cases [${caseIds}]`);

      if (this._uploadAttachments && testResult.attachments.length > 0)
        await this._uploadAttachmentsFunc(testResult, testCaseResult.result.value![0].id, test);

      this._removePublished(testCase.testAlias);
      this._publishedResultsCount++;
      this._log(chalk.gray(`Result published: ${test.title}`));
      return testCaseResult;
    } catch (error: any) {
      this._removePublished(testCase.testAlias);
      this._warning(chalk.red(error.message));
    }
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
        const withAttachmentsByTestPoint = new Map<TestPoint, TTestResultsToBePublished[]>();
        const testsPointsByTestCase = await this._getTestPointsOfTestResults(this._planId as number, testsPack);
        const testCaseResults: TestInterfaces.TestCaseResult[] = [];

        for (const [key, value] of testsPointsByTestCase.entries()) {
          const testCase = key.testCase;
          const testResult = key.testResult;
          const testPoints = value;

          if (testPoints && testPoints.length > 0) {
            testCaseIds.push(...testCase.testCaseIds);
            testCaseResults.push(
              ...testPoints.map((testPoint) => ({
                // the testPoint is the testCase + configuration, there is not need to set these
                testPoint: { id: String(testPoint.id) },
                outcome: EAzureTestStatuses[testResult.status],
                state: 'Completed',
                durationInMs: testResult.duration,
                errorMessage: testResult.error
                  ? `${testCase.title}: ${testResult.error?.message?.replace(/\u001b\[.*?m/g, '') as string}`
                  : undefined,
                stackTrace: testResult.error?.stack?.replace(/\u001b\[.*?m/g, ''),
              }))
            );

            if (this._uploadAttachments && testResult.attachments.length > 0) {
              for (const testPoint of testPoints) {
                const tmp = withAttachmentsByTestPoint.get(testPoint);

                if (!tmp) {
                  withAttachmentsByTestPoint.set(testPoint, [key]);
                } else {
                  // we allready have the test point hit by another testcase, should not happen
                  tmp.push(key);
                }
              }
            }
          } else {
            this._warning(
              `No test points found for test case [${testCase.testCaseIds}] associated with test plan ${this._planId}. Check, maybe testPlanId, what you specified, is incorrect.`
            );
          }
        }

        if (testCaseResults.length === 0) {
          continue;
        }

        const testCaseResult: TestResultsToTestRun = (await this._addReportingOverride(
          this._testApi
        ).addTestResultsToTestRun(testCaseResults, this._projectName, runId!)) as unknown as TestResultsToTestRun;

        if (!testCaseResult.result) {
          this._warning(`Failed to publish test result for test cases [${testCaseIds.join(', ')}]`);
        } else if (testCaseResult.result.count !== testCaseResults.length) {
          this._warning(`Not all test result for test cases [${testCaseIds.join(', ')}] are published`);
        }

        if (this._uploadAttachments && withAttachmentsByTestPoint.size > 0) {
          this._log(
            chalk.gray(`Starting to uploading attachments for ${withAttachmentsByTestPoint.size} testpoint(s)`)
          );

          const testResultsQuery: TestInterfaces.TestResultsQuery = {
            fields: [''],
            results: testCaseResult.result.value?.map((r) => {
              return { id: r.id, testRun: { id: r.testRun?.id } };
            }),
          };

          const resultData = await this._testApi.getTestResultsByQuery(testResultsQuery, this._projectName);

          for (const [key, value] of withAttachmentsByTestPoint.entries()) {
            const testResult = resultData.results?.find((result) => result.testPoint?.id === String(key.id));

            if (!testResult) {
              this._warning(`Test result for test point [${key.id}] is missing, attachments are not uploaded!`);
              continue;
            }

            for (const withAttachments of value) {
              await this._uploadAttachmentsFunc(withAttachments.testResult, testResult.id!, withAttachments.testCase);
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
