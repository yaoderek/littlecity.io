// The forum server's small checks: the JPEG header reader and how player text is kept. Owner: Forum.

import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { jpegSize } from './jpeg';
import { cleanText, codePoints } from './text';

/** A JPEG's header and end, enough for the size: SOI, APP0, SOF0 (width × height), EOI. */
export function fakeJpeg(width: number, height: number, padding = 0): Uint8Array {
  const app0 = [0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0];
  const sof = [0xff, 0xc0, 0, 17, 8, height >> 8, height & 255, width >> 8, width & 255, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1];
  // Comment segments (each at most 60,000 bytes) to make the file as big as asked.
  const com: number[] = [];
  for (let left = padding; left > 0; ) {
    const n = Math.min(left, 60_000);
    com.push(0xff, 0xfe, (n + 2) >> 8, (n + 2) & 255, ...new Array<number>(n).fill(0x20));
    left -= n;
  }
  return new Uint8Array([0xff, 0xd8, ...app0, ...com, ...sof, 0xff, 0xd9]);
}

test('a JPEG\'s size is read from its frame header', () => {
  expect(jpegSize(fakeJpeg(640, 400))).toEqual({ width: 640, height: 400 });
  expect(jpegSize(fakeJpeg(320, 200, 1000))).toEqual({ width: 320, height: 200 });
  const real = readFileSync(new URL('./seed/grow.jpg', import.meta.url));
  expect(jpegSize(real)).toEqual({ width: 640, height: 400 });
});

test('anything that is not a whole JPEG has no size', () => {
  const ok = fakeJpeg(640, 400);
  expect(jpegSize(new Uint8Array())).toBeNull();
  expect(jpegSize(new TextEncoder().encode('<svg onload=alert(1)>'))).toBeNull();
  // PNG signature
  expect(jpegSize(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBeNull();
  expect(jpegSize(ok.subarray(0, ok.length - 2))).toBeNull(); // no end
  expect(jpegSize(ok.subarray(0, 12))).toBeNull(); // cut short
  expect(jpegSize(fakeJpeg(0, 400))).toBeNull();
  const noFrame = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xd9]);
  expect(jpegSize(noFrame)).toBeNull();
  const badLength = Uint8Array.from(ok);
  badLength[5] = 0xff; // APP0 says it runs past the end
  expect(jpegSize(badLength)).toBeNull();
});

test('player text: trimmed, line breaks to spaces, controls and direction overrides gone, counted in code points', () => {
  expect(cleanText('  hello\nthere\t!  ')).toBe('hello there !');
  expect(cleanText('a\u0000b\u0007c\u001bd')).toBe('abcd');
  expect(cleanText('evil\u202Egnp.exe')).toBe('evilgnp.exe');
  expect(cleanText('\ud800lone')).toBe('\ufffdlone');
  expect(cleanText('e\u0301')).toBe('\u00e9');
  expect(codePoints('我的小镇')).toBe(4);
  expect(codePoints('🏠🏠')).toBe(2);
  expect(codePoints('👍🏽')).toBe(2);
});
