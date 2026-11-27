// Helpers for the forum server's tests (Global Village). Owner: Forum.

/** A JPEG's header and end, enough for the size: SOI, APP0, comment padding, SOF0 (width × height), EOI. */
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
