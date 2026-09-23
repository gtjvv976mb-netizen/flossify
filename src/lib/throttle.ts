// Rate limits. A fixed window per key, counted in the database (throttle_hit)
// so every server instance sees the same number. Keys name what is being
// limited and by what: 'login:e:<email>', 'book:ip:<addr>'.
//
// The limits are generous for a person and tight for a script. A front desk
// that mistypes a password eight times in fifteen minutes is told to wait or
// reset; a patient booking five times a day from one number is asked to call.

import './dotenv';
import { isIP } from 'node:net';
import { pool } from './db';

export interface Hit { allowed: boolean; hits: number; retryAfter: number }

/** Count one hit against `key`; allowed while the window holds fewer than `limit`. */
export async function hit(key: string, limit: number, windowSeconds: number): Promise<Hit> {
  const { rows } = await pool.query(
    'select allowed, hits, retry_after from throttle_hit($1, $2, make_interval(secs => $3))', [key, limit, windowSeconds]);
  const r = rows[0];
  return { allowed: r.allowed, hits: r.hits, retryAfter: r.retry_after };
}

/** Read the window without spending a hit: is this key locked right now? */
export async function peek(key: string, limit: number, windowSeconds: number): Promise<Hit> {
  const { rows } = await pool.query(
    'select allowed, hits, retry_after from throttle_peek($1, $2, make_interval(secs => $3))', [key, limit, windowSeconds]);
  const r = rows[0];
  return { allowed: r.allowed, hits: r.hits, retryAfter: r.retry_after };
}

/** Give a hit back: a successful sign-in is not a failed one. */
export async function refund(key: string): Promise<void> {
  await pool.query('select throttle_refund($1)', [key]).catch(() => {});
}

/** [limit, window seconds] per thing. Spread into hit(): `hit(key, ...LIMITS.login.email)`. */
export const LIMITS = {
  login: { email: [8, 15 * 60], ip: [40, 15 * 60] },
  forgot: { phone: [3, 60 * 60], ip: [10, 60 * 60] },
  code: { phone: [10, 15 * 60], ip: [30, 15 * 60] },
  booking: { ip: [20, 60 * 60], phone: [5, 24 * 60 * 60] },
  signup: { ip: [3, 60 * 60] },
  inbound: { ip: [600, 60] },
  me: { phone: [3, 60 * 60], ip: [10, 60 * 60] },
  mecode: { phone: [10, 15 * 60], ip: [30, 15 * 60] },
  chart: { staff: [600, 60] },
  schedule: { staff: [600, 60] },
} as const satisfies Record<string, Record<string, readonly [number, number]>>;

/** The caller's address. Behind a proxy that sets X-Forwarded-For, set TRUST_PROXY=1;
 *  otherwise that header is whatever the caller wrote in it and is ignored. */
export function clientIp(ctx: { request: Request; clientAddress: string }): string {
  const trust = (process.env.TRUST_PROXY ?? '').trim() === '1';
  if (trust) {
    // The entry nearest the proxy (rightmost) is the one it wrote; anything left of it is the caller's own claim.
    const parts = (ctx.request.headers.get('x-forwarded-for') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    const ip = parts[parts.length - 1];
    if (ip && isIP(ip)) return ip;
  }
  try { return ctx.clientAddress; } catch { return '0.0.0.0'; }
}

/** "Try again in 12 minutes." */
export function waitText(retryAfterSeconds: number): string {
  const m = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  if (m >= 90) { const h = Math.round(m / 60); return `Try again in about ${h} hour${h === 1 ? '' : 's'}.`; }
  return `Try again in ${m} minute${m === 1 ? '' : 's'}.`;
}
