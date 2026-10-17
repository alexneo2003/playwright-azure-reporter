import path from 'path';

import AzureDevOpsReporter from '../../dist/playwright-azure-reporter';
import {
  compareVersions,
  describeIssue,
  detectPlaywrightVersion,
  evaluateCompatibility,
  FEATURE_MATRIX,
  FeatureRequirement,
  formatFeatureMatrix,
  formatStrictModeError,
  parseVersion,
  satisfies,
} from '../../src/compat';
import { expect, test } from './test-fixtures';

const matrix: FeatureRequirement[] = [
  { id: 'base', since: '1.10.0', level: 'required', provides: 'x', fallback: 'off' },
  { id: 'base.extra', since: '1.63.0', level: 'enrichment', provides: 'y', fallback: 'less' },
];

test.describe('compat: versions', () => {
  test('parseVersion accepts semver and two-part versions', () => {
    expect(parseVersion('1.64.0')).toEqual([1, 64, 0]);
    expect(parseVersion('1.64')).toEqual([1, 64, 0]);
    expect(parseVersion('1.64.0-beta-1791325510000')).toEqual([1, 64, 0]);
    expect(parseVersion('next')).toBeUndefined();
  });

  test('compareVersions orders numerically, not lexically', () => {
    expect(compareVersions('1.9.0', '1.10.0')).toBeLessThan(0);
    expect(compareVersions('1.63.0', '1.63.0')).toBe(0);
    expect(compareVersions('1.64.1', '1.64.0')).toBeGreaterThan(0);
    expect(() => compareVersions('x', '1.0.0')).toThrow(/Cannot compare/);
  });

  test('satisfies is inclusive of the minimum', () => {
    expect(satisfies('1.63.0', '1.63.0')).toBe(true);
    expect(satisfies('1.62.9', '1.63.0')).toBe(false);
    expect(satisfies('2.0.0', '1.63.0')).toBe(true);
  });
});

test.describe('compat: detectPlaywrightVersion', () => {
  test('finds the @playwright/test installed next to the reporter', () => {
    const detected = detectPlaywrightVersion();
    expect(detected).toBeDefined();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    expect(detected!.version).toBe(require('@playwright/test/package.json').version);
    expect(detected!.source.replace(/\\/g, '/')).toContain('@playwright/test/package.json');
  });

  test('falls back to the playwright package and returns undefined when nothing resolves', () => {
    const resolver = (request: string) => {
      if (request === 'playwright/package.json') return path.join(__dirname, 'assets', 'fake-playwright.json');
      throw new Error('not found');
    };
    const detected = detectPlaywrightVersion(['/nowhere'], resolver);
    expect(detected).toEqual({ version: '1.42.1', source: path.join(__dirname, 'assets', 'fake-playwright.json') });

    const nothing = detectPlaywrightVersion(['/nowhere'], () => {
      throw new Error('not found');
    });
    expect(nothing).toBeUndefined();
  });
});

test.describe('compat: evaluateCompatibility', () => {
  const at = (version: string) => ({ version, source: 'test' });

  test('reports nothing when every requested feature is satisfied', () => {
    expect(evaluateCompatibility(at('1.64.0'), ['base', 'base.extra'], matrix)).toEqual([]);
  });

  test('reports only the features that are requested and unmet', () => {
    const issues = evaluateCompatibility(at('1.55.0'), ['base', 'base.extra'], matrix);
    expect(issues.map((i) => i.feature.id)).toEqual(['base.extra']);
    expect(evaluateCompatibility(at('1.55.0'), ['base'], matrix)).toEqual([]);
  });

  test('reports required features below their minimum', () => {
    const issues = evaluateCompatibility(at('1.9.0'), ['base', 'base.extra'], matrix);
    expect(issues.map((i) => [i.feature.id, i.feature.level])).toEqual([
      ['base', 'required'],
      ['base.extra', 'enrichment'],
    ]);
  });

  test('ignores unknown feature ids and unknown versions', () => {
    expect(evaluateCompatibility(at('1.0.0'), ['does-not-exist'], matrix)).toEqual([]);
    expect(evaluateCompatibility(undefined, ['base'], matrix)).toEqual([]);
  });

  test('describeIssue and formatStrictModeError name version, source and fallback', () => {
    const issues = evaluateCompatibility({ version: '1.55.0', source: '/p/package.json' }, ['base.extra'], matrix);
    expect(describeIssue(issues[0])).toBe(
      'base.extra requires Playwright >= 1.63.0 (y); enrichment feature, fallback: less'
    );
    const message = formatStrictModeError(issues);
    expect(message).toContain('Playwright 1.55.0 (/p/package.json) does not satisfy the enabled features');
    expect(message).toContain('  - base.extra requires Playwright >= 1.63.0');
    expect(message).toContain("set compatibility: 'lenient'");
  });
});

test.describe('compat: feature matrix', () => {
  test('every entry is well formed and sorted by id', () => {
    for (const feature of FEATURE_MATRIX) {
      expect(parseVersion(feature.since)).toBeDefined();
      expect(['required', 'enrichment']).toContain(feature.level);
      expect(feature.id.length).toBeGreaterThan(0);
      expect(feature.provides.length).toBeGreaterThan(0);
      expect(feature.fallback.length).toBeGreaterThan(0);
    }
    const ids = FEATURE_MATRIX.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([...ids].sort());
  });

  test('formatFeatureMatrix renders a four column table with one row per feature', () => {
    const rows = formatFeatureMatrix().split('\n');
    expect(rows[0]).toBe('| Feature | Playwright | Level | If Playwright is older |');
    expect(rows[1]).toBe('|:---|:---|:---|:---|');
    expect(rows).toHaveLength(2 + FEATURE_MATRIX.length);
    FEATURE_MATRIX.forEach((feature, index) => {
      expect(rows[2 + index]).toBe(
        `| \`${feature.id}\`<br>${feature.provides} | >= ${feature.since} | ${feature.level} | ${feature.fallback} |`
      );
    });
  });

  test('formatFeatureMatrix keeps every cell on its row: pipes are escaped, newlines flattened', () => {
    const tricky: FeatureRequirement[] = [
      { id: 'x', since: '1.0.0', level: 'required', provides: 'a | b\nc', fallback: 'd\r\n  e | f' },
    ];
    const [, , row] = formatFeatureMatrix(tricky).split('\n');
    expect(row).toBe('| `x`<br>a \\| b c | >= 1.0.0 | required | d e \\| f |');
    // header + separator + exactly one data row
    expect(formatFeatureMatrix(tricky).split('\n')).toHaveLength(3);
  });

  test('README carries the generated matrix', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const readme = require('fs').readFileSync(path.join(__dirname, '..', '..', 'README.md'), 'utf8') as string;
    expect(
      readme,
      'README "Playwright Compatibility" is out of date: run `yarn build && yarn feature-matrix` and paste the output'
    ).toContain(formatFeatureMatrix());
  });
});

test.describe('compat: reporter policies', () => {
  const baseOptions = {
    orgUrl: 'https://dev.azure.com/test',
    projectName: 'test-project',
    planId: 123,
    token: 'test-token',
  };

  test('lenient: a required feature below its minimum is switched off', () => {
    const reporter: any = new AzureDevOpsReporter({ ...baseOptions, publishTestSteps: true });
    expect(reporter._publishTestSteps).toBe(true);
    reporter._applyCompatibility({ version: '1.9.0', source: 'test' });
    expect(reporter._publishTestSteps).toBe(false);
  });

  test('lenient: an enrichment below its minimum keeps the feature on', () => {
    const reporter: any = new AzureDevOpsReporter({ ...baseOptions, publishTestSteps: true });
    reporter._applyCompatibility({ version: '1.55.0', source: 'test' });
    expect(reporter._publishTestSteps).toBe(true);
  });

  test('strict: an unmet requirement throws with the full report', () => {
    // Built leniently on purpose: with compatibility: 'strict' the constructor itself would throw
    // when the installed Playwright is older than 1.63.
    const reporter: any = new AzureDevOpsReporter({
      ...baseOptions,
      publishTestSteps: { enabled: true, alignWithTestCase: false },
    });
    reporter._compatibility = 'strict';
    expect(() => reporter._applyCompatibility({ version: '1.55.0', source: '/p/package.json' })).toThrow(
      /publishTestSteps\.params requires Playwright >= 1\.63\.0/
    );
    expect(() => reporter._applyCompatibility({ version: '1.64.0', source: '/p/package.json' })).not.toThrow();
  });

  test('unknown Playwright version never throws, even in strict mode', () => {
    const reporter: any = new AzureDevOpsReporter({ ...baseOptions, publishTestSteps: true });
    reporter._compatibility = 'strict';
    expect(() => reporter._applyCompatibility(undefined)).not.toThrow();
    expect(reporter._publishTestSteps).toBe(true);
  });

  test('no feature is requested for a disabled reporter', () => {
    const reporter: any = new AzureDevOpsReporter({ ...baseOptions, isDisabled: true, publishTestSteps: true });
    expect(reporter._playwrightVersion).toBeUndefined();
  });
});
