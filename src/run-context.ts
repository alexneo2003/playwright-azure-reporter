/**
 * Context of a Playwright run that distinguishes one Azure DevOps test run from another:
 * the shard (`--shard=2/4`) and the tags of the Playwright config (`tag` in the config, since Playwright 1.57).
 *
 * Pure helpers, no I/O.
 */

/** Azure DevOps documents at most 5 tags for a created test run. */
export const MAX_RUN_TAGS = 5;
const MAX_TAG_LENGTH = 100;

export interface ShardInfo {
  current: number;
  total: number;
}

export interface RunTag {
  name: string;
}

/** ` (shard 2/4)` for a sharded run, an empty string otherwise or for an unusable value. */
export function formatShardSuffix(shard: unknown): string {
  if (!shard || typeof shard !== 'object') return '';
  const { current, total } = shard as Partial<ShardInfo>;
  if (!Number.isInteger(current) || !Number.isInteger(total) || total! < 1 || current! < 1) return '';
  return ` (shard ${current}/${total})`;
}

/**
 * Turns Playwright config tags (`@smoke`) into run tag names: trimmed, without the leading `@`,
 * without empty or duplicate (case-insensitive) values and without values Azure DevOps may reject
 * (`,` and `;` separate tags, more than 100 characters).
 */
export function normalizeConfigTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const tag of tags) {
    if (typeof tag !== 'string') continue;
    const name = tag.trim().replace(/^@+/, '').trim();
    if (!name || name.length > MAX_TAG_LENGTH || /[,;]/.test(name)) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(name);
  }
  return result;
}

/**
 * Appends `contextTags` to the tags the user configured in `testRunConfig.tags`.
 * User tags come first and are never dropped; context tags fill the remaining room up to `MAX_RUN_TAGS`.
 */
export function mergeRunTags(
  userTags: RunTag[] | undefined,
  contextTags: string[]
): { tags: RunTag[]; added: string[]; dropped: string[] } {
  const tags: RunTag[] = [...(userTags ?? [])];
  const known = new Set(tags.map((tag) => (tag.name ?? '').toLowerCase()));
  const added: string[] = [];
  const dropped: string[] = [];
  for (const name of contextTags) {
    if (known.has(name.toLowerCase())) continue;
    if (tags.length >= MAX_RUN_TAGS) {
      dropped.push(name);
      continue;
    }
    known.add(name.toLowerCase());
    tags.push({ name });
    added.push(name);
  }
  return { tags, added, dropped };
}
