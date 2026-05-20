import { TestCase } from '@playwright/test/reporter';

import AzureDevOpsReporter from '../../dist/playwright-azure-reporter';
import { getExtensionFromContentType, getExtensionFromFilename, getMimeTypeFromFilename } from '../../src/utils';
import { expect, test } from './test-fixtures';

test.describe('Reporter utils', () => {
  test('getMimeTypeFromFilename', async () => {
    expect(getMimeTypeFromFilename('test.png')).toBe('image/png');
    expect(getMimeTypeFromFilename('test.jpg')).toBe('image/jpeg');
    expect(getMimeTypeFromFilename('test.jpeg')).toBe('image/jpeg');
    expect(getMimeTypeFromFilename('test.gif')).toBe('image/gif');
    expect(getMimeTypeFromFilename('test.txt')).toBe('text/plain');
    expect(getMimeTypeFromFilename('test.html')).toBe('text/html');
    expect(getMimeTypeFromFilename('test.xml')).toBe('application/xml');
    expect(getMimeTypeFromFilename('test.json')).toBe('application/json');
    expect(getMimeTypeFromFilename('test.pdf')).toBe('application/pdf');
    expect(getMimeTypeFromFilename('')).toBe('application/octet-stream');
  });

  test('getExtensionFromFilename', async () => {
    expect(getExtensionFromFilename('test.png')).toBe('png');
    expect(getExtensionFromFilename('test.jpg')).toBe('jpeg');
    expect(getExtensionFromFilename('test.jpeg')).toBe('jpeg');
    expect(getExtensionFromFilename('test.gif')).toBe('gif');
    expect(getExtensionFromFilename('test.txt')).toBe('txt');
    expect(getExtensionFromFilename('test.html')).toBe('html');
    expect(getExtensionFromFilename('test.xml')).toBe('xml');
    expect(getExtensionFromFilename('test.json')).toBe('json');
    expect(getExtensionFromFilename('test.pdf')).toBe('pdf');
    expect(getExtensionFromFilename('')).toBe('bin');
  });

  test('getExtensionFromContentType', async () => {
    expect(getExtensionFromContentType('image/png')).toBe('png');
    expect(getExtensionFromContentType('image/jpeg')).toBe('jpeg');
    expect(getExtensionFromContentType('image/gif')).toBe('gif');
    expect(getExtensionFromContentType('text/plain')).toBe('txt');
    expect(getExtensionFromContentType('text/html')).toBe('html');
    expect(getExtensionFromContentType('application/xml')).toBe('xml');
    expect(getExtensionFromContentType('application/json')).toBe('json');
    expect(getExtensionFromContentType('application/pdf')).toBe('pdf');
    expect(getExtensionFromContentType('')).toBe('bin');
  });
});

test.describe('Reporter TestCase Extension', () => {
  test('_createExtendedTestCase preserves all TestCase interface properties', async () => {
    // Create a mock TestCase object with all interface properties
    const mockTestCase: TestCase & { _tags: string[]; _grepBaseTitlePath: () => string[] } = {
      // Basic properties
      id: 'test-id-123',
      title: 'Test with tags @[123], @tagOne, @tagTwo',
      expectedStatus: 'passed',
      timeout: 30000,
      annotations: [
        { type: 'slow', description: 'This test is slow' },
        { type: 'skip', description: 'Skip in CI' },
      ],
      retries: 2,
      repeatEachIndex: 0,
      results: [],
      type: 'test' as const,
      location: { file: '/test/file.spec.ts', line: 10, column: 5 },
      parent: {} as any, // Mock suite

      // Mock private properties and methods that the getter uses
      _tags: ['@tagOne', '@tagTwo'],
      _grepBaseTitlePath: function () {
        return ['Suite', 'Nested Suite', this.title];
      },

      // Mock getter: tags (matching actual Playwright implementation)
      get tags(): string[] {
        const titleTags =
          this._grepBaseTitlePath()
            .join(' ')
            .match(/@[\S]+/g) || [];
        return [...titleTags, ...this._tags];
      },

      // Mock methods
      ok: function () {
        return true;
      },
      outcome: function () {
        return 'expected' as const;
      },
      titlePath: function () {
        return ['Suite', 'Nested Suite', this.title];
      },
    };

    // Create a minimal reporter instance to access the private method
    const reporterOptions = {
      orgUrl: 'https://dev.azure.com/test',
      projectName: 'test-project',
      planId: 123,
      token: 'test-token',
      isDisabled: true, // Disable to avoid actual API calls
    };

    const reporter = new AzureDevOpsReporter(reporterOptions);

    // Access the private method using type assertion
    const createExtendedTestCase = (reporter as any)._createExtendedTestCase.bind(reporter);

    // Test the method
    const testAlias = 'alias-123 - Test with tags';
    const testCaseIds = ['123', '456'];

    const extendedTestCase = createExtendedTestCase(mockTestCase, testAlias, testCaseIds);

    // Verify all original properties are preserved
    expect(extendedTestCase.id).toBe('test-id-123');
    expect(extendedTestCase.title).toBe('Test with tags @[123], @tagOne, @tagTwo');
    expect(extendedTestCase.expectedStatus).toBe('passed');
    expect(extendedTestCase.timeout).toBe(30000);
    expect(extendedTestCase.annotations).toEqual([
      { type: 'slow', description: 'This test is slow' },
      { type: 'skip', description: 'Skip in CI' },
    ]);
    expect(extendedTestCase.retries).toBe(2);
    expect(extendedTestCase.repeatEachIndex).toBe(0);
    expect(extendedTestCase.results).toEqual([]);
    expect(extendedTestCase.type).toBe('test');
    expect(extendedTestCase.location).toEqual({ file: '/test/file.spec.ts', line: 10, column: 5 });

    // Verify getter properties are preserved
    expect(extendedTestCase.tags).toEqual(['@[123],', '@tagOne,', '@tagTwo', '@tagOne', '@tagTwo']);

    // Verify methods are preserved and work correctly
    expect(typeof extendedTestCase.ok).toBe('function');
    expect(extendedTestCase.ok()).toBe(true);

    expect(typeof extendedTestCase.outcome).toBe('function');
    expect(extendedTestCase.outcome()).toBe('expected');

    expect(typeof extendedTestCase.titlePath).toBe('function');
    expect(extendedTestCase.titlePath()).toEqual(['Suite', 'Nested Suite', 'Test with tags @[123], @tagOne, @tagTwo']);

    // Verify extended properties are added
    expect(extendedTestCase.testAlias).toBe('alias-123 - Test with tags');
    expect(extendedTestCase.testCaseIds).toEqual(['123', '456']);
  });

  test('_createExtendedTestCase works with testPointMapper function', async () => {
    // Create a mock TestCase with tags
    const mockTestCase: TestCase & { _tags: string[]; _grepBaseTitlePath: () => string[] } = {
      id: 'test-id-with-tags',
      title: 'Test for configuration mapping',
      expectedStatus: 'passed',
      timeout: 30000,
      annotations: [],
      retries: 0,
      repeatEachIndex: 0,
      results: [],
      type: 'test' as const,
      location: { file: '/test/file.spec.ts', line: 20, column: 5 },
      parent: {} as any,

      // Mock private properties and methods that the getter uses
      _tags: ['@tagOne', '@tagTwo'],
      _grepBaseTitlePath: function () {
        return [this.title];
      },

      // Mock tags getter that returns configuration tags
      get tags(): string[] {
        const titleTags =
          this._grepBaseTitlePath()
            .join(' ')
            .match(/@[\S]+/g) || [];
        return [...titleTags, ...this._tags];
      },

      ok: function () {
        return true;
      },
      outcome: function () {
        return 'expected' as const;
      },
      titlePath: function () {
        return ['Suite', this.title];
      },
    };

    // Create reporter instance
    const reporterOptions = {
      orgUrl: 'https://dev.azure.com/test',
      projectName: 'test-project',
      planId: 123,
      token: 'test-token',
      isDisabled: true,
      // Test the exact testPointMapper from the user's example
      testPointMapper: async (testCase: TestCase, testPoints: any[]) => {
        const tag = testCase.tags.map((t: string) => t.toLowerCase());
        const tagOne = tag.includes('@tagone');
        const tagTwo = tag.includes('@tagtwo');

        if (tagOne && tagTwo) {
          return testPoints.filter((tp) => tp.configuration.id === '3' || tp.configuration.id === '17');
        } else if (tagOne) {
          return testPoints.filter((tp) => tp.configuration.id === '3');
        } else if (tagTwo) {
          return testPoints.filter((tp) => tp.configuration.id === '17');
        } else {
          throw new Error('invalid test configuration!');
        }
      },
    };

    const reporter = new AzureDevOpsReporter(reporterOptions);
    const createExtendedTestCase = (reporter as any)._createExtendedTestCase.bind(reporter);

    // Create extended test case
    const extendedTestCase = createExtendedTestCase(mockTestCase, 'alias-test', ['153860', '153875']);

    // Mock test points
    const mockTestPoints = [
      { configuration: { id: '3' }, id: 'tp1' },
      { configuration: { id: '17' }, id: 'tp2' },
      { configuration: { id: '5' }, id: 'tp3' },
    ];

    // Test that the testPointMapper works with the extended test case
    const testPointMapper = reporterOptions.testPointMapper;
    const filteredPoints = await testPointMapper(extendedTestCase, mockTestPoints);

    // Should return both configuration 3 and 17 since both tagOne and tagTwo are present
    expect(filteredPoints).toHaveLength(2);
    expect(filteredPoints.map((tp) => tp.configuration.id)).toEqual(['3', '17']);

    // Verify that tags property is accessible and works as expected
    expect(extendedTestCase.tags).toEqual(['@tagOne', '@tagTwo']);

    // Verify the tag filtering logic works
    const tag = extendedTestCase.tags.map((t: string) => t.toLowerCase());
    expect(tag.includes('@tagone')).toBe(true);
    expect(tag.includes('@tagtwo')).toBe(true);
  });
});
