// The forum server's small checks: the JPEG header reader and how player text is kept. Owner: Forum.

import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { jpegSize } from './jpeg';
import { fakeJpeg } from './test-helpers';
import { cleanText, codePoints } from './text';

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
