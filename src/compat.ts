/**
 * Feature matrix: which reporter features need which Playwright version, and what to do when
 * the installed Playwright is older than a feature requires.
 *
 * Two policies exist:
 * - `lenient` (default): a `required` feature that cannot work is switched off with a warning,
 *   an `enrichment` that cannot work is reported once and the feature keeps running without it.
 * - `strict`: any unmet requirement is a configuration error. The reporter throws from its
 *   constructor, which makes Playwright exit before the first test runs. Errors thrown from the
 *   reporter hooks are swallowed by Playwright, so the constructor is the only place where a
 *   hard stop is possible.
 */

export type CompatibilityPolicy = 'strict' | 'lenient';

export type FeatureLevel = 'required' | 'enrichment';

export interface FeatureRequirement {
  /** Stable identifier, also used in log messages. */
  id: string;
  /** Lowest Playwright version that provides what the feature needs. */
  since: string;
  /**
   * `required`: the feature cannot work at all below `since`.
   * `enrichment`: the feature works, but part of its output is unavailable below `since`.
   */
  level: FeatureLevel;
  /** What Playwright provides from `since` on. */
  provides: string;
  /** What happens below `since` in lenient mode. */
  fallback: string;
}

/**
 * The feature matrix. Keep entries sorted by `id`.
 * README.md "Playwright compatibility" is generated from this list with `yarn feature-matrix`.
 */
export const FEATURE_MATRIX: readonly FeatureRequirement[] = [
  {
    id: 'publishGlobalErrors.worker',
    since: '1.60.0',
    level: 'enrichment',
    provides: 'the project and worker index of worker errors in Reporter.onError',
    fallback: 'errors are reported without project and worker index',
  },
  {
    id: 'publishTestSteps',
    since: '1.10.0',
    level: 'required',
    provides: 'TestResult.steps and the TestStep API',
    fallback: 'step publishing is switched off',
  },
  {
    id: 'publishTestSteps.params',
    since: '1.63.0',
    level: 'enrichment',
    provides: 'TestStep.params and TestStep.subtitle (test.step options)',
    fallback: 'steps are published without iteration parameters and subtitles',
  },
  {
    id: 'testCaseIdZone.title.tags',
    since: '1.42.0',
    level: 'enrichment',
    provides: 'TestCase.tags, so test case ids can be declared with tag: ["@[123]"]',
    fallback: 'ids are read from test titles only',
  },
  {
    id: 'testRunContext.tags',
    since: '1.57.0',
    level: 'enrichment',
    provides: 'FullConfig.tags, the tags of the Playwright config',
    fallback: 'run tags are not taken from the Playwright config',
  },
];

export interface PlaywrightVersionInfo {
  version: string;
  /** Path of the package.json the version was read from. */
  source: string;
}

export interface CompatibilityIssue {
  feature: FeatureRequirement;
  actual: PlaywrightVersionInfo;
}

export type ParsedVersion = [number, number, number];

export function parseVersion(version: string): ParsedVersion | undefined {
  const match = /^(\d+)\.(\d+)(?:\.(\d+))?/.exec(version.trim());
  if (!match) return undefined;
  return [parseInt(match[1], 10), parseInt(match[2], 10), parseInt(match[3] ?? '0', 10)];
}

/** Returns a negative number when `a` is older than `b`, 0 when equal, positive when newer. */
export function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa || !pb) throw new Error(`Cannot compare versions "${a}" and "${b}"`);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

export function satisfies(version: string, since: string): boolean {
  return compareVersions(version, since) >= 0;
}

type Resolver = (request: string, options: { paths: string[] }) => string;

/**
 * Finds the Playwright installation the reporter runs with. Resolution starts from the working
 * directory (the user's project) and then from the reporter's own location, which covers both
 * a project install and a monorepo with hoisted dependencies.
 */
export function detectPlaywrightVersion(
  searchPaths: string[] = [process.cwd(), __dirname],
  resolver: Resolver = (request, options) => require.resolve(request, options)
): PlaywrightVersionInfo | undefined {
  for (const pkg of ['@playwright/test/package.json', 'playwright/package.json']) {
    let source: string;
    try {
      source = resolver(pkg, { paths: searchPaths });
    } catch {
      continue;
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const version = (require(source) as { version?: unknown }).version;
      if (typeof version === 'string' && parseVersion(version)) return { version, source };
    } catch {
      continue;
    }
  }
  return undefined;
}

/**
 * Checks the requested features against the installed Playwright version.
 * Unknown feature ids are ignored, unknown versions produce no issues.
 */
export function evaluateCompatibility(
  actual: PlaywrightVersionInfo | undefined,
  requestedFeatureIds: Iterable<string>,
  matrix: readonly FeatureRequirement[] = FEATURE_MATRIX
): CompatibilityIssue[] {
  if (!actual) return [];
  const requested = new Set(requestedFeatureIds);
  return matrix
    .filter((feature) => requested.has(feature.id) && !satisfies(actual.version, feature.since))
    .map((feature) => ({ feature, actual }));
}

export function describeIssue(issue: CompatibilityIssue): string {
  const { feature } = issue;
  return `${feature.id} requires Playwright >= ${feature.since} (${feature.provides}); ${feature.level} feature, fallback: ${feature.fallback}`;
}

/** The message of the error thrown in strict mode. */
export function formatStrictModeError(issues: CompatibilityIssue[]): string {
  const { actual } = issues[0];
  const lines = issues.map((issue) => `  - ${describeIssue(issue)}`);
  return (
    `[playwright-azure-reporter] Playwright ${actual.version} (${actual.source}) does not satisfy the enabled features:\n` +
    `${lines.join('\n')}\n` +
    `Upgrade Playwright, disable the feature(s), or set compatibility: 'lenient'.`
  );
}

/** Keeps a value on one table row: pipes would split the cell, newlines would end the row. */
function escapeTableCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\s*\r?\n\s*/g, ' ');
}

/**
 * Markdown table of the feature matrix, used for README.md.
 *
 * Four columns on purpose: GitHub scrolls tables sideways when they are wider than the README column.
 * The feature id and what it needs share one cell (id on the first line) instead of getting a column each.
 */
export function formatFeatureMatrix(matrix: readonly FeatureRequirement[] = FEATURE_MATRIX): string {
  const header = '| Feature | Playwright | Level | If Playwright is older |\n|:---|:---|:---|:---|';
  const rows = matrix.map((f) => {
    const feature = `\`${f.id}\`<br>${escapeTableCell(f.provides)}`;
    return `| ${feature} | >= ${f.since} | ${f.level} | ${escapeTableCell(f.fallback)} |`;
  });
  return [header, ...rows].join('\n');
}
