// /api/schedule — the schedule page's one door for reading and changing visits.
//
//   GET   ?clinic=<slug>&from=<ISO>&to=<ISO>       → 200 Range (src/lib/schedule.ts), eight days at most
//   POST  { clinic, patientId | newPatient: { name, phone? }, dentistId?, chair, startsAt, minutes, reason?, catalogCode?, notes? }
//                                                  → 201 { appointment }   a new visit, status 'booked', source 'staff'
//   PATCH { clinic, id, startsAt?, minutes?, chair?, dentistId?, status?, reason?, notes? }
//                                                  → 200 { appointment }   a move, a status change, or both
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

import type { APIRoute, AstroCookies } from 'astro';
import { randomBytes } from 'node:crypto';
import { readSession, canOpen } from '../../../lib/auth';
import { can } from '../../../lib/can';
import { withClinic, type Tx } from '../../../lib/db';
import { csrfHeaderOk, CSRF_MESSAGE } from '../../../lib/csrf';
import { hit, waitText, LIMITS } from '../../../lib/throttle';
import { queueText, normalizePhone, PH_MOBILE } from '../../../lib/messages';
import { loadRange, findClash, applyStatus, dropStaleTexts, readAppt, canText, scheduleTexts, ALLOWED, DONE, WORDS, StatusRefused, type Appt } from '../../../lib/schedule';
import { extrasFor, mergeExtras, withExtras } from '../../../components/ws/cal/data';

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_DAYS = 8;
const MINUTES = { min: 5, max: 480 };
const REASON_MAX = 200, NOTES_MAX = 500, NAME_MAX = 120, PHONE_MAX = 40;
/** What the patient quotes on the phone: SE-7K3Q — the same shape the bookings API mints. */
const publicRef = (slug: string) => `${slug.slice(0, 2).toUpperCase()}-${randomBytes(3).toString('base64url').replace(/[-_]/g, 'X').slice(0, 4).toUpperCase()}`;

class Refusal { constructor(public status: number, public error: string) {} }
const refuse = (status: number, error: string) => new Refusal(status, error);

/** The two gates every call passes: a session that can open the clinic, and the per-staff limit. */
async function gate(cookies: AstroCookies, slug: string) {
  const session = readSession(cookies);
  if (!session) throw refuse(401, 'Sign in to open the schedule.');
  const clinic = await canOpen(session, slug);
  if (!clinic) throw refuse(403, 'This account cannot open that clinic.');
  const rate = await hit('schedule:s:' + session.staffId, ...LIMITS.schedule.staff);
  if (!rate.allowed) throw refuse(429, 'Too many schedule changes at once. ' + waitText(rate.retryAfter));
  return { session, clinic };
}

const answer = (e: unknown) =>
  e instanceof Refusal ? json({ error: e.error }, e.status)
  : e instanceof StatusRefused ? json({ error: e.message }, 400)
  : Promise.reject(e);

// ---------------------------------------------------------------------------
// Reading the body
// ---------------------------------------------------------------------------
async function body(request: Request): Promise<Record<string, unknown>> {
  let b: unknown;
  try { b = await request.json(); } catch { throw refuse(400, 'Send JSON.'); }
  if (!b || typeof b !== 'object' || Array.isArray(b)) throw refuse(400, 'Send JSON.');
  return b as Record<string, unknown>;
}

// A book covers the years a clinic works in. Anything outside them is a mistake or a
// probe, and a date at the edge of what a Date can hold makes arithmetic on it useless.
const EARLIEST = Date.parse('2000-01-01T00:00:00Z'), LATEST_AHEAD = 3 * 365 * 86_400_000;
function isoDate(v: unknown, what: string): Date {
  const d = new Date(typeof v === 'string' || typeof v === 'number' ? v : NaN);
  if (Number.isNaN(d.getTime())) throw refuse(400, `${what} needs a date and time.`);
  if (d.getTime() < EARLIEST || d.getTime() > Date.now() + LATEST_AHEAD) throw refuse(400, `${what} is outside the years this book covers.`);
  return d;
}

function minutesOf(v: unknown): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n < MINUTES.min || n > MINUTES.max) throw refuse(400, `A visit is between ${MINUTES.min} minutes and ${MINUTES.max / 60} hours long.`);
  return n;
}

/** A chair number or null (unplaced). The upper bound is the clinic's chair count, checked inside the transaction. */
function chairOf(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1) throw refuse(400, 'A chair is numbered from 1.');
  return n;
}

function idOf(v: unknown, what: string): string | null {
  if (v === null || v === undefined || v === '') return null;
  // Postgres writes uuids in lower case; comparing the caller's spelling would read an
  // unchanged dentist as a change and write a move that never happened.
  const s = String(v).toLowerCase();
  if (!UUID.test(s)) throw refuse(400, `${what} was not recognised.`);
  return s;
}

function text(v: unknown, max: number): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/\s+/g, ' ').trim();
  return s ? s.slice(0, max) : null;
}

// ---------------------------------------------------------------------------
// Inside the transaction
// ---------------------------------------------------------------------------
type ClinicRow = { chairs: number; name: string; phone: string | null; slug: string };

async function clinicRow(tx: Tx, clinicId: string): Promise<ClinicRow> {
  // One writer per clinic book at a time, for this transaction only.
  await tx.query('select pg_advisory_xact_lock(hashtext($1))', [clinicId]);
  const { rows } = await tx.query<ClinicRow>('select chairs, name, phone, slug from clinic where id = $1', [clinicId]);
  if (!rows[0]) throw refuse(403, 'This account cannot open that clinic.');
  return rows[0];
}

function checkChair(chair: number | null, c: ClinicRow) {
  if (chair !== null && chair > c.chairs) throw refuse(400, c.chairs === 1 ? 'This branch has one chair.' : `This branch has ${c.chairs} chairs; pick one of them.`);
}

/** A dentist is a staff member with access to, or days at, this clinic, in a role that treats. */
async function checkDentist(tx: Tx, clinicId: string, dentistId: string | null) {
  if (dentistId === null) return;
  const { rowCount } = await tx.query(
    `select 1 from staff s
      where s.id = $1 and s.disabled_at is null and s.role in ('owner', 'dentist', 'associate')
        and (exists (select 1 from staff_access a where a.staff_id = s.id and a.clinic_id = $2)
          or exists (select 1 from staff_schedule ss where ss.staff_id = s.id and ss.clinic_id = $2))`, [dentistId, clinicId]);
  if (!rowCount) throw refuse(400, 'That dentist is not at this clinic.');
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
        const [first, ...rest] = newPatient!.name.split(' ');
        const last = rest.join(' ') || '—';
        const { rows } = await tx.query<{ id: string }>(
          'insert into patient (clinic_id, chart_no, first_name, last_name, phone) values ($1, $2, $3, $4, $5) returning id',
          [clinic.id, await nextChartNo(tx), first, last, newPatient!.phone]);
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

      const ref = publicRef(c.slug);
      const { rows: [row] } = await tx.query<{ id: string }>(
        `insert into appointment (clinic_id, patient_id, dentist_id, chair, starts_at, ends_at, reason, status, source, public_ref, catalog_id, notes, created_by)
         values ($1, $2, $3, $4, $5, $6, $7, 'booked', 'staff', $8, $9, $10, $11) returning id`,
        [clinic.id, pid, dentistId, chair, startsAt, endsAt, why, ref, catalogId, notes, session.staffId]);

      let texted = false;
      if (canText(phone) && startsAt.getTime() > Date.now()) {
        texted = (await queueText(tx, { clinicId: clinic.id, to: phone!, body: scheduleTexts.confirmation(c.name, why, startsAt, ref, c.phone), kind: 'confirmation', patientId: pid, appointmentId: row.id, staffId: session.staffId })) !== null;
      }
      await tx.query(`insert into audit_log (clinic_id, staff_id, action, entity, entity_id) values ($1, $2, 'appointment.create', 'appointment', $3)`, [clinic.id, session.staffId, row.id]);
      return { appointment: await withExtras(tx, await mustRead(tx, row.id)), texted };
    });
    return json(saved, 201);
  } catch (e) { return answer(e); }
};

// ---------------------------------------------------------------------------
// PATCH — move a visit, change its status, or edit its words
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

    const saved = await withClinic(clinic.id, async (tx) => {
      let texted = false;
      const c = await clinicRow(tx, clinic.id);
      const { rows: [cur] } = await tx.query<{ patient_id: string; starts_at: Date; ends_at: Date; chair: number | null; dentist_id: string | null; status: string; public_ref: string | null; phone: string | null }>(
        `select a.patient_id, a.starts_at, a.ends_at, a.chair, a.dentist_id, a.status, a.public_ref, coalesce(nullif(a.booked_by_phone, ''), p.phone) as phone
           from appointment a join patient p on p.id = a.patient_id where a.id = $1 for update of a`, [id]);
      if (!cur) throw refuse(400, 'That visit is not on this book.');

      const startsAt = wantStart ?? new Date(cur.starts_at);
      const minutes = wantMinutes ?? Math.round((new Date(cur.ends_at).getTime() - new Date(cur.starts_at).getTime()) / 60_000);
      const endsAt = new Date(startsAt.getTime() + minutes * 60_000);
      const chair = wantChair === undefined ? cur.chair : wantChair;
      const dentistId = wantDentist === undefined ? cur.dentist_id : wantDentist;
      const timeChanged = startsAt.getTime() !== new Date(cur.starts_at).getTime() || endsAt.getTime() !== new Date(cur.ends_at).getTime();
      const moved = timeChanged || chair !== cur.chair || dentistId !== cur.dentist_id;

      if (moved) {
        // A visit that has left the book keeps its history; it does not get a new time.
        if (DONE.has(cur.status)) throw refuse(400, `That visit is marked ${WORDS[cur.status] ?? cur.status}. Book a new visit instead.`);
        checkChair(chair, c);
        if (dentistId !== cur.dentist_id) await checkDentist(tx, clinic.id, dentistId);
        const clash = await findClash(tx, clinic.id, { id, startsAt, endsAt, chair, dentistId });
        if (clash) throw refuse(409, clash);
        await tx.query('update appointment set starts_at = $2, ends_at = $3, chair = $4, dentist_id = $5, moved_at = now() where id = $1', [id, startsAt, endsAt, chair, dentistId]);
        await tx.query(`insert into audit_log (clinic_id, staff_id, action, entity, entity_id) values ($1, $2, 'appointment.move', 'appointment', $3)`, [clinic.id, session.staffId, id]);
        // A new time for a visit still ahead, and a number to reach: tell them — after
        // dropping the texts that still name the old time, so nobody gets both.
        if (timeChanged) await dropStaleTexts(tx, id);
        if (startsAt.getTime() !== new Date(cur.starts_at).getTime() && startsAt.getTime() > Date.now() && canText(cur.phone)) {
          texted = (await queueText(tx, { clinicId: clinic.id, to: cur.phone!, body: scheduleTexts.moved(c.name, startsAt, cur.public_ref, c.phone), kind: 'confirmation', patientId: cur.patient_id, appointmentId: id, staffId: session.staffId })) !== null;
        }
      }

      if (wantReason !== undefined || wantNotes !== undefined) {
        await tx.query('update appointment set reason = coalesce($2, reason), notes = case when $4 then $3 else notes end where id = $1',
          [id, wantReason ?? null, wantNotes ?? null, wantNotes !== undefined]);
        if (!moved) await tx.query(`insert into audit_log (clinic_id, staff_id, action, entity, entity_id) values ($1, $2, 'appointment.edit', 'appointment', $3)`, [clinic.id, session.staffId, id]);
      }

      if (status !== null && status !== cur.status) await applyStatus(tx, clinic.id, session.staffId, id, status, cur.status);
      return { appointment: await withExtras(tx, await mustRead(tx, id)), texted };
    });
    return json(saved);
  } catch (e) { return answer(e); }
};
