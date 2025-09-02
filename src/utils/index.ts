import crypto from 'crypto';
import mime from 'mime';

export const getMimeTypeFromFilename = (filename: string): string => {
  return mime.getType(filename) || 'application/octet-stream';
};

export const getExtensionFromContentType = (contentType: string): string => {
  return mime.getExtension(contentType) || 'bin';
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
