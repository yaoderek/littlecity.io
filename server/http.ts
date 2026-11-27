// Small helpers for Node's HTTP server (Global Village). Owner: Forum.

import type { IncomingMessage, ServerResponse } from 'node:http';
import { ERRORS, Refusal, type ErrorKey } from './errors';

/** Headers on every API answer: any origin may call (copies of the game join the same forum). */
export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Max-Age': '86400',
} as const;

export function sendJson(res: ServerResponse, status: number, body: unknown, extra: Record<string, string> = {}): void {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    ...CORS,
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(text),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...extra,
  });
  res.end(text);
}

export function sendError(res: ServerResponse, status: number, key: ErrorKey): void {
  sendJson(res, status, { error: ERRORS[key] });
}

/**
 * The request body, at most `max` bytes. A body announced or found to be bigger is refused before
 * more of it is read (the connection is closed after the answer).
 */
export function readBody(req: IncomingMessage, max: number, tooBig: ErrorKey = 'tooBig'): Promise<Buffer> {
  const announced = req.headers['content-length'];
  if (announced !== undefined && (!/^\d+$/.test(announced) || Number(announced) > max)) {
    return Promise.reject(new Refusal(413, tooBig));
  }
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let done = false;
    req.on('data', (c: Buffer) => {
      if (done) return;
      size += c.length;
      if (size > max) {
        done = true;
        req.pause();
        reject(new Refusal(413, tooBig));
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (done) return;
      done = true;
      resolve(Buffer.concat(chunks, size));
    });
    req.on('error', (e) => {
      if (done) return;
      done = true;
      reject(e);
    });
  });
}

/** A JSON object body with exactly these keys allowed (the required ones checked by the caller). */
export async function readJson(req: IncomingMessage, max: number, keys: readonly string[], tooBig: ErrorKey = 'tooBig'): Promise<Record<string, unknown>> {
  const raw = await readBody(req, max, tooBig);
  if (raw.length === 0) return {};
  let body: unknown;
  try {
    body = JSON.parse(raw.toString('utf8'));
  } catch {
    throw new Refusal(400, 'badRequest');
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new Refusal(400, 'badRequest');
  for (const k of Object.keys(body)) if (!keys.includes(k)) throw new Refusal(400, 'badRequest');
  return body as Record<string, unknown>;
}

/** The caller's network address: the socket's, or behind Caddy on this machine the last X-Forwarded-For entry. */
export function clientAddress(req: IncomingMessage): string {
  const direct = req.socket.remoteAddress ?? '';
  const local = direct === '127.0.0.1' || direct === '::1' || direct === '::ffff:127.0.0.1';
  const fwd = req.headers['x-forwarded-for'];
  if (local && typeof fwd === 'string' && fwd.trim()) {
    const last = fwd.split(',').pop()!.trim();
    if (last && last.length <= 64) return last;
  }
  return direct;
}
