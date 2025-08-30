/* eslint-disable no-unused-vars */
/* eslint-disable no-control-regex */
import { Reporter, TestCase, TestResult } from '@playwright/test/reporter';
import * as azdev from 'azure-devops-node-api';
import { WebApi } from 'azure-devops-node-api';
import { ICoreApi } from 'azure-devops-node-api/CoreApi';
import { IRequestOptions } from 'azure-devops-node-api/interfaces/common/VsoBaseInterfaces';
import VSSInterfaces from 'azure-devops-node-api/interfaces/common/VSSInterfaces';
import { TeamProject } from 'azure-devops-node-api/interfaces/CoreInterfaces';
import * as TestInterfaces from 'azure-devops-node-api/interfaces/TestInterfaces';
import * as TestPlanInterfaces from 'azure-devops-node-api/interfaces/TestPlanInterfaces';
import * as Test from 'azure-devops-node-api/TestApi';
import * as TestPlanApi from 'azure-devops-node-api/TestPlanApi';
import { setVariable } from 'azure-pipelines-task-lib';
import chalk from 'chalk';
import { existsSync, readFileSync } from 'fs';
import * as restm from 'typed-rest-client/RestClient';
import { isRegExp } from 'util/types';

import Logger from './logger';
import { createGuid, getExtensionFromContentType, getExtensionFromFilename, shortID } from './utils';

// https://learn.microsoft.com/en-us/azure/devops/report/analytics/entity-reference-test-plans?view=azure-devops#testoutcome-enumerated-type-members
enum EAzureTestStatuses {
  passed = 'Passed',
  failed = 'Failed',
  fixme = 'Paused',
  skipped = 'NotApplicable',
  other = 'Blocked',
  timedOut = 'Timeout',
  interrupted = 'Aborted',
}

const attachmentTypesArray = ['screenshot', 'video', 'trace'] as const;

type TAttachmentType = Array<(typeof attachmentTypesArray)[number] | RegExp>;
type TTestRunConfig = Omit<TestInterfaces.RunCreateModel, 'name' | 'automated' | 'plan' | 'pointIds'> | undefined;
type TTestResultsToBePublished = { testCase: ITestCaseExtended; testResult: TestResult };
type TPublishTestResults = 'testResult' | 'testRun';
type TTestCaseIdZone = 'title' | 'annotation';

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
  testPointMapper?: (
    testCase: TestCase,
    testPoints: TestInterfaces.TestPoint[]
  ) => Promise<TestInterfaces.TestPoint[] | undefined>;
  isExistingTestRun?: boolean;
  testRunId?: number;
  testCaseIdMatcher?: string | RegExp | Array<string | RegExp>;
  testCaseIdZone?: TTestCaseIdZone;
  rootSuiteId?: number;
  uploadLogs?: boolean;
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
  private _logger: Logger | undefined;
  private _testApi!: Test.ITestApi;
  private _testPlanApi!: TestPlanApi.ITestPlanApi;
  private _coreApi!: ICoreApi;
  private _publishedResultsCount: {
    tests: number;
    points: number;
  } = {
    tests: 0,
    points: 0,
  };
  private _testsAliasToBePublished: string[] = [];
  private _testResultsToBePublished: TTestResultsToBePublished[] = [];
  private _connection!: WebApi;
  private _orgUrl!: string;
  private _projectName!: string;
  private _environment?: string;
  private _planId = 0;
  private _logging = false;
  private _isDisabled = false;
  private _setIsDisable: (state: boolean) => void = () => {};
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
  private _testPointMapper: (
    testCase: TestCase,
    testPoints: TestInterfaces.TestPoint[]
  ) => Promise<TestInterfaces.TestPoint[] | undefined>;
  private _azureClientOptions = {
    allowRetries: true,
    maxRetries: 20,
  } as IRequestOptions;
  private _publishTestResultsMode: TPublishTestResults = 'testResult';
  private _testRunId: number | undefined;
  private _isExistingTestRun = false;
  private _testCaseIdMatcher: string | RegExp | Array<string | RegExp> = new RegExp(/\[([\d,\s]+)\]/, 'g');
  private _testCaseIdZone: TTestCaseIdZone = 'title';
  private _rootSuiteId: number | undefined;
  private _expectedTestPointsByRootSuite: Array<TestPlanInterfaces.TestPoint> = [];
  private _testPointsByRootSuitePromise: Promise<boolean | void>;
  private _resolveTestPointsByRootSuite: (value: boolean) => void = () => {};
  private _rejectTestPointsByRootSuite: (reason: any) => void = () => {};
  private _uploadLogs = false;
  private _configurationNames: string[] = [];

  public constructor(options: AzureReporterOptions) {
    this._runIdPromise = new Promise<number | void>((resolve, reject) => {
      this._resolveRunId = resolve;
      this._rejectRunId = reject;
    })
      .then((runId) => {
        return runId;
      })
      .catch((error) => {
        this._logger?.error(error);
        this._setIsDisable(true);
      });
    this._publishResultsPromise = new Promise<void>((resolve, reject) => {
      this._resolvePublishResults = resolve;
      this._rejectPublishResults = reject;
    })
      .then((runId) => {
        return runId;
      })
      .catch((error) => {
        this._logger?.error(error);
        this._setIsDisable(true);
      });
    // this is the default implementation, might be replaced by the options
    this._testPointMapper = async (testCase, testPoints) => {
      if (testPoints.length > 1) {
        this._logger?.warn(
          `There are ${testPoints.length} testPoints found for the test case \n\t ${testCase.title}, \n\t you should set testRunConfig.configurationIds and/or use set a testPointMapper!`
        );
      }

      return testPoints;
    };

    this._rootSuiteId = options.rootSuiteId || Number(process.env.AZURE_PW_ROOT_SUITE_ID) || undefined;
    this._testPointsByRootSuitePromise = new Promise<boolean | void>((resolve, reject) => {
      this._resolveTestPointsByRootSuite = resolve;
      this._rejectTestPointsByRootSuite = reject;
    })
      .then((state) => {
        return state;
      })
      .catch((error) => {
        this._logger?.error(error);
        this._setIsDisable(true);
      });
    this._uploadLogs = options.uploadLogs || false;

    this._validateOptions(options);
  }

  _validateOptions(options: AzureReporterOptions): void {
    this._setIsDisable = (state: boolean) => {
      process.env.AZURE_PW_DISABLED = String(state);
      this._isDisabled = state;
    };
    this._logging = options.logging || false;
    this._logger = new Logger(this._logging);

    this._logger?.debug('Validating options');
    this._logger?.debug(this._anonymizeObject(options, ['token']));
    if (options?.isDisabled) {
      this._setIsDisable(true);
      return;
    }
    if (!options?.orgUrl) {
      this._logger?.warn("'orgUrl' is not set. Reporting is disabled.");
      this._setIsDisable(true);
      return;
    }
    if (!options?.projectName) {
      this._logger?.warn("'projectName' is not set. Reporting is disabled.");
      this._setIsDisable(true);
      return;
    }
    if (!options?.planId) {
      this._logger?.warn("'planId' is not set. Reporting is disabled.");
      this._setIsDisable(true);
      return;
    }
    if (!options?.token) {
      this._logger?.warn("'token' is not set. Reporting is disabled.");
      this._setIsDisable(true);
      return;
    }
    this._testRunId = options.testRunId || Number(process.env.AZURE_PW_TEST_RUN_ID) || undefined;
    if (options?.isExistingTestRun && !this._testRunId) {
      this._logger?.warn(
        "'testRunId' or AZURE_PW_TEST_RUN_ID is not set for 'isExistingTestRun'=true mode. Reporting is disabled."
      );
      this._setIsDisable(true);
      return;
    }
    if (this._testRunId) {
      this._setAzurePWTestRunId(this._testRunId);
    }
    if (options?.uploadAttachments) {
      if (!options?.attachmentsType) {
        this._logger?.warn("'attachmentsType' is not set. Attachments Type will be set to 'screenshot' by default.");
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
    this._isExistingTestRun = options.isExistingTestRun || false;
    this._testCaseIdMatcher = options.testCaseIdMatcher || new RegExp(/\[([\d,\s]+)\]/, 'g');
    const validZones: TTestCaseIdZone[] = ['title', 'annotation'];
    if (options.testCaseIdZone && validZones.includes(options.testCaseIdZone as TTestCaseIdZone)) {
      this._testCaseIdZone = options.testCaseIdZone as TTestCaseIdZone;
    } else {
      this._testCaseIdZone = 'title';
    }

    if (this._testCaseIdZone === 'annotation' && !options.testCaseIdMatcher) {
      this._logger?.warn("'testCaseIdMatcher' is not set. The default matcher is set to '\\[([\\d,\\s]+)\\]'.");
      this._logger?.warn(
        'This means you need to define your own testCaseIdMatcher, specifically for the "annotation" area'
      );
    }
  }

  private async _fetchConfigurationNames(): Promise<void> {
    if (!this._testRunConfig?.configurationIds || this._testRunConfig.configurationIds.length === 0) {
      return;
    }

    try {
      const testPlanApi = await this._connection.getTestPlanApi();
      const configurationNames: string[] = [];

      for (const configId of this._testRunConfig.configurationIds) {
        try {
          const configuration = await testPlanApi.getTestConfigurationById(this._projectName, configId);
          if (configuration?.name) {
            configurationNames.push(configuration.name);
            this._logger?.debug(`Fetched configuration: ${configuration.name} (ID: ${configId})`);
          }
        } catch (error: any) {
          this._logger?.warn(`Failed to fetch configuration with ID ${configId}: ${error.message}`);
        }
      }

      this._configurationNames = configurationNames;
      if (configurationNames.length > 0) {
        this._logger?.info(`Loaded ${configurationNames.length} configuration(s): ${configurationNames.join(', ')}`);
      }
    } catch (error: any) {
      this._logger?.error(`Failed to fetch configuration names: ${error.message}`);
    }
  }

  async onBegin(): Promise<void> {
    if (this._isDisabled) return;
    try {
      // Fetch configuration names early if configuration IDs are provided
      await this._fetchConfigurationNames();

      if (this._isExistingTestRun) {
        this._resolveRunId(this._testRunId!);
        this._logger?.info(`Using existing run ${this._testRunId} to publish test results`);
        this._logger?.info(`AZURE_PW_TEST_RUN_ID: ${process.env.AZURE_PW_TEST_RUN_ID}`);

        if (this._rootSuiteId) {
          await this._retrieveTestPoints();
        }

        return;
      }
      this._testApi = await this._connection.getTestApi();

      if (this._publishTestResultsMode === 'testResult') {
        const run = await this._createRun(this._testRunTitle);
        if (run?.id) {
          this._resolveRunId(run.id);
          this._logger?.info(`Using run ${run.id} to publish test results`);
          this._setAzurePWTestRunId(run.id);
          this._logger?.info(`AZURE_PW_TEST_RUN_ID: ${process.env.AZURE_PW_TEST_RUN_ID}`);

          if (this._rootSuiteId) {
            await this._retrieveTestPoints();
          }
        } else {
          this._rejectRunId('Failed to create test run. Reporting is disabled.');
        }
      }
    } catch (error: any) {
      this._logger?.debug(error.message);
      if (error.message.includes('401')) {
        this._logger?.error('Failed to create test run. Check your token. Reporting is disabled.');
      } else if (error.message.includes('getaddrinfo ENOTFOUND')) {
        this._logger?.error('Failed to create test run. Check your orgUrl. Reporting is disabled.');
      } else {
        this._logger?.error('Failed to create test run. Reporting is disabled.');
        this._logger?.error(error.stack);
      }
      this._setIsDisable(true);
    }
  }

  async onTestEnd(test: TestCase, testResult: TestResult): Promise<void> {
    if (this._isDisabled) return;
    try {
      if (this._publishTestResultsMode === 'testResult') {
        const runId = await this._runIdPromise;
        if (!runId) return;

        if (this._rootSuiteId) {
          await this._testPointsByRootSuitePromise;
        }

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
      this._logger?.error(`Failed to publish test result. \n ${error.message}`);
      this._logger?.error(error.stack);
    }
  }

  async onEnd(): Promise<void> {
    if (this._isDisabled) return;
    try {
      let runId: number | void;

      if (this._publishTestResultsMode === 'testResult') {
        runId = await this._runIdPromise;

        if (this._rootSuiteId) {
          await this._testPointsByRootSuitePromise;
        }

        let prevCount = this._testsAliasToBePublished.length;
        while (this._testsAliasToBePublished.length > 0) {
          // need wait all results to be published
          if (prevCount > this._testsAliasToBePublished.length) {
            this._logger?.info(
              `Waiting for all results to be published. Remaining ${this._testsAliasToBePublished.length} results`
            );
            prevCount--;
          }
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
      } else {
        if (this._testResultsToBePublished.length === 0) {
          this._logger?.info('No test results to publish', true);
          return;
        } else {
          if (!this._isExistingTestRun) {
            const createRunResponse = await this._createRun(this._testRunTitle);
            runId = createRunResponse?.id;
          } else {
            runId = this._testRunId;
          }
          if (runId) {
            this._resolveRunId(runId);
            this._logger?.info(`Using run ${runId} to publish test results`);
            this._setAzurePWTestRunId(runId);
            this._logger?.info(`AZURE_PW_TEST_RUN_ID: ${process.env.AZURE_PW_TEST_RUN_ID}`);
            await this._publishTestRunResults(runId, this._testResultsToBePublished);
          } else {
            this._setIsDisable(true);
            this._rejectRunId('Failed to create test run. Reporting is disabled.');
          }

          await this._publishResultsPromise;
        }
      }

      const shouldForceLogs = this._publishTestResultsMode === 'testRun';

      if (this._publishedResultsCount.tests === 0 && !runId) {
        this._logger?.warn('No testcases were matched. Ensure that your tests are declared correctly.');
        return;
      } else {
        const { tests, points } = this._publishedResultsCount;
        this._logger?.info(`Test results published for ${tests} test(s), ${points} test point(s)`, shouldForceLogs);
      }

      if (this._isExistingTestRun) return;
      if (!this._testApi) this._testApi = await this._connection.getTestApi();
      const runUpdatedResponse = await this._testApi.updateTestRun({ state: 'Completed' }, this._projectName, runId!);
      this._logger?.info(`Run ${runId} - ${runUpdatedResponse.state}`, shouldForceLogs);
    } catch (error: any) {
      this._logger?.error(`Error on onEnd hook ${error as string}`);
    }
  }

  printsToStdio(): boolean {
    return true;
  }

  private _anonymizeString(str: string | undefined): string {
    if (typeof str !== 'string') {
      return '';
    }
    return str.replace(/./g, '*');
  }

  private _anonymizeObject(obj: any, keys: string[]): any {
    if (typeof obj !== 'object' || obj === null) return obj;
    if (Array.isArray(obj)) return obj.map((item) => this._anonymizeObject(item, keys));
    if (isRegExp(obj)) return obj.toString();
    const result: any = {};
    for (const key in obj) {
      if (keys.includes(key)) {
        result[key] = this._anonymizeString(obj[key]);
      } else {
        result[key] = this._anonymizeObject(obj[key], keys);
      }
    }
    return result;
  }

  private _prepareExtractMatches(testCaseIdMatcher: string | RegExp | (string | RegExp)[]): RegExp[] {
    return (Array.isArray(testCaseIdMatcher) ? testCaseIdMatcher : [testCaseIdMatcher]).map((re) => {
      if (typeof re === 'string') {
        return new RegExp(re, 'g');
      } else if (!isRegExp(re)) {
        throw new Error(`Invalid testCaseIdMatcher. Must be a string or RegExp. Actual: ${re}`);
      }
      return re;
    });
  }

  private _extractMatchesFromText(text: string): string[] {
    const reList = this._prepareExtractMatches(this._testCaseIdMatcher);

    this._logger?.debug(`Extracting matches from text: ${text}`);
    this._logger?.debug(`Using matchers: ${reList}`);

    const matchesResult: string[] = [];
    for (const re of reList) {
      this._logger?.debug(`Using matcher: ${re}`);
      const matchesAll = text.matchAll(new RegExp(re, 'g'));
      for (const match of matchesAll) {
        this._logger?.debug(`[_extractMatches] Whole matches found: ${match}`);
        if (match && match[1]) {
          this._logger?.debug(`[_extractMatches] Matches found: ${match[1]}`);
          matchesResult.push(match[1]);
        }
      }
    }
    return matchesResult;
  }

  private _extractMatchesFromObject(obj: Record<string, string>): string[] {
    if (!obj) return [];
    if (Object.keys(obj).length === 0) return [];
    if (Array.isArray(obj)) throw new Error('Object must be a key-value pair');
    this._logger?.debug(`Extracting matches from object: \n${JSON.stringify(obj, null, 2)}`);
    const matchesResult: string[] = [];
    for (const key in obj) {
      if (key === 'type') {
        this._logger?.debug(`[_extractMatches] Checking key ${key}`);
        for (const re of this._prepareExtractMatches(this._testCaseIdMatcher)) {
          const matches = obj[key].match(re);
          if (matches && matches.length > 1) {
            this._logger?.debug(`[_extractMatches] Matches found: ${key} - ${matches[1]}`);
            matchesResult.push(obj['description']);
          }
        }
      }
    }
    return matchesResult;
  }

  private _getCaseIds(test: TestCase): string[] {
    const result: string[] = [];
    if (this._testCaseIdZone === 'title') {
      const matches = this._extractMatchesFromText(test.title);
      this._logger?.debug(`[_getCaseIds] Matches found: ${matches}`);
      matches.forEach((match) => {
        const ids = match.split(',').map((id) => id.trim());
        result.push(...ids);
      });
      if (test.tags) {
        test.tags.forEach((tag) => {
          const ids = this._extractMatchesFromText(tag);
          this._logger?.debug(`[_getCaseIds] Matches found in tag: ${ids}`);
          ids.forEach((id) => {
            result.push(id);
          });
        });
      }
    } else {
      if (test.annotations) {
        test.annotations.forEach((annotation) => {
          const matches = this._extractMatchesFromObject(annotation);
          this._logger?.debug(`[_getCaseIds] Matches found in annotation: ${matches}`);
          matches.forEach((id) => {
            const ids = id.split(',').map((id) => id.trim());
            result.push(...ids);
          });
        });
      }
    }
    return [...new Set(result)];
  }

  private _logTestItem(test: TestCase, testResult: TestResult) {
    switch (testResult.status) {
      case 'passed':
        this._logger?.info(chalk.green(`${test.title} - ${testResult.status}`));
        break;
      case 'failed':
        this._logger?.info(chalk.red(`${test.title} - ${testResult.status}`));
        break;
      case 'timedOut':
        this._logger?.info(chalk.yellow(`${test.title} - ${testResult.status}`));
        break;
      case 'skipped':
        this._logger?.info(chalk.yellow(`${test.title} - ${testResult.status}`));
        break;
      case 'interrupted':
        this._logger?.info(chalk.red(`${test.title} - ${testResult.status}`));
        break;
      default:
        this._logger?.info(`${test.title} - ${testResult.status}`);
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
      this._logger?.error(error.stack);
      this._setIsDisable(true);
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
      this._logger?.error(error.stack);
      this._setIsDisable(true);
    }
  }

  private _filterTestTestPoints(
    testPoints: TestInterfaces.TestPoint[],
    testsResult: TTestResultsToBePublished
  ): TestInterfaces.TestPoint[] {
    return testPoints?.filter((testPoint) => {
      if (!testPoint.testPlan!.id || parseInt(testPoint.testPlan!.id, 10) !== this._planId) {
        return false;
      } else if (
        !testPoint.testCase.id ||
        !testsResult.testCase.testCaseIds.find((testCaseId) => testPoint.testCase.id == testCaseId)
      ) {
        return false;
      } else if (this._testRunConfig && this._testRunConfig.configurationIds?.length) {
        return (
          testPoint.configuration.id &&
          this._testRunConfig!.configurationIds.includes(parseInt(testPoint.configuration.id, 10))
        );
      } else {
        return true;
      }
    });
  }

  private _filterTestPlanTestPoints(
    testPoints: TestInterfaces.TestPoint[],
    testsResult: TTestResultsToBePublished
  ): TestInterfaces.TestPoint[] {
    return testPoints?.filter((testPoint) => {
      if (!testPoint.testPlan!.id || parseInt(testPoint.testPlan!.id, 10) !== this._planId) {
        return false;
      } else if (
        !testPoint.testCase.id ||
        !testsResult.testCase.testCaseIds.find((testCaseId) => testPoint.testCase.id == testCaseId)
      ) {
        return false;
      } else if (this._testRunConfig && this._testRunConfig.configurationIds?.length) {
        return (
          testPoint.configuration.id &&
          this._testRunConfig!.configurationIds.includes(parseInt(testPoint.configuration.id, 10))
        );
      } else {
        return true;
      }
    });
  }

  private _convertTestPlanOutcomeToTestOutcome(outcome: TestPlanInterfaces.Outcome): string {
    switch (outcome) {
      case TestPlanInterfaces.Outcome.Passed:
        return EAzureTestStatuses.passed;
      case TestPlanInterfaces.Outcome.Failed:
        return EAzureTestStatuses.failed;
      case TestPlanInterfaces.Outcome.Inconclusive:
        return EAzureTestStatuses.other;
      case TestPlanInterfaces.Outcome.NotApplicable:
        return EAzureTestStatuses.skipped;
      case TestPlanInterfaces.Outcome.Paused:
        return EAzureTestStatuses.fixme;
      case TestPlanInterfaces.Outcome.Timeout:
        return EAzureTestStatuses.timedOut;
      case TestPlanInterfaces.Outcome.Aborted:
        return EAzureTestStatuses.interrupted;
      default:
        return EAzureTestStatuses.other;
    }
  }

  private _convertTestPlanTestPointsToTestPoints(
    testPlanTestPoints: TestPlanInterfaces.TestPoint[]
  ): TestInterfaces.TestPoint[] {
    return testPlanTestPoints.map((testPlanTestPoint) => {
      const {
        isAutomated,
        comment,
        id,
        project,
        testCaseReference,
        testPlan,
        configuration,
        lastUpdatedBy,
        lastUpdatedDate,
        links,
        results,
      } = testPlanTestPoint;
      return {
        assignedTo: testCaseReference.assignedTo,
        automated: isAutomated,
        comment: comment,
        id: id,
        projectId: project.id,
        testCase: { id: testCaseReference.id.toString() },
        testPlan: { id: testPlan.id.toString() },
        configuration: { id: configuration.id.toString() },
        lastUpdatedBy: lastUpdatedBy,
        lastUpdatedDate: lastUpdatedDate,
        outcome: this._convertTestPlanOutcomeToTestOutcome(results?.outcome),
        url: links?._self.href || '',
        workItemProperties: [],
      } as TestInterfaces.TestPoint;
    });
  }

  private async _getTestPointsOfTestResults(
    testsResults: TTestResultsToBePublished[]
  ): Promise<Map<TTestResultsToBePublished, TestInterfaces.TestPoint[]>> {
    const result = new Map<TTestResultsToBePublished, TestInterfaces.TestPoint[]>();

    if (this._rootSuiteId) {
      for (const testsResult of testsResults) {
        const currentTestPoints = this._filterTestPlanTestPoints(
          this._convertTestPlanTestPointsToTestPoints(this._expectedTestPointsByRootSuite),
          testsResult
        );

        if (currentTestPoints && currentTestPoints.length > 0) {
          const mappedTestPoints = await this._testPointMapper(testsResult.testCase, currentTestPoints);
          if (mappedTestPoints && mappedTestPoints.length > 0) {
            result.set(testsResult, mappedTestPoints);
          } else {
            result.set(testsResult, []);
          }
        } else {
          result.set(testsResult, []);
        }
      }

      return result;
    }

    try {
      const testcaseIds = testsResults.map((t) => t.testCase.testCaseIds.map((id) => parseInt(id, 10))).flat();
      
      // Build points filter with configuration names if available
      const pointsFilter: TestInterfaces.PointsFilter = { 
        testcaseIds: testcaseIds 
      };
      
      // Add configuration names filter if available
      if (this._configurationNames.length > 0) {
        pointsFilter.configurationNames = this._configurationNames;
        this._logger?.info(`Filtering test points by configurations: ${this._configurationNames.join(', ')}`);
      }
      
      const pointsQuery: TestInterfaces.TestPointsQuery = {
        pointsFilter: pointsFilter,
      };
      
      if (!this._testApi) this._testApi = await this._connection.getTestApi();
      const pointsQueryResult: TestInterfaces.TestPointsQuery = await this._testApi.getPointsByQuery(
        pointsQuery,
        this._projectName
      );
      
      if (pointsQueryResult.points) {
        for (const testsResult of testsResults) {
          const currentTestPoints = this._filterTestTestPoints(pointsQueryResult.points, testsResult);

          if (currentTestPoints && currentTestPoints.length > 0) {
            const mappedTestPoints = await this._testPointMapper(testsResult.testCase, currentTestPoints);

            if (mappedTestPoints && mappedTestPoints.length > 0) {
              result.set(testsResult, mappedTestPoints);
            } else {
              result.set(testsResult, []);
            }
          } else {
            result.set(testsResult, []);
          }
        }
      }
    } catch (error: any) {
      this._logger?.error(error.stack);
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

  // prettier-ignore
  private async _getPointsList(testPlanApi: TestPlanApi.ITestPlanApi, project: string, planId: number, suiteId: number, testPointIds?: string, testCaseId?: string, continuationToken?: string, returnIdentityRef?: boolean, includePointDetails?: boolean, isRecursive?: boolean): Promise<VSSInterfaces.PagedList<TestPlanInterfaces.TestPoint>> {
    testPlanApi.getPointsList = function (project, planId, suiteId, testPointIds, testCaseId, continuationToken, returnIdentityRef, includePointDetails, isRecursive) {
      return new Promise(async (resolve, reject) => {
        try {
          const routeValues = { project, planId, suiteId };
          const queryValues = { testPointIds, testCaseId, continuationToken, returnIdentityRef, includePointDetails, isRecursive };
          const verData = await testPlanApi.vsoClient.getVersioningData(
            '7.2-preview.2',
            'testplan',
            '52df686e-bae4-4334-b0ee-b6cf4e6f6b73',
            routeValues,
            queryValues
          );

          let url: string = verData.requestUrl!;
          let options = this.createRequestOptions('application/json', verData.apiVersion);

          let res: restm.IRestResponse<VSSInterfaces.PagedList<TestPlanInterfaces.TestPoint>>;
          res = await this.rest.get<VSSInterfaces.PagedList<TestPlanInterfaces.TestPoint>>(url, options);

          let ret = this.formatResponse(res.result, TestPlanInterfaces.TypeInfo.TestPoint, true);

          // Handle the continuation token
          if (res.headers['x-ms-continuationtoken']) {
            ret.continuationToken = res.headers['x-ms-continuationtoken'];
          }

          resolve(ret);
        } catch (error: any) {
          reject(error);
        }
      });
    };

    const testPlanApiWithOverride = testPlanApi as TestPlanApi.ITestPlanApi;
    return testPlanApiWithOverride.getPointsList(project, planId, suiteId, testPointIds, testCaseId, continuationToken, returnIdentityRef, includePointDetails, isRecursive);
  }

  // prettier-ignore
  private _recursivelyGetPointsList = async (project: string, planId: number, suiteId: number, continuationToken?: string): Promise<TestPlanInterfaces.TestPoint[]> => {
    this._logger?.info(chalk.gray(`${continuationToken ? 'Fetching next' : 'Fetching'} test points.`));
    try {
      const testPlanApi = await this._connection.getTestPlanApi();
      const pointsList = await this._getPointsList(testPlanApi, project, planId, suiteId, undefined, undefined, continuationToken, false, true, true);
      let points: TestPlanInterfaces.TestPoint[] = pointsList;
      if (pointsList?.continuationToken) {
        const nextPoints = await this._recursivelyGetPointsList(project, planId, suiteId, pointsList?.continuationToken);
        points = points.concat(nextPoints);
      }
      return points;
    } catch (error: any) {
      this._logger?.error(error.stack);
      return [];
    }
  };

  private async _retrieveTestPoints() {
    if (this._rootSuiteId) {
      this._logger?.info(`Fetching test points for the root suite ${this._rootSuiteId}`);
      this._logger?.info('This may take a while...');
      this._expectedTestPointsByRootSuite = await this._recursivelyGetPointsList(
        this._projectName,
        this._planId,
        this._rootSuiteId
      );
      if (this._expectedTestPointsByRootSuite.length === 0) {
        this._logger?.warn(
          'No test points found for the specified root suite. Try to ensure that the rootSuiteId, planId are correct and the suite is not empty. Reporting is disabled.'
        );
        this._setIsDisable(true);
      } else {
        this._logger?.info(
          `Fetched test points for the root suite ${this._rootSuiteId}. Total: ${this._expectedTestPointsByRootSuite.length}`
        );
        this._logger?.debug(
          `First 3 Test points: ${JSON.stringify(this._expectedTestPointsByRootSuite.slice(0, 3), null, 2)}`
        );
      }

      this._resolveTestPointsByRootSuite(true);
    }
  }

  private async _uploadAttachmentsFunc(
    testResult: TestResult,
    testCaseResultId: number,
    test: ITestCaseExtended | TestCase
  ): Promise<string[]> {
    this._logger?.info(chalk.gray(`Uploading attachments for test: ${test.title}`));
    const runId = await this._runIdPromise;
    const attachmentsResult: string[] = [];

    if (!runId) {
      throw new Error('Could not find test run id. Check, maybe planId, what you specified, is incorrect.');
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
        this._logger?.error(error.stack);
      }
    }
    this._logger?.info(chalk.gray('Uploaded attachments'));
    return attachmentsResult;
  }

  private async _uploadLogsAttachmentsFunc(
    testResult: TestResult,
    testCaseResultId: number,
    test: ITestCaseExtended | TestCase
  ): Promise<string[]> {
    this._logger?.info(chalk.gray(`Uploading logs attachments for test: ${test.title}`));
    const runId = await this._runIdPromise;
    const attachmentsResult: string[] = [];

    if (!runId) {
      throw new Error('Could not find test run id. Check, maybe planId, what you specified, is incorrect.');
    }

    for (const attachment of testResult.attachments) {
      try {
        if (this._uploadLogs && ['stdout.txt', 'stderr.txt'].includes(attachment.name)) {
          if (attachment.body) {
            const attachmentRequestModel: TestInterfaces.TestAttachmentRequestModel = {
              attachmentType: 'GeneralAttachment',
              fileName: attachment.name,
              stream: attachment.body?.toString('base64'),
            };
            if (!this._testApi) this._testApi = await this._connection.getTestApi();
            const response = await this._testApi.createTestResultAttachment(
              attachmentRequestModel,
              this._projectName,
              runId!,
              testCaseResultId
            );
            if (!response?.id) throw new Error(`Failed to upload log attachment for test: ${test.title}`);
            attachmentsResult.push(response.url);
          } else {
            throw new Error(`Attachment ${attachment.name} does not have body`);
          }
        }
        this._logger?.info(chalk.gray('Uploaded logs attachments'));
      } catch (error: any) {
        this._logger?.error(error.stack);
      }
    }
    return attachmentsResult;
  }

  private _mapToAzureState(test: TestCase, testResult: TestResult): string {
    let status = testResult.status;

    if (status == 'skipped') {
      if (test.annotations.findIndex((e) => e.type === 'fixme') != -1) {
        return EAzureTestStatuses['fixme'];
      } else if (test.annotations.findIndex((e) => e.type === 'skip') != -1) {
        return EAzureTestStatuses['skipped'];
      } else {
        return EAzureTestStatuses['other'];
      }
    } else {
      return EAzureTestStatuses[status];
    }
  }

  private _createTestCaseResult(
    testCase: ITestCaseExtended,
    testResult: TestResult,
    testPoint: TestInterfaces.TestPoint | TestPlanInterfaces.TestPoint
  ): TestInterfaces.TestCaseResult {
    return {
      testPoint: { id: String(testPoint.id) },
      outcome: this._mapToAzureState(testCase, testResult),
      state: 'Completed',
      durationInMs: testResult.duration,
      errorMessage: testResult.error
        ? `${testCase.title}:\n\n${testResult.errors
            ?.map((error, idx) => `ERROR #${idx + 1}:\n${error.message?.replace(/\u001b\[.*?m/g, '')}`)
            .join('\n\n')}`
        : undefined,
      stackTrace: `${testResult.errors
        ?.map((error, idx) => `STACK #${idx + 1}:\n\n${error.stack?.replace(/\u001b\[.*?m/g, '')}`)
        .join('\n\n\n')}`,
    };
  }

  private _prepareLogAttachments(testResult: TestResult) {
    const logAttachments: {
      name: string;
      contentType: string;
      body?: Buffer;
    }[] = [];

    if (testResult.stdout && testResult.stdout.length > 0) {
      this._logger?.debug(`[prepareLogAttachments] stdout: ${testResult.stdout.join('')}`);
      logAttachments.push({
        name: 'stdout.txt',
        contentType: 'text/plain',
        body: Buffer.from(testResult.stdout.join('')),
      });
    }
    if (testResult.stderr && testResult.stderr.length > 0) {
      this._logger?.debug(`[prepareLogAttachments] stderr: ${testResult.stderr.join('')}`);
      logAttachments.push({
        name: 'stderr.txt',
        contentType: 'text/plain',
        body: Buffer.from(testResult.stderr.join('')),
      });
    }
    return logAttachments;
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
      this._logger?.info(chalk.gray(`Start publishing: ${test.title}`));
      const toBePublished: TTestResultsToBePublished = { testCase: testCase, testResult };
      const mappedTestPoints = (await this._getTestPointsOfTestResults([toBePublished])).get(toBePublished);
      this._logger?.debug(`[publishCaseResult] Mapped test points: ${JSON.stringify(mappedTestPoints, null, 2)}`);

      if (!mappedTestPoints || mappedTestPoints.length == 0) {
        throw new Error(
          `No test points found for test case [${testCase.testCaseIds}] associated with test plan ${this._planId} ${
            this._testRunConfig?.configurationIds
              ? `for configurations [${this._testRunConfig?.configurationIds?.join(', ')}]`
              : ''
          }\nCheck, maybe testPlanId or assigned configurations per test case, what you specified, is incorrect.\n Also check testPointMapper function.`
        );
      }
      this._publishedResultsCount.points += mappedTestPoints?.length || 0;

      const results: TestInterfaces.TestCaseResult[] = mappedTestPoints.map((testPoint) =>
        this._createTestCaseResult(testCase, testResult, testPoint)
      );

      if (!this._testApi) this._testApi = await this._connection.getTestApi();
      const testCaseResult: TestResultsToTestRun = (await this._addReportingOverride(
        this._testApi
      ).addTestResultsToTestRun(results, this._projectName, runId!)) as unknown as TestResultsToTestRun;

      if (!testCaseResult?.result) throw new Error(`Failed to publish test result for test cases [${caseIds}]`);

      if (this._uploadAttachments && testResult.attachments.length > 0)
        await this._uploadAttachmentsFunc(testResult, testCaseResult.result.value![0].id, test);

      if (this._uploadLogs) {
        this._logger?.info(chalk.gray(`Uploading stdout.log for test: ${test.title}`));
        const logAttachment = this._prepareLogAttachments(testResult);
        await this._uploadLogsAttachmentsFunc(
          { ...testResult, attachments: logAttachment },
          testCaseResult.result.value![0].id,
          test
        );
      }

      this._removePublished(testCase.testAlias);
      this._publishedResultsCount.tests++;
      this._logger?.info(chalk.gray(`Result published: ${test.title}`));
      return testCaseResult;
    } catch (error: any) {
      this._removePublished(testCase.testAlias);
      this._logger?.error(error.stack);
    }
  }

  private async _publishTestRunResults(runId: number, testsResults: TTestResultsToBePublished[]) {
    if (!this._testApi) this._testApi = await this._connection.getTestApi();

    const testsPackSize = 50;
    const testsEndPack = Math.ceil(testsResults.length / testsPackSize);
    const testsPacksArray = Array.from({ length: testsEndPack }, (_, i) =>
      testsResults.slice(i * testsPackSize, (i + 1) * testsPackSize)
    );

    let testResultsQuery: TestInterfaces.TestResultsQuery;
    let resultData: TestInterfaces.TestResultsQuery = { results: [] };

    this._logger?.info(chalk.gray(`Start publishing test results for ${testsResults.length} test(s)`), true);

    if (this._rootSuiteId) {
      await this._retrieveTestPoints();
      await this._testPointsByRootSuitePromise;
    }

    try {
      for (const testsPack of testsPacksArray) {
        let testCaseIds: string[] = [];
        const withAttachmentsByTestPoint = new Map<
          TestInterfaces.TestPoint | TestPlanInterfaces.TestPoint,
          TTestResultsToBePublished[]
        >();
        const testsPointsByTestCase = await this._getTestPointsOfTestResults(testsPack);
        const testCaseResults: TestInterfaces.TestCaseResult[] = [];

        for (const [key, value] of testsPointsByTestCase.entries()) {
          const testCase = key.testCase;
          const testResult = key.testResult;
          const testPoints = value;

          if (testPoints && testPoints.length > 0) {
            testCaseIds.push(...testCase.testCaseIds);
            testCaseResults.push(
              ...testPoints.map((testPoint) => this._createTestCaseResult(testCase, testResult, testPoint))
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
            this._logger?.warn(
              `No test points found for test case [${testCase.testCaseIds}] associated with test plan ${this._planId} ${
                this._testRunConfig?.configurationIds
                  ? `for configurations [${this._testRunConfig?.configurationIds?.join(', ')}]`
                  : ''
              }\nCheck, maybe testPlanId or assigned configurations per test case, what you specified, is incorrect.\n Also check testPointMapper function.`
            );
          }
        }

        if (testCaseResults.length === 0) {
          continue;
        }
        this._publishedResultsCount.points += testCaseResults.length;

        const testCaseResult: TestResultsToTestRun = (await this._addReportingOverride(
          this._testApi
        ).addTestResultsToTestRun(testCaseResults, this._projectName, runId!)) as unknown as TestResultsToTestRun;

        if (!testCaseResult.result) {
          this._logger?.warn(`Failed to publish test result for test cases [${testCaseIds.join(', ')}]`);
        } else if (testCaseResult.result.count !== testCaseResults.length) {
          this._logger?.warn(`Not all test result for test cases [${testCaseIds.join(', ')}] are published`);
        }

        if ((this._uploadAttachments && withAttachmentsByTestPoint.size > 0) || this._uploadLogs) {
          testResultsQuery = {
            fields: [''],
            results: testCaseResult.result.value?.map((r) => {
              return { id: r.id, testRun: { id: r.testRun?.id } };
            }),
          };
          resultData = await this._testApi.getTestResultsByQuery(testResultsQuery, this._projectName);
        }

        if (this._uploadAttachments && withAttachmentsByTestPoint.size > 0) {
          this._logger?.info(
            chalk.gray(`Starting to uploading attachments for ${withAttachmentsByTestPoint.size} testpoint(s)`)
          );

          for (const [key, value] of withAttachmentsByTestPoint.entries()) {
            const testResult = resultData.results?.find((result) => result.testPoint?.id === String(key.id));

            if (!testResult) {
              this._logger?.warn(`Test result for test point [${key.id}] is missing, attachments are not uploaded!`);
              continue;
            }

            for (const withAttachments of value) {
              await this._uploadAttachmentsFunc(withAttachments.testResult, testResult.id!, withAttachments.testCase);
            }
          }
        }

        if (this._uploadLogs && testsPack.length > 0) {
          this._logger?.info(chalk.gray(`Starting to uploading logs for ${testsPack.length} test(s)`));
          for (const [testWithResult, testPoints] of testsPointsByTestCase.entries()) {
            for (const testPoint of testPoints) {
              const testResult = resultData.results?.find((result) => result.testPoint?.id === String(testPoint.id));
              if (!testResult) {
                this._logger?.warn(`Test result for test point [${testPoint.id}] is missing, logs are not uploaded!`);
                continue;
              }

              const logAttachment = this._prepareLogAttachments(testWithResult.testResult);
              await this._uploadLogsAttachmentsFunc(
                { ...testWithResult.testResult, attachments: logAttachment },
                testResult.id!,
                testWithResult.testCase
              );
            }
          }
        }

        this._publishedResultsCount.tests += testsPack.length;
        this._logger?.info(chalk.gray(`Left to publish: ${testsResults.length - this._publishedResultsCount.tests}`));
      }

      this._resolvePublishResults();
    } catch (error: any) {
      this._logger?.error(error.stack);
      this._rejectPublishResults(error);
    }
  }

  private _setAzurePWTestRunId(runId: number): void {
    process.env.AZURE_PW_TEST_RUN_ID = String(runId);
    setVariable('AZURE_PW_TEST_RUN_ID', String(runId), false, true);
  }
}

export default AzureDevOpsReporter;
