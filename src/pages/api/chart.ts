// POST /api/chart — one change to a patient's tooth chart, saved as it is made.
//
// The odontogram on the patient record posts here after every commit in its
// palette. Body, as JSON, with this browser's CSRF token in the X-CSRF header:
//   { clinic, patientId, fdi, condition, surfaces }   one tooth; condition null (or 'sound') clears it
//   { clinic, patientId, clear: true }                 the whole chart
// The staff session must be able to open the clinic (canOpen, re-checked here
// like on every workspace request) and the patient must belong to it, which
// row-level security answers. Nothing is deleted: the tooth's live rows are
// superseded and the new finding is inserted — one row per surface, or one
// whole-tooth row with a null surface — under the signed-in staff member.
// Returns { ok: true, at } with the server's time so the page can say when.
//
// Rate limited per staff member (LIMITS.chart.staff): a dentist charting a
// whole mouth never meets it; a script does.
export const prerender = false;

import type { APIRoute } from 'astro';
import { readSession, canOpen } from '../../lib/auth';
import { withClinic } from '../../lib/db';
import { csrfHeaderOk, CSRF_MESSAGE } from '../../lib/csrf';
import { hit, waitText, LIMITS } from '../../lib/throttle';

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });

// The 32 permanent teeth the chart draws: quadrants 1–4, positions 1–8.
const FDI = new Set([1, 2, 3, 4].flatMap((q) => [1, 2, 3, 4, 5, 6, 7, 8].map((p) => q * 10 + p)));
// The check constraints on tooth_state, as written in schema.sql.
const CONDITIONS = new Set(['sound', 'caries', 'filled', 'crown', 'bridge', 'implant', 'root_canal', 'sealant', 'veneer', 'missing', 'unerupted', 'impacted']);
const SURFACES = new Set(['mesial', 'distal', 'buccal', 'lingual', 'occlusal', 'incisal']);
// Recorded per surface; everything else describes the whole tooth (SURFACE_SCOPED in demo.ts).
const SURFACE_SCOPED = new Set(['caries', 'filled', 'sealant']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const POST: APIRoute = async ({ request, cookies }) => {
  const session = readSession(cookies);
  if (!session) return json({ error: 'Sign in to save the chart.' }, 401);

  let b: any;
  try { b = await request.json(); } catch { return json({ error: 'Send JSON.' }, 400); }
  if (!b || typeof b !== 'object') return json({ error: 'Send JSON.' }, 400);

  const clinic = await canOpen(session, String(b.clinic ?? ''));
  if (!clinic) return json({ error: 'This account cannot open that clinic.' }, 403);
  if (!csrfHeaderOk(cookies, request)) return json({ error: CSRF_MESSAGE }, 403);

  const rate = await hit('chart:s:' + session.staffId, ...LIMITS.chart.staff);
  if (!rate.allowed) return json({ error: 'Too many chart changes at once. ' + waitText(rate.retryAfter) }, 429);

  const patientId = String(b.patientId ?? '');
  if (!UUID.test(patientId)) return json({ error: 'Which patient?' }, 400);

  const clear = b.clear === true;
  let fdi = 0;
  let condition: string | null = null;
  let surfaces: string[] = [];
  if (!clear) {
    fdi = Number(b.fdi);
    if (!Number.isInteger(fdi) || !FDI.has(fdi)) return json({ error: 'That is not a tooth on this chart.' }, 400);
    condition = b.condition == null || b.condition === 'sound' ? null : String(b.condition);
    if (condition !== null && !CONDITIONS.has(condition)) return json({ error: 'That is not a finding the chart knows.' }, 400);
    const raw: unknown[] = Array.isArray(b.surfaces) ? b.surfaces : [];
    surfaces = [...new Set(raw.map(String))];
    if (surfaces.some((s) => !SURFACES.has(s))) return json({ error: 'A surface is mesial, distal, buccal, lingual, occlusal or incisal.' }, 400);
    if (condition === null) surfaces = [];
    else if (SURFACE_SCOPED.has(condition)) { if (!surfaces.length) return json({ error: 'Caries, fillings and sealants need at least one surface.' }, 400); }
    else if (surfaces.length) return json({ error: 'Surfaces apply to caries, fillings and sealants only.' }, 400);
  }

  const result = await withClinic(clinic.id, async (tx) => {
    // RLS scopes this to the clinic the session opened, so a patient id from another clinic is simply not found.
    const { rowCount } = await tx.query('select 1 from patient where id = $1 and archived_at is null', [patientId]);
    if (!rowCount) return 'none' as const;
    if (clear) {
      await tx.query('update tooth_state set superseded_at = now() where patient_id = $1 and superseded_at is null', [patientId]);
    } else {
      await tx.query('update tooth_state set superseded_at = now() where patient_id = $1 and fdi = $2 and superseded_at is null', [patientId, fdi]);
      if (condition !== null) {
        for (const surface of surfaces.length ? surfaces : [null]) {
          await tx.query(
            'insert into tooth_state (clinic_id, patient_id, fdi, surface, condition, noted_by) values ($1, $2, $3, $4, $5, $6)',
            [clinic.id, patientId, fdi, surface, condition, session.staffId]);
        }
      }
    }
    // Who changed the chart. A clear is named for what it is: it is the entry someone will look for.
    await tx.query(`insert into audit_log (clinic_id, staff_id, action, entity, entity_id) values ($1, $2, $3, 'patient', $4)`,
      [clinic.id, session.staffId, clear ? 'chart.clear' : 'chart.update', patientId]);
    return 'ok' as const;
  });

  if (result === 'none') return json({ error: 'No such patient at this clinic.' }, 404);
  return json({ ok: true, at: new Date().toISOString() });
};
