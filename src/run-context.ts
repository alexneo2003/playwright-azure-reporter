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
 * Azure DevOps accepts only letters and digits in run tags ("Only Alphanumeric characters are allowed to be
 * used for tags."). Verified on a live organization: `feature:login` and `a b` are rejected.
 */
const RUN_TAG_PATTERN = /^[\p{L}\p{N}]+$/u;

/**
 * Turns Playwright config tags (`@smoke`) into run tag names: trimmed, without the leading `@`, without empty
 * and duplicate (case-insensitive) values. Values Azure DevOps would reject (anything but letters and digits,
 * more than 100 characters) are returned in `skipped`, so one bad tag does not cost the others.
 */
export function normalizeConfigTags(tags: unknown): { names: string[]; skipped: string[] } {
  const result: { names: string[]; skipped: string[] } = { names: [], skipped: [] };
  if (!Array.isArray(tags)) return result;
  const seen = new Set<string>();
  for (const tag of tags) {
    if (typeof tag !== 'string') continue;
    const name = tag.trim().replace(/^@+/, '').trim();
    if (!name) continue;
    if (name.length > MAX_TAG_LENGTH || !RUN_TAG_PATTERN.test(name)) {
      result.skipped.push(tag.trim());
      continue;
    }
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.names.push(name);
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
