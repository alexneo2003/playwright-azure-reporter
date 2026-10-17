/**
 * Errors that Playwright reports outside of a test (`Reporter.onError`): a failing `globalSetup`,
 * a worker fixture that throws in teardown, `--max-failures` stopping the run, a crashed worker.
 *
 * This module is pure: it only cleans, de-duplicates and formats what it is given, and `add` never throws,
 * so the reporter hook that feeds it cannot fail a run.
 */

export const DEFAULT_MAX_GLOBAL_ERRORS = 20;
/** Upper bound of the run `errorMessage`. */
export const ERROR_MESSAGE_MAX_LENGTH = 1000;

const MAX_MESSAGE_LENGTH = 4000;
const MAX_STACK_LENGTH = 3000;
const MAX_SNIPPET_LENGTH = 1500;
const MAX_FIELD_LENGTH = 500;

export interface CollectedGlobalError {
  message: string;
  stack?: string;
  /** `file:line:column`, as far as Playwright provides it. */
  location?: string;
  snippet?: string;
  project?: string;
  workerIndex?: number;
  parallelIndex?: number;
  /** How many identical errors were reported. */
  count: number;
}

export interface GlobalErrorsReportContext {
  /** `FullResult.status`. */
  status?: string;
  /** `FullResult.duration` in milliseconds. */
  durationMs?: number;
  /** Title of the Azure DevOps test run. */
  runTitle?: string;
}

// eslint-disable-next-line no-control-regex
const ANSI_PATTERN = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;

function stripAnsiCodes(text: string): string {
  return text.replace(ANSI_PATTERN, '');
}

function cap(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}... [truncated ${text.length - max} characters]` : text;
}

function asText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = stripAnsiCodes(value).replace(/\r\n/g, '\n').trim();
  return text.length > 0 ? text : undefined;
}

function asIndex(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined;
}

function firstLine(text: string): string {
  return (
    text
      .split('\n')
      .find((line) => line.trim().length > 0)
      ?.trim() ?? text
  );
}

function formatLocation(location: unknown): string | undefined {
  if (!location || typeof location !== 'object') return undefined;
  const { file, line, column } = location as { file?: unknown; line?: unknown; column?: unknown };
  if (typeof file !== 'string' || file.length === 0) return undefined;
  let result = cap(file, MAX_FIELD_LENGTH);
  if (typeof line === 'number') {
    result += `:${line}`;
    if (typeof column === 'number') result += `:${column}`;
  }
  return result;
}

/** A code fence that cannot be closed by the text inside of it. */
function fence(text: string): string {
  const longestRun = Math.max(2, ...(text.match(/`+/g) ?? []).map((run) => run.length));
  const marker = '`'.repeat(longestRun + 1);
  return `${marker}\n${text}\n${marker}`;
}

export class GlobalErrorCollector {
  private readonly _errors = new Map<string, CollectedGlobalError>();
  private _omitted = 0;
  private readonly _maxErrors: number;

  constructor(maxErrors: number = DEFAULT_MAX_GLOBAL_ERRORS) {
    this._maxErrors = Number.isInteger(maxErrors) && maxErrors > 0 ? maxErrors : DEFAULT_MAX_GLOBAL_ERRORS;
  }

  /** Every error reported, duplicates and omitted ones included. */
  get total(): number {
    let total = this._omitted;
    for (const error of this._errors.values()) total += error.count;
    return total;
  }

  /** Reported errors that are not part of `errors` because of `maxErrors`. */
  get omitted(): number {
    return this._omitted;
  }

  get errors(): readonly CollectedGlobalError[] {
    return [...this._errors.values()];
  }

  /**
   * Stores one `onError` call. Accepts anything: a TestError, an Error, a string, garbage.
   * Never throws.
   */
  add(error: unknown, workerInfo?: unknown): void {
    try {
      const entry = this._normalize(error, workerInfo);
      const key = [entry.message, entry.stack ?? '', entry.project ?? ''].join('\u0000');
      const existing = this._errors.get(key);
      if (existing) {
        existing.count++;
      } else if (this._errors.size >= this._maxErrors) {
        this._omitted++;
      } else {
        this._errors.set(key, entry);
      }
    } catch {
      this._omitted++;
    }
  }

  /** One line for the `errorMessage` of the run. Empty when nothing was reported. */
  summary(maxLength: number = ERROR_MESSAGE_MAX_LENGTH): string {
    const total = this.total;
    if (total === 0) return '';
    const first = this._errors.values().next().value as CollectedGlobalError | undefined;
    const head = `Playwright reported ${total} error(s) outside of tests.`;
    const text = first ? `${head} First: ${firstLine(first.message)}` : head;
    return text.length > maxLength ? `${text.slice(0, Math.max(0, maxLength - 3))}...` : text;
  }

  /** Markdown with every collected error, uploaded as a run attachment. */
  report(context: GlobalErrorsReportContext = {}): string {
    const total = this.total;
    const lines: string[] = ['# Playwright errors outside of tests', ''];
    if (context.runTitle) lines.push(`- Run: ${context.runTitle.replace(/\s+/g, ' ').trim()}`);
    if (context.status) lines.push(`- Playwright run status: ${context.status}`);
    if (typeof context.durationMs === 'number' && Number.isFinite(context.durationMs)) {
      lines.push(`- Duration: ${(context.durationMs / 1000).toFixed(1)}s`);
    }
    lines.push(`- Errors reported: ${total}`, `- Listed below: ${this._errors.size} distinct`);
    if (this._omitted > 0) {
      lines.push(`- Not listed because of maxErrors (${this._maxErrors}): ${this._omitted}`);
    }

    let index = 0;
    for (const error of this._errors.values()) {
      index++;
      lines.push(
        '',
        `## ${index}. ${firstLine(error.message).slice(0, 200)}${error.count > 1 ? ` (x${error.count})` : ''}`,
        ''
      );
      if (error.project) lines.push(`- Project: ${error.project}`);
      if (error.workerIndex !== undefined) {
        lines.push(
          `- Worker: ${error.workerIndex}${error.parallelIndex !== undefined ? ` (parallel index ${error.parallelIndex})` : ''}`
        );
      }
      if (error.location) lines.push(`- Location: ${error.location}`);
      lines.push('', fence(error.message));
      if (error.stack) lines.push('', 'Stack:', '', fence(error.stack));
      if (error.snippet) lines.push('', 'Code:', '', fence(error.snippet));
    }
    return `${lines.join('\n')}\n`;
  }

  private _normalize(error: unknown, workerInfo?: unknown): CollectedGlobalError {
    const source = error && typeof error === 'object' ? (error as Record<string, unknown>) : {};
    const rawMessage = asText(source.message) ?? asText(error) ?? asText(source.value) ?? 'Unknown error';
    const message = cap(rawMessage, MAX_MESSAGE_LENGTH);

    let stack = asText(source.stack);
    // Playwright stacks usually start with the message; do not print it twice.
    if (stack && stack.startsWith(rawMessage)) stack = stack.slice(rawMessage.length).trim() || undefined;
    stack = stack ? cap(stack, MAX_STACK_LENGTH) : undefined;

    const snippet = asText(source.snippet);
    const info = workerInfo && typeof workerInfo === 'object' ? (workerInfo as Record<string, unknown>) : {};
    const rawProject = info.project;
    const project =
      asText(rawProject) ??
      (rawProject && typeof rawProject === 'object' ? asText((rawProject as { name?: unknown }).name) : undefined);

    return {
      message,
      stack,
      location: formatLocation(source.location),
      snippet: snippet ? cap(snippet, MAX_SNIPPET_LENGTH) : undefined,
      project: project ? cap(project, MAX_FIELD_LENGTH) : undefined,
      workerIndex: asIndex(info.workerIndex),
      parallelIndex: asIndex(info.parallelIndex),
      count: 1,
    };
  }
}
