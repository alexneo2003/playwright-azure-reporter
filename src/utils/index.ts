import crypto from 'crypto';
import mime from 'mime';

export const getMimeTypeFromFilename = (filename: string): string => {
  return mime.getType(filename) || 'application/octet-stream';
};

const EXTENSION_ALIASES: Record<string, string> = {
  jpg: 'jpeg',
  markdown: 'md',
};

export const getExtensionFromContentType = (contentType: string): string => {
  const ext = mime.getExtension(contentType) || 'bin';
  return EXTENSION_ALIASES[ext] ?? ext;
};

export const getExtensionFromFilename = (filename: string): string => {
  return getExtensionFromContentType(getMimeTypeFromFilename(filename));
};

export function createGuid(): string {
  return crypto.randomBytes(16).toString('hex');
}

export function shortID(): string {
  return crypto.randomBytes(8).toString('hex');
}

export function stripAnsi(str: string | undefined): string | undefined {
  return str?.replace(/\[[0-9;]*m/g, '');
}

/**
 * Parses a test plan id given as a number or as a string (for example from an environment variable).
 * Only positive integers are accepted, with surrounding whitespace allowed: `'12abc'` is rejected.
 */
export function parsePlanId(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value > 0 ? value : undefined;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return undefined;
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}
