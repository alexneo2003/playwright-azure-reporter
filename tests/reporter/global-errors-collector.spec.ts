import { ERROR_MESSAGE_MAX_LENGTH, GlobalErrorCollector } from '../../src/global-errors';
import { expect, test } from './test-fixtures';

const ESC = String.fromCharCode(27);

test.describe('GlobalErrorCollector', () => {
  test('starts empty and has no summary', () => {
    const collector = new GlobalErrorCollector();
    expect(collector.total).toBe(0);
    expect(collector.errors).toEqual([]);
    expect(collector.summary()).toBe('');
  });

  test('strips ANSI codes and keeps location, snippet and worker info', () => {
    const collector = new GlobalErrorCollector();
    collector.add(
      {
        message: `${ESC}[31mError: boom${ESC}[39m`,
        stack: `${ESC}[31mError: boom${ESC}[39m\n    at fixture (/p/a.ts:3:9)`,
        location: { file: '/p/a.ts', line: 3, column: 9 },
        snippet: `${ESC}[2m> 3 | throw${ESC}[22m`,
      },
      { project: { name: 'chromium' }, workerIndex: 2, parallelIndex: 1 }
    );
    expect(collector.errors).toEqual([
      {
        message: 'Error: boom',
        stack: 'at fixture (/p/a.ts:3:9)',
        location: '/p/a.ts:3:9',
        snippet: '> 3 | throw',
        project: 'chromium',
        workerIndex: 2,
        parallelIndex: 1,
        count: 1,
      },
    ]);
  });

  test('counts identical errors instead of storing them twice, per project', () => {
    const collector = new GlobalErrorCollector();
    collector.add({ message: 'same' }, { project: { name: 'a' } });
    collector.add({ message: 'same' }, { project: { name: 'a' } });
    collector.add({ message: 'same' }, { project: { name: 'b' } });
    expect(collector.total).toBe(3);
    expect(collector.errors.map((e) => [e.project, e.count])).toEqual([
      ['a', 2],
      ['b', 1],
    ]);
  });

  test('keeps at most maxErrors distinct errors and counts the rest as omitted', () => {
    const collector = new GlobalErrorCollector(2);
    for (const message of ['one', 'two', 'three', 'four', 'one']) collector.add({ message });
    expect(collector.errors.map((e) => [e.message, e.count])).toEqual([
      ['one', 2],
      ['two', 1],
    ]);
    expect(collector.omitted).toBe(2);
    expect(collector.total).toBe(5);
    expect(collector.report()).toContain('Not listed because of maxErrors (2): 2');
  });

  test('an invalid maxErrors falls back to the default', () => {
    const collector = new GlobalErrorCollector(0);
    for (let i = 0; i < 25; i++) collector.add({ message: `e${i}` });
    expect(collector.errors).toHaveLength(20);
    expect(collector.omitted).toBe(5);
  });

  test('caps long texts', () => {
    const collector = new GlobalErrorCollector();
    collector.add({ message: 'x'.repeat(10000), stack: 'y'.repeat(10000) });
    const [error] = collector.errors;
    expect(error.message.length).toBeLessThan(4100);
    expect(error.message).toContain('[truncated 6000 characters]');
    expect(error.stack!.length).toBeLessThan(3100);
  });

  test('never throws on garbage input', () => {
    const collector = new GlobalErrorCollector();
    const cyclic: any = {};
    cyclic.self = cyclic;
    const hostile = {
      get message(): string {
        throw new Error('getter');
      },
    };
    for (const garbage of [undefined, null, 42, true, [], {}, 'plain text', cyclic, hostile, Symbol('s')]) {
      expect(() => collector.add(garbage, garbage)).not.toThrow();
    }
    expect(collector.total).toBe(10);
    expect(collector.errors.some((e) => e.message === 'plain text')).toBe(true);
    expect(collector.errors.some((e) => e.message === 'Unknown error')).toBe(true);
  });

  test('uses value when there is no message, ignores invalid worker indexes', () => {
    const collector = new GlobalErrorCollector();
    collector.add({ value: 'thrown string' }, { workerIndex: -1, parallelIndex: 1.5, project: 7 });
    expect(collector.errors[0]).toMatchObject({ message: 'thrown string', count: 1 });
    expect(collector.errors[0].workerIndex).toBeUndefined();
    expect(collector.errors[0].parallelIndex).toBeUndefined();
    expect(collector.errors[0].project).toBeUndefined();
  });

  test('summary names the count and the first error and is capped', () => {
    const collector = new GlobalErrorCollector();
    collector.add({ message: 'Error: first\nsecond line' });
    collector.add({ message: 'other' });
    expect(collector.summary()).toBe('Playwright reported 2 error(s) outside of tests. First: Error: first');

    const long = new GlobalErrorCollector();
    long.add({ message: 'z'.repeat(5000) });
    expect(long.summary()).toHaveLength(ERROR_MESSAGE_MAX_LENGTH);
    expect(long.summary().endsWith('...')).toBe(true);
  });

  test('report is Markdown with run context and every error', () => {
    const collector = new GlobalErrorCollector();
    collector.add(
      {
        message: 'Error: teardown failed',
        stack: 'Error: teardown failed\n    at a (/p/a.ts:1:1)',
        location: { file: '/p/a.ts', line: 1, column: 1 },
      },
      { project: { name: 'chromium' }, workerIndex: 0, parallelIndex: 0 }
    );
    collector.add(
      { message: 'Error: teardown failed', stack: 'Error: teardown failed\n    at a (/p/a.ts:1:1)' },
      { project: { name: 'chromium' } }
    );
    const report = collector.report({ status: 'failed', durationMs: 12345, runTitle: 'My   run' });
    expect(report).toContain('# Playwright errors outside of tests');
    expect(report).toContain('- Run: My run');
    expect(report).toContain('- Playwright run status: failed');
    expect(report).toContain('- Duration: 12.3s');
    expect(report).toContain('- Errors reported: 2');
    expect(report).toContain('## 1. Error: teardown failed (x2)');
    expect(report).toContain('- Project: chromium');
    expect(report).toContain('- Worker: 0 (parallel index 0)');
    expect(report).toContain('- Location: /p/a.ts:1:1');
    expect(report).toContain('Stack:');
    expect(report).toContain('at a (/p/a.ts:1:1)');
    // the message is not repeated as the first line of the stack
    expect(report.match(/Error: teardown failed/g)).toHaveLength(2);
  });

  test('report fences cannot be closed by backticks inside the error text', () => {
    const collector = new GlobalErrorCollector();
    collector.add({ message: 'text with ``` inside' });
    const report = collector.report();
    expect(report).toContain('````\ntext with ``` inside\n````');
  });
});
