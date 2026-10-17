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
