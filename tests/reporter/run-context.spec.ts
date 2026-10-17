import { formatShardSuffix, MAX_RUN_TAGS, mergeRunTags, normalizeConfigTags } from '../../src/run-context';
import { expect, test } from './test-fixtures';

test.describe('run context: shard', () => {
  test('formats a shard as a title suffix', () => {
    expect(formatShardSuffix({ current: 2, total: 4 })).toBe(' (shard 2/4)');
  });

  test('no suffix without sharding or for unusable values', () => {
    for (const value of [
      null,
      undefined,
      3,
      'x',
      {},
      { current: 0, total: 2 },
      { current: 1, total: 0 },
      { current: 1.5, total: 2 },
    ]) {
      expect(formatShardSuffix(value)).toBe('');
    }
  });
});

test.describe('run context: tags', () => {
  test('normalizes config tags', () => {
    expect(normalizeConfigTags(['@smoke', ' nightly ', '@@double', 'Smoke', '', '@']).names).toEqual([
      'smoke',
      'nightly',
      'double',
    ]);
    expect(normalizeConfigTags(['x'.repeat(100)]).names).toHaveLength(1);
  });

  test('skips tags Azure DevOps rejects and reports them, the others are kept', () => {
    const { names, skipped } = normalizeConfigTags([
      '@smoke',
      '@feature:login',
      '@a b',
      '@a,b',
      '@a;b',
      '@snake_case',
      '@kebab-case',
      '@x' + 'x'.repeat(100),
      '@ok2',
    ]);
    expect(names).toEqual(['smoke', 'ok2']);
    expect(skipped).toEqual([
      '@feature:login',
      '@a b',
      '@a,b',
      '@a;b',
      '@snake_case',
      '@kebab-case',
      '@x' + 'x'.repeat(100),
    ]);
  });

  test('accepts letters and digits of any alphabet', () => {
    expect(normalizeConfigTags(['@Тест1', '@测试']).names).toEqual(['Тест1', '测试']);
  });

  test('ignores values that are not a list of strings', () => {
    expect(normalizeConfigTags(undefined)).toEqual({ names: [], skipped: [] });
    expect(normalizeConfigTags('@smoke')).toEqual({ names: [], skipped: [] });
    expect(normalizeConfigTags([1, null, {}, '@ok']).names).toEqual(['ok']);
  });

  test('merges after the user tags, case-insensitively without duplicates', () => {
    const merged = mergeRunTags([{ name: 'CI' }], ['ci', 'smoke']);
    expect(merged.tags).toEqual([{ name: 'CI' }, { name: 'smoke' }]);
    expect(merged.added).toEqual(['smoke']);
    expect(merged.dropped).toEqual([]);
  });

  test('keeps at most five tags, user tags first and never dropped', () => {
    const user = [{ name: 'u1' }, { name: 'u2' }, { name: 'u3' }];
    const merged = mergeRunTags(user, ['a', 'b', 'c']);
    expect(merged.tags.map((t) => t.name)).toEqual(['u1', 'u2', 'u3', 'a', 'b']);
    expect(merged.dropped).toEqual(['c']);
    expect(MAX_RUN_TAGS).toBe(5);

    const many = mergeRunTags(
      ['1', '2', '3', '4', '5', '6'].map((name) => ({ name })),
      ['a']
    );
    expect(many.tags).toHaveLength(6);
    expect(many.added).toEqual([]);
    expect(many.dropped).toEqual(['a']);
  });

  test('does not change the user tags array', () => {
    const user = [{ name: 'u' }];
    mergeRunTags(user, ['a']);
    expect(user).toEqual([{ name: 'u' }]);
    expect(mergeRunTags(undefined, [])).toEqual({ tags: [], added: [], dropped: [] });
  });
});
