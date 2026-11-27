// Player text as the forum keeps it (Global Village). Owner: Forum.
//
// Names, captions and comments are hostile input. Kept text is well-formed Unicode in NFC, with line
// breaks and tabs turned to spaces, other control characters and the invisible direction overrides
// (which could make a name read backwards) removed, and the ends trimmed. Lengths are counted in
// code points, so a Chinese caption gets 140 characters too. The text is shown as text only: the
// pages escape it (html.ts), the API sends it as JSON.

const SPACES = /[\t\n\v\f\r\u0085\u2028\u2029]/g;
/** Half of a surrogate pair with no other half: not text. */
const LONE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g;
const STRIP = /[\p{Cc}\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/gu;

/** The text as kept: see the header. */
export function cleanText(s: string): string {
  return s.replace(LONE, '\ufffd').normalize('NFC').replace(SPACES, ' ').replace(STRIP, '').trim();
}

/** Characters a reader sees, near enough: code points. */
export function codePoints(s: string): number {
  let n = 0;
  for (const _ of s) n++;
  return n;
}
