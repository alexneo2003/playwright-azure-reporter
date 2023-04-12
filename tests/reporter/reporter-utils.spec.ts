import { getExtensionFromContentType, getExtensionFromFilename, getMimeTypeFromFilename } from "../../src/utils";
import { expect, test } from "./test-fixtures";

test.describe("Reporter utils", () => {
  test('getMimeTypeFromFilename', async () => {
    expect(getMimeTypeFromFilename('test.png')).toBe('image/png');
    expect(getMimeTypeFromFilename('test.jpg')).toBe('image/jpeg');
    expect(getMimeTypeFromFilename('test.jpeg')).toBe('image/jpeg');
    expect(getMimeTypeFromFilename('test.gif')).toBe('image/gif');
    expect(getMimeTypeFromFilename('test.txt')).toBe('text/plain');
    expect(getMimeTypeFromFilename('test.html')).toBe('text/html');
    expect(getMimeTypeFromFilename('test.xml')).toBe('application/xml');
    expect(getMimeTypeFromFilename('test.json')).toBe('application/json');
    expect(getMimeTypeFromFilename('test.pdf')).toBe('application/pdf');
    expect(getMimeTypeFromFilename('')).toBe('application/octet-stream');
  });

  test('getExtensionFromFilename', async () => {
    expect(getExtensionFromFilename('test.png')).toBe('png');
    expect(getExtensionFromFilename('test.jpg')).toBe('jpeg');
    expect(getExtensionFromFilename('test.jpeg')).toBe('jpeg');
    expect(getExtensionFromFilename('test.gif')).toBe('gif');
    expect(getExtensionFromFilename('test.txt')).toBe('txt');
    expect(getExtensionFromFilename('test.html')).toBe('html');
    expect(getExtensionFromFilename('test.xml')).toBe('xml');
    expect(getExtensionFromFilename('test.json')).toBe('json');
    expect(getExtensionFromFilename('test.pdf')).toBe('pdf');
    expect(getExtensionFromFilename('')).toBe('bin');
  })

  test('getExtensionFromContentType', async () => {
    expect(getExtensionFromContentType('image/png')).toBe('png');
    expect(getExtensionFromContentType('image/jpeg')).toBe('jpeg');
    expect(getExtensionFromContentType('image/gif')).toBe('gif');
    expect(getExtensionFromContentType('text/plain')).toBe('txt');
    expect(getExtensionFromContentType('text/html')).toBe('html');
    expect(getExtensionFromContentType('application/xml')).toBe('xml');
    expect(getExtensionFromContentType('application/json')).toBe('json');
    expect(getExtensionFromContentType('application/pdf')).toBe('pdf');
    expect(getExtensionFromContentType('')).toBe('bin');
  })
});