// /api/schedule/blocks — the calendar's Block time panel (040): add a dated block, or remove one.
//
//   POST  { clinic, kind: 'closed' | 'leave' | 'chair_out', dentistId?, chair?, startsAt, endsAt, note? }
//                                         → 201 { block: BlockRange, inside: InsideVisit[] }
//                                           inside: the visits already booked in that time (in its scope), soonest
//                                           first, each with its reminder's state; nothing is done to them
//   PATCH { clinic, id, remove: true }    → 200 { removed: BlockRange }
//   400 { error }  something in the body, or the block is not on this book / already removed; 401 not signed in;
//   403 wrong clinic, a stale CSRF token, or a role without schedule.edit; 429 too many changes
//
// The checks, in order: the schedule's gate (a session that can open the clinic, re-checked on every call, and
// the per-staff limit LIMITS.schedule.staff under the same key as /api/schedule); this browser's CSRF token in
// the X-CSRF header; the permission schedule.edit; the body (readBlock, the words in src/lib/blocks.ts); then one
// clinic transaction (withClinic: row-level security scopes it) in which addBlock / removeBlock take the book's
// advisory lock, the one bookings take, so a block and a booking never pass each other. No text is queued,
// cancelled or changed, and no visit is moved or cancelled.
export const prerender = false;

import type { APIRoute } from 'astro';
import { can } from '../../../lib/can';
import { withClinic } from '../../../lib/db';
import { csrfHeaderOk, CSRF_MESSAGE } from '../../../lib/csrf';
import { json, refuse, answer, gate, body, idOf } from '../../../lib/schedule-api';
import { addBlock, removeBlock, readBlock, BlockRefused } from '../../../lib/blocks';

const NOT_YOURS = 'Your role cannot change the schedule here. Ask the owner.';
const answerBlock = (e: unknown) => (e instanceof BlockRefused ? json({ error: e.message }, 400) : answer(e));

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const b = await body(request);
    const { session, clinic } = await gate(cookies, String(b.clinic ?? ''));
    if (!csrfHeaderOk(cookies, request)) throw refuse(403, CSRF_MESSAGE);
    if (!can(clinic, 'schedule.edit')) throw refuse(403, NOT_YOURS);
    const saved = await withClinic(clinic.id, async (tx) => {
      // The chair count is the branch's own, read under row-level security; addBlock checks it again under the lock.
      const { rows: [c] } = await tx.query<{ chairs: number }>('select chairs from clinic where id = $1', [clinic.id]);
      if (!c) throw refuse(403, 'This account cannot open that clinic.');
      const nb = readBlock(b, { chairs: c.chairs, now: new Date() });
      if ('error' in nb) throw refuse(400, nb.error);
      return addBlock(tx, clinic.id, session.staffId, nb);
    });
    return json(saved, 201);
  } catch (e) { return answerBlock(e); }
};

export const PATCH: APIRoute = async ({ request, cookies }) => {
  try {
    const b = await body(request);
    const { session, clinic } = await gate(cookies, String(b.clinic ?? ''));
    if (!csrfHeaderOk(cookies, request)) throw refuse(403, CSRF_MESSAGE);
    if (!can(clinic, 'schedule.edit')) throw refuse(403, NOT_YOURS);
    const id = idOf(b.id, 'The block');
    if (!id) throw refuse(400, 'Which block?');
    // A block is never edited: one that was wrong is removed and a new one added.
    if (b.remove !== true) throw refuse(400, 'A block is only ever removed; send remove: true.');
    const removed = await withClinic(clinic.id, (tx) => removeBlock(tx, clinic.id, session.staffId, id));
    return json({ removed });
  } catch (e) { return answerBlock(e); }
};
