// /api/schedule — the schedule page's one door for reading and changing visits.
//
//   GET   ?clinic=<slug>&from=<ISO>&to=<ISO>       → 200 Range (src/lib/schedule.ts), eight days at most
//   POST  { clinic, patientId | newPatient: { name, phone? }, dentistId?, chair, startsAt, minutes, reason?, catalogCode?, notes?, status?: 'arrived' }
//                                                  → 201 { appointment }   a new visit, status 'booked', source 'staff'
//                                                    status 'arrived' is a walk-in (036): checked in as it is booked, through the
//                                                    same state machine, and no confirmation text — they are standing at the desk
//   PATCH { clinic, id, startsAt?, minutes?, chair?, dentistId?, status?, reason?, notes?, catalogCode? }
//                                                  → 200 { appointment, texted, retold }   a move, an edit, a status change
//     catalogCode: a fee-guide code, or null | '' for no fee-guide service; the Edit form sends it together with reason.
//     reason: a non-empty reason is saved as sent; an empty one takes the service's name, and is refused without a service.
//     A new start, chair or dentist is a move; a new length alone is an edit; edits are refused on visits in DONE; a visit
//     booked online keeps the patient's note. retold: queued texts withdrawn to be written again (retellTexts). Texts:
//     only a new start drops waiting texts (every text names the start); a new dentist withdraws the reminders the next
//     pass writes again (they name the dentist); a new reason does the same and replaces a waiting confirmation one for one.
//   Blocked time (040), additions only: GET's Range also carries `blocks` (lunch, a dentist's time not in, the
//   dated blocks: src/lib/blocks.ts) and each staff[] entry `hours` (dow → [fromMin, toMin], their own hours).
//   A POST, or a PATCH that moves or resizes, into closed time is a soft stop: 409 { error: <one sentence>,
//   blocked: true, kind } (src/lib/block-words.ts), and the same body with anyway: true books it and marks it kept
//   (blocked_ok_at, audit appointment.anyway). A walk-in (status 'arrived') is never asked, and is marked the
//   same way. A clash is still a hard 409 with no anyway, and it is checked first. A status-only or words-only
//   PATCH never looks at blocks. /api/schedule/blocks adds and removes dated blocks.
//   Every visit in an answer also carries the Dashboard's extras (service, fee-guide price, who booked it
//   and when, conditions, birth date, whether it was brought in with its day only, and for such a visit
//   the dentist its old record names as dentistName; src/components/ws/cal/data.ts), and POST and PATCH
//   say whether a text to the patient was queued: { appointment, texted }. All additions; nothing above changed.
//   409 { error }  the chair or the dentist is taken: one sentence naming who is in the way
//   400 { error }  something in the body; 401 not signed in; 403 wrong clinic or a stale CSRF token; 429 too many changes
//
// JSON in and out. POST and PATCH carry this browser's CSRF token in the X-CSRF
// header (csrfHeaderOk), like /api/chart. The session must be able to open the
// clinic (canOpen, re-checked on every call), and every write runs inside
// withClinic() so row-level security scopes it: an id from another clinic is
// simply not found. Writes to one clinic's book take turns (an advisory lock on
// the clinic for the transaction) so two desks cannot pass the clash check at
// the same moment and both land in one chair.
//
// A desk booking texts the patient the same confirmation a web booking gets,
// when there is a mobile to text and the visit is ahead. Moving a future visit
// to another time texts the new time. Both are queued (queueText), never sent
// here. Rate limited per staff member (LIMITS.schedule.staff): a busy desk never
// meets it; a script does.
export const prerender = false;

import type { APIRoute } from 'astro';
import { randomBytes } from 'node:crypto';
import { can } from '../../../lib/can';
import { withClinic, type Tx } from '../../../lib/db';
import { csrfHeaderOk, CSRF_MESSAGE } from '../../../lib/csrf';
import { queueText, normalizePhone, PH_MOBILE } from '../../../lib/messages';
import { loadRange, findClash, applyStatus, dropStaleTexts, retellTexts, readAppt, canText, scheduleTexts, isDentistHere, ALLOWED, DONE, WORDS, type Appt } from '../../../lib/schedule';
import { findBlock } from '../../../lib/blocks';
import { json, refuse, answer, gate, body, isoDate, chairOf, idOf, text, clinicRow, checkChair } from '../../../lib/schedule-api';
import { extrasFor, mergeExtras, withExtras } from '../../../components/ws/cal/data';
import { splitName } from '../../../lib/import';

const MAX_DAYS = 8;
const MINUTES = { min: 5, max: 480 };
const REASON_MAX = 200, NOTES_MAX = 500, NAME_MAX = 120, PHONE_MAX = 40;
/** What the patient quotes on the phone: SE-7K3Q — the same shape the bookings API mints. */
const publicRef = (slug: string) => `${slug.slice(0, 2).toUpperCase()}-${randomBytes(3).toString('base64url').replace(/[-_]/g, 'X').slice(0, 4).toUpperCase()}`;

// ---------------------------------------------------------------------------
// Reading the body (the rest is src/lib/schedule-api.ts)
// ---------------------------------------------------------------------------
function minutesOf(v: unknown): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n < MINUTES.min || n > MINUTES.max) throw refuse(400, `A visit is between ${MINUTES.min} minutes and ${MINUTES.max / 60} hours long.`);
  return n;
}

// ---------------------------------------------------------------------------
// Inside the transaction
// ---------------------------------------------------------------------------
/** A dentist is a staff member with access to, or days at, this clinic, in a role that treats (isDentistHere). */
async function checkDentist(tx: Tx, clinicId: string, dentistId: string | null) {
  if (dentistId === null) return;
  if (!(await isDentistHere(tx, clinicId, dentistId))) throw refuse(400, 'That dentist is not at this clinic.');
}

/** The next free desk chart number: P-0007. Counted per clinic (RLS) and stepped past any number already taken. */
async function nextChartNo(tx: Tx): Promise<string> {
  const { rows } = await tx.query<{ chart_no: string }>(
    `select 'P-' || lpad(n::text, 4, '0') as chart_no
       from generate_series((select count(*) + 1 from patient), (select count(*) + 200 from patient)) n
      where not exists (select 1 from patient p where p.chart_no = 'P-' || lpad(n::text, 4, '0'))
      limit 1`);
  return rows[0]?.chart_no ?? `P-${Date.now().toString(36).toUpperCase()}`;
}

async function mustRead(tx: Tx, id: string): Promise<Appt> {
  const a = await readAppt(tx, id);
  if (!a) throw refuse(400, 'That visit is not on this book.');
  return a;
}

// ---------------------------------------------------------------------------
// GET — a range of days
// ---------------------------------------------------------------------------
export const GET: APIRoute = async ({ url, cookies }) => {
  try {
    const { clinic } = await gate(cookies, url.searchParams.get('clinic') ?? '');
    const from = isoDate(url.searchParams.get('from'), 'From'), to = isoDate(url.searchParams.get('to'), 'To');
    if (to <= from) throw refuse(400, 'The range ends before it starts.');
    if (to.getTime() - from.getTime() > MAX_DAYS * 86_400_000) throw refuse(400, `Ask for ${MAX_DAYS} days at most.`);
    const range = await loadRange(clinic.id, from.toISOString(), to.toISOString());
    const extras = await withClinic(clinic.id, (tx) => extrasFor(tx, range.appointments.map((a) => a.id)));
    return json({ ...range, appointments: range.appointments.map((a) => { const ex = extras.get(a.id); return ex ? mergeExtras(a, ex) : a; }) });
  } catch (e) { return answer(e); }
};

// ---------------------------------------------------------------------------
// POST — a new visit
// ---------------------------------------------------------------------------
export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const b = await body(request);
    const { session, clinic } = await gate(cookies, String(b.clinic ?? ''));
    if (!csrfHeaderOk(cookies, request)) throw refuse(403, CSRF_MESSAGE);
    if (!can(clinic, 'schedule.edit')) throw refuse(403, 'Your role cannot change the schedule here. Ask the owner.');

    const startsAt = isoDate(b.startsAt, 'The visit');
    const minutes = minutesOf(b.minutes);
    const endsAt = new Date(startsAt.getTime() + minutes * 60_000);
    const chair = chairOf(b.chair);
    const dentistId = idOf(b.dentistId, 'The dentist');
    const patientId = idOf(b.patientId, 'The patient');
    const reason = text(b.reason, REASON_MAX);
    const notes = text(b.notes, NOTES_MAX);
    const catalogCode = text(b.catalogCode, 60);
    // A walk-in is the only status a visit may start in besides booked.
    if (b.status !== undefined && b.status !== null && b.status !== 'arrived') throw refuse(400, 'A new visit starts as booked, or as arrived for a walk-in.');
    const walkIn = b.status === 'arrived';
    // Book anyway: the desk has seen the soft stop's sentence and books into closed time on purpose (040).
    const anyway = b.anyway === true;

    // Who the visit is for: a patient on file, or a new one from a name and a mobile.
    let newPatient: { name: string; phone: string | null } | null = null;
    if (!patientId) {
      const np = b.newPatient;
      const name = np && typeof np === 'object' ? text((np as any).name, NAME_MAX) : null;
      if (!name) throw refuse(400, 'Whose visit is it? Pick a patient or give a name.');
      const typed = text((np as any).phone, PHONE_MAX);
      // The same rule as the booking form: a number we cannot text is not worth keeping,
      // because every reminder, code and sign-in keys on it.
      const phone = typed ? normalizePhone(typed) : null;
      if (typed && !PH_MOBILE.test(phone!)) throw refuse(400, 'A Philippine mobile number, like 0917 000 0000, or leave it blank.');
      newPatient = { name, phone };
    }

    const saved = await withClinic(clinic.id, async (tx) => {
      const c = await clinicRow(tx, clinic.id);
      checkChair(chair, c);
      await checkDentist(tx, clinic.id, dentistId);

      let pid: string, phone: string | null;
      if (patientId) {
        const { rows } = await tx.query<{ id: string; phone: string | null }>('select id, phone from patient where id = $1 and archived_at is null', [patientId]);
        if (!rows[0]) throw refuse(400, 'No such patient at this clinic.');
        pid = rows[0].id; phone = rows[0].phone;
      } else {
        // The name as Filipino names go (splitName, the import's rule): "Maria Cristina Dela Cruz" is Maria Cristina ·
        // Dela Cruz, "Jose Rizal Jr." keeps Jr. as the suffix; one word is a first name with no surname yet ('—').
        const n = splitName(newPatient!.name);
        const first = n.first || n.last, last = n.first ? n.last : '—';
        const { rows } = await tx.query<{ id: string }>(
          'insert into patient (clinic_id, chart_no, first_name, last_name, suffix, phone) values ($1, $2, $3, $4, $5, $6) returning id',
          [clinic.id, await nextChartNo(tx), first, last, n.suffix, newPatient!.phone]);
        pid = rows[0].id; phone = newPatient!.phone;
        await tx.query(`insert into audit_log (clinic_id, staff_id, action, entity, entity_id) values ($1, $2, 'patient.create', 'patient', $3)`, [clinic.id, session.staffId, pid]);
      }

      // The procedure, when the desk picked one from the catalogue: its name is the reason unless one was typed.
      let catalogId: string | null = null, why = reason;
      if (catalogCode) {
        const { rows } = await tx.query<{ id: string; name: string }>('select id, name from procedure_catalog where code = $1 and active', [catalogCode]);
        if (rows[0]) { catalogId = rows[0].id; why ??= rows[0].name; }
      }

      const clash = await findClash(tx, clinic.id, { startsAt, endsAt, chair, dentistId });
      if (clash) throw refuse(409, clash);
      // Closed time (040) is a soft stop: one sentence and Book anyway. A clash above always wins over it, and a
      // walk-in is never asked — the patient is at the desk — but the visit still records that it sits there.
      const blk = await findBlock(tx, clinic.id, { startsAt, endsAt, chair, dentistId });
      if (blk && !anyway && !walkIn) throw refuse(409, blk.sentence, { blocked: true, kind: blk.kind });

      const ref = publicRef(c.slug);
      const { rows: [row] } = await tx.query<{ id: string }>(
        `insert into appointment (clinic_id, patient_id, dentist_id, chair, starts_at, ends_at, reason, status, source, public_ref, catalog_id, notes, created_by, blocked_ok_at)
         values ($1, $2, $3, $4, $5, $6, $7, 'booked', 'staff', $8, $9, $10, $11, case when $12::boolean then now() end) returning id`,
        [clinic.id, pid, dentistId, chair, startsAt, endsAt, why, ref, catalogId, notes, session.staffId, !!blk]);

      let texted = false;
      if (!walkIn && canText(phone) && startsAt.getTime() > Date.now()) {
        texted = (await queueText(tx, { clinicId: clinic.id, to: phone!, body: scheduleTexts.confirmation(c.name, why, startsAt, ref, c.phone), kind: 'confirmation', patientId: pid, appointmentId: row.id, staffId: session.staffId })) !== null;
      }
      await tx.query(`insert into audit_log (clinic_id, staff_id, action, entity, entity_id) values ($1, $2, 'appointment.create', 'appointment', $3)`, [clinic.id, session.staffId, row.id]);
      if (blk) await tx.query(`insert into audit_log (clinic_id, staff_id, action, entity, entity_id) values ($1, $2, 'appointment.anyway', 'appointment', $3)`, [clinic.id, session.staffId, row.id]);
      if (walkIn) await applyStatus(tx, clinic.id, session.staffId, row.id, 'arrived', 'booked');
      return { appointment: await withExtras(tx, await mustRead(tx, row.id)), texted };
    });
    return json(saved, 201);
  } catch (e) { return answer(e); }
};

// ---------------------------------------------------------------------------
// PATCH — move a visit, edit it in place, change its status
// ---------------------------------------------------------------------------
export const PATCH: APIRoute = async ({ request, cookies }) => {
  try {
    const b = await body(request);
    const { session, clinic } = await gate(cookies, String(b.clinic ?? ''));
    if (!csrfHeaderOk(cookies, request)) throw refuse(403, CSRF_MESSAGE);
    if (!can(clinic, 'schedule.edit')) throw refuse(403, 'Your role cannot change the schedule here. Ask the owner.');

    const id = idOf(b.id, 'The visit');
    if (!id) throw refuse(400, 'Which visit?');
    const has = (k: string) => Object.hasOwn(b, k) && b[k] !== undefined;
    const status = has('status') ? String(b.status) : null;
    if (status !== null && !ALLOWED.has(status)) throw refuse(400, 'That is not a status the book knows.');
    const wantStart = has('startsAt') ? isoDate(b.startsAt, 'The visit') : null;
    const wantMinutes = has('minutes') ? minutesOf(b.minutes) : null;
    const wantChair = has('chair') ? chairOf(b.chair) : undefined;
    const wantDentist = has('dentistId') ? idOf(b.dentistId, 'The dentist') : undefined;
    const wantReason = has('reason') ? text(b.reason, REASON_MAX) : undefined;
    const wantNotes = has('notes') ? text(b.notes, NOTES_MAX) : undefined;
    // A fee-guide code, or null for "No fee-guide service" (the Edit form sends it with the reason).
    const wantCatalog = has('catalogCode') ? text(b.catalogCode, 60) : undefined;
    const anyway = b.anyway === true;

    const saved = await withClinic(clinic.id, async (tx) => {
      let texted = false, retold = 0;
      const c = await clinicRow(tx, clinic.id);
      const { rows: [cur] } = await tx.query<{
        patient_id: string; starts_at: Date; ends_at: Date; chair: number | null; dentist_id: string | null; status: string; public_ref: string | null; phone: string | null;
        reason: string | null; notes: string | null; catalog_id: string | null; source: string; moved_at: Date | null;
      }>(
        `select a.patient_id, a.starts_at, a.ends_at, a.chair, a.dentist_id, a.status, a.public_ref, coalesce(nullif(a.booked_by_phone, ''), p.phone) as phone,
                a.reason, a.notes, a.catalog_id, a.source, a.moved_at
           from appointment a join patient p on p.id = a.patient_id where a.id = $1 for update of a`, [id]);
      if (!cur) throw refuse(400, 'That visit is not on this book.');

      const startsAt = wantStart ?? new Date(cur.starts_at);
      const minutes = wantMinutes ?? Math.round((new Date(cur.ends_at).getTime() - new Date(cur.starts_at).getTime()) / 60_000);
      const endsAt = new Date(startsAt.getTime() + minutes * 60_000);
      const chair = wantChair === undefined ? cur.chair : wantChair;
      const dentistId = wantDentist === undefined ? cur.dentist_id : wantDentist;
      const startChanged = +startsAt !== +new Date(cur.starts_at);
      const endChanged = +endsAt !== +new Date(cur.ends_at);
      const dentistChanged = dentistId !== cur.dentist_id;
      const moved = startChanged || chair !== cur.chair || dentistChanged;
      const resized = endChanged && !moved;          // a length alone never stamps moved_at (018: that would place a request)
      const unplaced = cur.source === 'request' && cur.moved_at === null;
      const online = cur.source === 'web' || cur.source === 'request';

      // The service and the reason. A reason that was sent and is not empty is final; the service's name fills in
      // only when the reason was sent empty, or when a caller sends catalogCode alone.
      let svc: { id: string; name: string } | null | undefined = undefined;
      if (wantCatalog === null) svc = null;
      else if (wantCatalog !== undefined) {
        const row = (await tx.query<{ id: string; name: string; active: boolean }>('select id, name, active from procedure_catalog where code = $1', [wantCatalog])).rows[0];
        // A retired service stays acceptable on the visit that already has it, so a reason-only edit there still saves.
        if (!row || (!row.active && row.id !== cur.catalog_id)) throw refuse(400, 'That service is not in the fee guide any more. Pick another.');
        svc = { id: row.id, name: row.name };
      }
      const catalogChanged = svc !== undefined && (svc?.id ?? null) !== cur.catalog_id;
      const sentReason = has('reason') ? wantReason : undefined;          // text(): null when sent empty
      const newReason = sentReason ?? (svc && (catalogChanged || sentReason === null) ? svc.name : null);
      if (sentReason === null && newReason === null) throw refuse(400, 'Say what the visit is for, or pick a service.');
      const reasonChanged = newReason !== null && newReason !== cur.reason;
      const notesChanged = wantNotes !== undefined && (wantNotes ?? null) !== (cur.notes ?? null);
      const edited = catalogChanged || reasonChanged || notesChanged || resized;

      // Refused before anything is written.
      if (edited && DONE.has(cur.status)) throw refuse(400, `That visit is marked ${WORDS[cur.status] ?? cur.status}. Its service, length and note stay as they were.`);
      if ((catalogChanged || reasonChanged || resized) && unplaced && !moved) throw refuse(400, 'Place the request first: give it a chair or a new time. Then change what it is for.');
      if (notesChanged && online) throw refuse(400, 'A visit booked online keeps the note the patient wrote with it. Put the desk’s words in the patient’s desk note.');

      if (moved) {
        // A visit that has left the book keeps its history; it does not get a new time.
        if (DONE.has(cur.status)) throw refuse(400, `That visit is marked ${WORDS[cur.status] ?? cur.status}. Book a new visit instead.`);
        checkChair(chair, c);
        if (dentistChanged) await checkDentist(tx, clinic.id, dentistId);
        const clash = await findClash(tx, clinic.id, { id, startsAt, endsAt, chair, dentistId });
        if (clash) throw refuse(409, clash);
        // A move into closed time asks first (Move anyway, Place anyway); a move out of it clears the kept mark.
        const blk = await findBlock(tx, clinic.id, { id, startsAt, endsAt, chair, dentistId });
        if (blk && !anyway) throw refuse(409, blk.sentence, { blocked: true, kind: blk.kind });
        await tx.query('update appointment set starts_at = $2, ends_at = $3, chair = $4, dentist_id = $5, moved_at = now(), blocked_ok_at = case when $6::boolean then now() else null end where id = $1', [id, startsAt, endsAt, chair, dentistId, !!blk]);
        await tx.query(`insert into audit_log (clinic_id, staff_id, action, entity, entity_id) values ($1, $2, 'appointment.move', 'appointment', $3)`, [clinic.id, session.staffId, id]);
        if (blk) await tx.query(`insert into audit_log (clinic_id, staff_id, action, entity, entity_id) values ($1, $2, 'appointment.anyway', 'appointment', $3)`, [clinic.id, session.staffId, id]);
        // Every text names the start, so a new start drops what is waiting (and texts the new time, below); reminders
        // also name the dentist, so a new dentist alone has them written again. A new chair or length drops nothing.
        if (startChanged) await dropStaleTexts(tx, id);
        else if (dentistChanged) retold += (await retellTexts(tx, id, { confirmations: false })).reminders;
        if (startChanged && startsAt.getTime() > Date.now() && canText(cur.phone)) {
          texted = (await queueText(tx, { clinicId: clinic.id, to: cur.phone!, body: scheduleTexts.moved(c.name, startsAt, cur.public_ref, c.phone), kind: 'confirmation', patientId: cur.patient_id, appointmentId: id, staffId: session.staffId })) !== null;
        }
      }

      if (resized) {
        // A new length at the same start, chair and dentist: the clash rule and the soft stop, and no text (texts
        // name the start, never the end).
        const clash = await findClash(tx, clinic.id, { id, startsAt, endsAt, chair, dentistId });
        if (clash) throw refuse(409, clash);
        const blk = await findBlock(tx, clinic.id, { id, startsAt, endsAt, chair, dentistId });
        if (blk && !anyway) throw refuse(409, blk.sentence, { blocked: true, kind: blk.kind });
        await tx.query('update appointment set ends_at = $2, blocked_ok_at = case when $3::boolean then now() else null end where id = $1', [id, endsAt, !!blk]);
        if (blk) await tx.query(`insert into audit_log (clinic_id, staff_id, action, entity, entity_id) values ($1, $2, 'appointment.anyway', 'appointment', $3)`, [clinic.id, session.staffId, id]);
      }

      if (catalogChanged || reasonChanged || notesChanged) {
        await tx.query(
          `update appointment set catalog_id = case when $5 then $4::uuid else catalog_id end,
                  reason = coalesce($2, reason), notes = case when $6 then $3 else notes end where id = $1`,
          [id, reasonChanged ? newReason : null, wantNotes ?? null, svc?.id ?? null, catalogChanged, notesChanged]);
      }
      if (edited && !moved) await tx.query(`insert into audit_log (clinic_id, staff_id, action, entity, entity_id) values ($1, $2, 'appointment.edit', 'appointment', $3)`, [clinic.id, session.staffId, id]);

      if (reasonChanged) {
        // Texts still waiting that name the old reason: the reminders the next pass writes again are withdrawn, and a
        // waiting confirmation is replaced one for one. Nothing extra is sent.
        const t = await retellTexts(tx, id, { confirmations: true });
        retold += t.reminders + t.confirmations;
        if (t.confirmations > 0 && startsAt.getTime() > Date.now() && canText(cur.phone)) {
          texted = (await queueText(tx, { clinicId: clinic.id, to: cur.phone!, kind: 'confirmation',
            body: scheduleTexts.confirmation(c.name, newReason, startsAt, cur.public_ref, c.phone),
            patientId: cur.patient_id, appointmentId: id, staffId: session.staffId })) !== null;
        }
      }

      if (status !== null && status !== cur.status) await applyStatus(tx, clinic.id, session.staffId, id, status, cur.status);
      const card = await withExtras(tx, await mustRead(tx, id));
      // "No fee-guide service" while the reason still names one: data.ts would read the service back from the words.
      if (svc === null && card.catalogId) throw refuse(400, `“${card.reason}” is the fee guide’s ${card.service}, so the visit reads as ${card.service}. Pick ${card.service} as the service, or word the reason another way.`);
      return { appointment: card, texted, retold };
    });
    return json(saved);
  } catch (e) { return answer(e); }
};
