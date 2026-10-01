// The schedule API's shared pieces (040): the gate every call passes, reading and checking a JSON body, and
// the refusal that becomes the answer. Moved as they were out of src/pages/api/schedule/index.ts, so
// /api/schedule and /api/schedule/blocks (blocked time) check a caller, a date or a chair the same way.
// A refusal may carry more than its sentence (`extra`): the soft stop's 409 says { error, blocked, kind }.
import type { AstroCookies } from 'astro';
import { readSession, canOpen } from './auth';
import { hit, waitText, LIMITS } from './throttle';
import type { Tx } from './db';
import { StatusRefused } from './schedule';

export const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class Refusal { constructor(public status: number, public error: string, public extra?: Record<string, unknown>) {} }
export const refuse = (status: number, error: string, extra?: Record<string, unknown>) => new Refusal(status, error, extra);

/** The two gates every call passes: a session that can open the clinic, and the per-staff limit. */
export async function gate(cookies: AstroCookies, slug: string) {
  const session = readSession(cookies);
  if (!session) throw refuse(401, 'Sign in to open the schedule.');
  const clinic = await canOpen(session, slug);
  if (!clinic) throw refuse(403, 'This account cannot open that clinic.');
  const rate = await hit('schedule:s:' + session.staffId, ...LIMITS.schedule.staff);
  if (!rate.allowed) throw refuse(429, 'Too many schedule changes at once. ' + waitText(rate.retryAfter));
  return { session, clinic };
}

export const answer = (e: unknown) =>
  e instanceof Refusal ? json({ error: e.error, ...e.extra }, e.status)
  : e instanceof StatusRefused ? json({ error: e.message }, 400)
  : Promise.reject(e);

// ---------------------------------------------------------------------------
// Reading the body
// ---------------------------------------------------------------------------
export async function body(request: Request): Promise<Record<string, unknown>> {
  let b: unknown;
  try { b = await request.json(); } catch { throw refuse(400, 'Send JSON.'); }
  if (!b || typeof b !== 'object' || Array.isArray(b)) throw refuse(400, 'Send JSON.');
  return b as Record<string, unknown>;
}

// A book covers the years a clinic works in. Anything outside them is a mistake or a
// probe, and a date at the edge of what a Date can hold makes arithmetic on it useless.
export const EARLIEST = Date.parse('2000-01-01T00:00:00Z'), LATEST_AHEAD = 3 * 365 * 86_400_000;
export function isoDate(v: unknown, what: string): Date {
  const d = new Date(typeof v === 'string' || typeof v === 'number' ? v : NaN);
  if (Number.isNaN(d.getTime())) throw refuse(400, `${what} needs a date and time.`);
  if (d.getTime() < EARLIEST || d.getTime() > Date.now() + LATEST_AHEAD) throw refuse(400, `${what} is outside the years this book covers.`);
  return d;
}

/** A chair number or null (unplaced). The upper bound is the clinic's chair count, checked inside the transaction. */
export function chairOf(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1) throw refuse(400, 'A chair is numbered from 1.');
  return n;
}

export function idOf(v: unknown, what: string): string | null {
  if (v === null || v === undefined || v === '') return null;
  // Postgres writes uuids in lower case; comparing the caller's spelling would read an
  // unchanged dentist as a change and write a move that never happened.
  const s = String(v).toLowerCase();
  if (!UUID.test(s)) throw refuse(400, `${what} was not recognised.`);
  return s;
}

export function text(v: unknown, max: number): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/\s+/g, ' ').trim();
  return s ? s.slice(0, max) : null;
}

// ---------------------------------------------------------------------------
// Inside the transaction
// ---------------------------------------------------------------------------
export type ClinicRow = { chairs: number; name: string; phone: string | null; slug: string };

export async function clinicRow(tx: Tx, clinicId: string): Promise<ClinicRow> {
  // One writer per clinic book at a time, for this transaction only.
  await tx.query('select pg_advisory_xact_lock(hashtext($1))', [clinicId]);
  const { rows } = await tx.query<ClinicRow>('select chairs, name, phone, slug from clinic where id = $1', [clinicId]);
  if (!rows[0]) throw refuse(403, 'This account cannot open that clinic.');
  return rows[0];
}

export function checkChair(chair: number | null, c: ClinicRow) {
  if (chair !== null && chair > c.chairs) throw refuse(400, c.chairs === 1 ? 'This branch has one chair.' : `This branch has ${c.chairs} chairs; pick one of them.`);
}
