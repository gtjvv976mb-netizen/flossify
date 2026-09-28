// POST /api/recall — the next check-up, set from the Dashboard's visit panel before the patient stands (036).
//
//   { clinic, patientId, months: 3 | 6 | 12 } or { clinic, patientId, dueOn: 'YYYY-MM-DD' }, reason?
//   → 200 { recall: { dueOn, reason } }   400 { error }   401 · 403 · 429 as /api/schedule
//
// The same rule as the record's "Next check-up" card: recordAction's recall-set (src/lib/record.ts) — the open
// recall is closed and a new one written, under canEditRecords, audited record.recall_set. JSON in, the CSRF
// token in the X-CSRF header (csrfHeaderOk), the session must open the clinic (canOpen), and the write runs
// inside withClinic so row-level security decides whether the patient is here.
export const prerender = false;

import type { APIRoute } from 'astro';
import { readSession, canOpen } from '../../lib/auth';
import { withClinic } from '../../lib/db';
import { csrfHeaderOk, CSRF_MESSAGE } from '../../lib/csrf';
import { hit, waitText, LIMITS } from '../../lib/throttle';
import { recordAction } from '../../lib/record';

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const POST: APIRoute = async ({ request, cookies }) => {
  let b: Record<string, unknown>;
  try { b = await request.json(); } catch { return json({ error: 'Send JSON.' }, 400); }
  if (!b || typeof b !== 'object') return json({ error: 'Send JSON.' }, 400);
  const session = readSession(cookies);
  if (!session) return json({ error: 'Sign in to set a check-up.' }, 401);
  const clinic = await canOpen(session, String(b.clinic ?? ''));
  if (!clinic) return json({ error: 'This account cannot open that clinic.' }, 403);
  if (!csrfHeaderOk(cookies, request)) return json({ error: CSRF_MESSAGE }, 403);
  const rate = await hit('record:s:' + session.staffId, ...LIMITS.chart.staff);
  if (!rate.allowed) return json({ error: 'Too many saves at once. ' + waitText(rate.retryAfter) }, 429);
  const patientId = String(b.patientId ?? '').toLowerCase();
  if (!UUID.test(patientId)) return json({ error: 'Which patient?' }, 400);

  // The record's own form, filled from the JSON: one rule for both doors.
  const form = new FormData();
  form.set('intent', 'recall-set');
  if (b.months !== undefined) form.set('months', String(b.months));
  if (typeof b.dueOn === 'string') form.set('due_on', b.dueOn);
  if (typeof b.reason === 'string') form.set('reason', b.reason);

  const out = await withClinic(clinic.id, async (tx) => {
    const o = await recordAction(tx, { clinicId: clinic.id, staffId: session.staffId, patientId }, 'recall-set', form);
    if (o === 'none') return { status: 404, body: { error: 'No such patient at this clinic.' } };
    if (!o.ok) { await tx.query('select 1'); throw new Refused(o.problem); }
    const r = (await tx.query(`select to_char(due_on, 'YYYY-MM-DD') as due, reason from recall where patient_id = $1 and completed_at is null order by due_on limit 1`, [patientId])).rows[0];
    return { status: 200, body: { recall: r ? { dueOn: r.due, reason: r.reason } : null } };
  }).catch((e) => (e instanceof Refused ? { status: 400, body: { error: e.message } } : Promise.reject(e)));
  return json(out.body, out.status);
};

/** A refused write, thrown so the transaction rolls back with nothing half done. */
class Refused extends Error {}
