// Checking a posted picture really is a JPEG, and how big (Global Village). Owner: Forum.
//
// Reads the markers from the start (SOI) to the frame header (SOFn), which holds the size, without
// decoding a pixel. A file that is not a JPEG, ends early, or has no frame header is refused.

export interface JpegSize {
  width: number;
  height: number;
}

/** SOF markers that carry a frame size: C0–CF except C4 (DHT), C8 (JPG) and CC (DAC). */
const isFrame = (m: number): boolean => m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc;

/** The picture's size, or null if it isn't a whole JPEG. */
export function jpegSize(b: Uint8Array): JpegSize | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  // A whole file ends with EOI (FF D9).
  if (b[b.length - 2] !== 0xff || b[b.length - 1] !== 0xd9) return null;
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) return null;
    let m = b[i + 1]!;
    // Fill bytes: any number of FF before a marker.
    while (m === 0xff && i + 2 < b.length) {
      i++;
      m = b[i + 1]!;
    }
    if (m === 0xd8 || m === 0xd9 || m === 0xda || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) return null; // no size before the scan
    const len = (b[i + 2]! << 8) | b[i + 3]!;
    if (len < 2 || i + 2 + len > b.length) return null;
    if (isFrame(m)) {
      if (len < 8) return null;
      const height = (b[i + 5]! << 8) | b[i + 6]!;
      const width = (b[i + 7]! << 8) | b[i + 8]!;
      if (width === 0 || height === 0) return null;
      return { width, height };
    }
    i += 2 + len;
  }
  return null;
}
