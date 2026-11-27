// Putting text into the server's HTML pages (Global Village). Owner: Forum.
//
// Every piece of text that goes into a page goes through esc(), in element text and in quoted
// attribute values alike. The pages carry no script at all (their Content-Security-Policy says so),
// so even a mistake here could not run a player's text as code.

const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Text made safe for HTML element content and quoted attribute values. */
export function esc(s: string | number): string {
  return String(s).replace(/[&<>"']/g, (c) => ENTITIES[c]!);
}

/** The headers every HTML page is sent with. */
export const PAGE_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
} as const;
