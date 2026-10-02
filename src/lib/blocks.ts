// Blocked time on the desk's side (040): the ranges a clinic is not open for booking, read and written inside a
// clinic transaction (withClinic), so row-level security is the fence.
//
// clinic_unavailable() (040) is the one reader that turns the week's shape (the hours, lunch, a dentist's days
// and hours) and the dated blocks (a closure, a dentist away, a chair out of use) into dated ranges; everything
// here asks it rather than working the week out again. A block is only ever added or removed (the table takes
// insert and a removal, nothing else), and every change to one takes the book's lock
// (pg_advisory_xact_lock(hashtext(clinic id)), the lock /api/schedule and /api/bookings take) so a booking and a
// block never pass each other.
//
// Nothing here queues, cancels or changes a text, and nothing moves or cancels a visit. A visit in closed time is
// listed (Calls → In closed time, the Block time panel), with its reminder's state, until someone moves it or
// keeps it there: appointment.blocked_ok_at records "kept" (Book anyway, Move anyway, a walk-in, Keep it); null
// means nobody has looked. Words: src/lib/block-words.ts.
import type { Tx } from './db';
import { isDentistHere, WORDS, type Proposed } from './schedule';
import { blockSentence, whyWords, type BlockKind, type RangeKind, type RangeLike } from './block-words';
import { remindersFor, reminderWords } from './reminder-state';

export type { BlockKind, RangeKind } from './block-words';

/** One range of blocked time, as the desk sees it (names and the note are staff-only). `id` is the block's for a
 *  dated block, null for the weekly kinds (lunch, hours). */
export interface BlockRange {
  id: string | null; kind: RangeKind; dentistId: string | null; dentistName: string | null;
  chair: number | null; startsAt: string; endsAt: string; note: string | null; byName: string | null; createdAt: string | null;
}
/** A visit booked in closed time: who, when, where, why (whyWords), and the reminder's state in the Calls page's
 *  words (reminder-state.ts) — `reminder` the line, `reminderTone` its icon and tint, `reminderShort` the call sheet's. */
export interface InsideVisit {
  id: string; patientName: string; chartNo: string; phone: string | null; startsAt: string; endsAt: string;
  dentistName: string | null; chair: number | null; why: string; reminder: string;
  reminderTone: 'ok' | 'wait' | 'none'; reminderShort: string;
}
export interface NewBlock { kind: BlockKind; startsAt: Date; endsAt: Date; dentistId: string | null; chair: number | null; note: string | null }

/** A refusal in the desk's words (the block is not on this book, already removed, a dentist not here). */
export class BlockRefused extends Error {}

/** Which ranges a visit sits in: a range for the whole clinic, its dentist's, or its chair's, overlapping it. `u` is a
 *  clinic_unavailable() row, `a` the appointment. Shared by closedIds, visitsInClosedTime and the inbox's count. */
export const IN_SCOPE_SQL = `(((u.dentist_id is null and u.chair is null) or u.dentist_id = a.dentist_id or u.chair = a.chair)
  and u.starts_at < a.ends_at and u.ends_at > a.starts_at)`;

/** The order a visit's ranges are named in when it sits in more than one: the widest reason first. */
const PRIORITY_SQL = `array_position(array['closed', 'shut', 'lunch', 'leave', 'hours', 'chair_out']::text[], u.kind)`;

/** Visits that can still be dealt with: booked or confirmed, ahead, with a real time (not brought in with its day
 *  only, not a web request the desk has not placed). */
export const VISIT_AHEAD_SQL = `a.status in ('booked', 'confirmed') and a.starts_at > now() and not a.date_only
  and not (a.source = 'request' and a.moved_at is null)`;

/** How far ahead closed time is looked for (clinic_unavailable reads 400 days at most). */
const AHEAD = `interval '366 days'`;

const lockBook = (tx: Tx, clinicId: string) => tx.query('select pg_advisory_xact_lock(hashtext($1))', [clinicId]);

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------
type RangeRow = {
  block_id: string | null; kind: RangeKind; dentist_id: string | null; dentist_name: string | null; chair: number | null;
  starts_at: Date; ends_at: Date; note: string | null; by_name: string | null; created_at: Date | null;
};
const iso = (d: Date | string) => new Date(d).toISOString();
const toRange = (r: RangeRow): BlockRange => ({
  id: r.block_id ?? null, kind: r.kind, dentistId: r.dentist_id ?? null, dentistName: r.dentist_name ?? null,
  chair: r.chair ?? null, startsAt: iso(r.starts_at), endsAt: iso(r.ends_at), note: r.note ?? null,
  byName: r.by_name ?? null, createdAt: r.created_at ? iso(r.created_at) : null,
});
const asWords = (r: BlockRange): RangeLike => ({ kind: r.kind, startsAt: r.startsAt, endsAt: r.endsAt, dentistName: r.dentistName, chair: r.chair, note: r.note });

/** Every range but 'shut' in [from, to), with names and notes (staff only), soonest first. One query:
 *  clinic_unavailable ⋈ staff ⋈ clinic_block. A window over 400 days throws, as the SQL does: never an empty answer
 *  that would draw no lunch. */
export async function loadBlocks(tx: Tx, clinicId: string, from: Date, to: Date): Promise<BlockRange[]> {
  if (to.getTime() - from.getTime() > 400 * 86_400_000) throw new Error('loadBlocks reads 400 days at most at a time');
  const { rows } = await tx.query<RangeRow>(
    `select u.block_id, u.kind, u.dentist_id, s.full_name as dentist_name, u.chair, u.starts_at, u.ends_at,
            b.note, cb.full_name as by_name, b.created_at
       from clinic_unavailable($1, $2, $3) u
       left join staff s on s.id = u.dentist_id
       left join clinic_block b on b.id = u.block_id
       left join staff cb on cb.id = b.created_by
      where u.kind <> 'shut'
      order by u.starts_at, ${PRIORITY_SQL}, s.full_name nulls first, u.chair nulls first`, [clinicId, from, to]);
  return rows.map(toRange);
}

/** One dated block by id, with its names, removed or not; null when RLS or the id finds nothing. */
async function blockById(tx: Tx, id: string): Promise<BlockRange | null> {
  const { rows } = await tx.query<RangeRow>(
    `select b.id as block_id, b.kind, b.dentist_id, s.full_name as dentist_name, b.chair, b.starts_at, b.ends_at,
            b.note, cb.full_name as by_name, b.created_at
       from clinic_block b
       left join staff s on s.id = b.dentist_id
       left join staff cb on cb.id = b.created_by
      where b.id = $1`, [id]);
  return rows[0] ? toRange(rows[0]) : null;
}

/** The first range the proposed visit sits in, in its scope (the whole clinic, its dentist, its chair), by priority
 *  closed, shut, lunch, leave, hours, chair_out, then time; null when none. The sentence is the soft stop's. */
export async function findBlock(tx: Tx, clinicId: string, p: Proposed): Promise<{ kind: RangeKind; sentence: string } | null> {
  const { rows } = await tx.query<RangeRow>(
    `select u.block_id, u.kind, u.dentist_id, s.full_name as dentist_name, u.chair, u.starts_at, u.ends_at,
            b.note, null::text as by_name, null::timestamptz as created_at
       from clinic_unavailable($1, $2, $3) u
       left join staff s on s.id = u.dentist_id
       left join clinic_block b on b.id = u.block_id
      where (u.dentist_id is null and u.chair is null) or u.dentist_id = $4::uuid or u.chair = $5::smallint
      order by ${PRIORITY_SQL}, u.starts_at
      limit 1`, [clinicId, p.startsAt, p.endsAt, p.dentistId, p.chair]);
  if (!rows[0]) return null;
  const r = toRange(rows[0]);
  return { kind: r.kind, sentence: blockSentence(asWords(r)) };
}

/** Closed days in Settings: the dated blocks not removed that end in the future, soonest first, 100 at most. */
export async function upcomingBlocks(tx: Tx, clinicId: string): Promise<BlockRange[]> {
  const { rows } = await tx.query<RangeRow>(
    `select b.id as block_id, b.kind, b.dentist_id, s.full_name as dentist_name, b.chair, b.starts_at, b.ends_at,
            b.note, cb.full_name as by_name, b.created_at
       from clinic_block b
       left join staff s on s.id = b.dentist_id
       left join staff cb on cb.id = b.created_by
      where b.clinic_id = $1 and b.removed_at is null and b.ends_at > now()
      order by b.starts_at, b.created_at
      limit 100`, [clinicId]);
  return rows.map(toRange);
}

// ---------------------------------------------------------------------------
// Visits in closed time
// ---------------------------------------------------------------------------
type VisitRow = {
  id: string; patient_name: string; chart_no: string; phone: string | null; starts_at: Date; ends_at: Date;
  dentist_name: string | null; chair: number | null;
  w_kind: RangeKind; w_dentist: string | null; w_chair: number | null; w_starts: Date; w_ends: Date; w_note: string | null;
};
/** The visit (a, its patient p, its dentist sd) and the range that says why (`w`: kind, dentist_name, chair, times, note). */
const visitColumns = (w: string) => `a.id, concat_ws(' ', p.first_name, nullif(p.last_name, '—')) as patient_name, p.chart_no,
       coalesce(nullif(a.booked_by_phone, ''), p.phone) as phone, a.starts_at, a.ends_at,
       coalesce(sd.full_name, a.dentist_name) as dentist_name, a.chair,
       ${w}.kind as w_kind, ${w}.dentist_name as w_dentist, ${w}.chair as w_chair, ${w}.starts_at as w_starts, ${w}.ends_at as w_ends, ${w}.note as w_note`;

/** Rows to InsideVisits, each with the reminder text's state as Calls words it. */
async function insideVisits(tx: Tx, rows: VisitRow[]): Promise<InsideVisit[]> {
  const reminders = await remindersFor(tx, rows.map((r) => r.id));
  // Every visit listed here is in closed time nobody kept: at a clinic that holds reminders then (044), its reminder waits.
  const held = rows.length > 0 && !!(await tx.query<{ h: boolean }>(
    `select hold_closed_reminders as h from clinic where id = nullif(current_setting('app.clinic_id', true), '')::uuid`)).rows[0]?.h;
  return rows.map((r) => {
    const startsAt = new Date(r.starts_at), phone = r.phone ?? null;
    const rem = reminderWords({ startsAt, phone, held }, reminders.get(r.id));
    return {
      id: r.id, patientName: r.patient_name, chartNo: r.chart_no, phone, startsAt: iso(startsAt), endsAt: iso(r.ends_at),
      dentistName: r.dentist_name ?? null, chair: r.chair ?? null,
      why: whyWords({ kind: r.w_kind, startsAt: iso(r.w_starts), endsAt: iso(r.w_ends), dentistName: r.w_dentist, chair: r.w_chair, note: r.w_note }),
      reminder: rem.text, reminderTone: rem.tone, reminderShort: rem.short,
    };
  });
}

/** The ids of the visits in closed time, WHATEVER blocked_ok_at says: booked or confirmed, ahead, not brought in with
 *  its day only, not a web request the desk has not placed, overlapping a clinic_unavailable() range in its scope over
 *  [now, now + 366 days). `dentistId` narrows it to that dentist's visits. Call it after taking the book's lock. */
export async function closedIds(tx: Tx, clinicId: string, o: { dentistId?: string } = {}): Promise<string[]> {
  const { rows } = await tx.query<{ id: string }>(
    `with u as materialized (select * from clinic_unavailable($1, now(), now() + ${AHEAD}))
     select a.id from appointment a
      where a.clinic_id = $1 and ${VISIT_AHEAD_SQL} and ($2::uuid is null or a.dentist_id = $2::uuid)
        and exists (select 1 from u where ${IN_SCOPE_SQL})
      order by a.starts_at`, [clinicId, o.dentistId ?? null]);
  return rows.map((r) => r.id);
}

/** After a weekly change (lunch, the hours, a dentist's hours), under the same lock: the visits in closed time now
 *  that were not in `before` (closedIds, read before the change) get blocked_ok_at = null, so they appear on Calls
 *  even if kept for another reason earlier. Returns their ids; the save's sentence counts them. */
export async function reopenNewlyClosed(tx: Tx, clinicId: string, before: string[], o: { dentistId?: string } = {}): Promise<string[]> {
  const was = new Set(before);
  const newly = (await closedIds(tx, clinicId, o)).filter((id) => !was.has(id));
  if (newly.length) await tx.query('update appointment set blocked_ok_at = null where id = any($1::uuid[])', [newly]);
  if (newly.length) await holdClosedReminders(tx, clinicId);
  return newly;
}

/**
 * At a clinic that holds reminders for visits in closed time nobody kept (clinic.hold_closed_reminders, 044): the
 * reminders still waiting for such visits are withdrawn (status cancelled, dedupe key cleared), so the reminder pass
 * writes them again once the visit is kept (Calls → Keep it, Book/Move anyway) or moved out. Sent, sending and
 * held-over texts are left. Nothing at a clinic that does not hold. Returns how many were withdrawn.
 */
export async function holdClosedReminders(tx: Tx, clinicId: string): Promise<number> {
  const r = await tx.query(
    `update message_log m set status = 'cancelled', dedupe_key = null
       from appointment a
      where m.appointment_id = a.id and a.clinic_id = $1 and m.direction = 'out' and m.status = 'queued' and m.kind = 'reminder'
        and (m.dedupe_key = 'reminder:' || a.id or m.dedupe_key = 'remind48:' || a.id)
        and appointment_reminder_held(a.id)`, [clinicId]);
  return r.rowCount ?? 0;
}

/** Calls → In closed time: closedIds' rule with blocked_ok_at null (nobody has kept it there), soonest first, 200 at
 *  most, each with why (the first range it sits in, by priority) and its reminder's state. */
export async function visitsInClosedTime(tx: Tx, clinicId: string): Promise<InsideVisit[]> {
  const { rows } = await tx.query<VisitRow>(
    `with u as materialized (
       select u.kind, u.dentist_id, u.chair, u.starts_at, u.ends_at, s.full_name as dentist_name, b.note
         from clinic_unavailable($1, now(), now() + ${AHEAD}) u
         left join staff s on s.id = u.dentist_id
         left join clinic_block b on b.id = u.block_id)
     select ${visitColumns('w')}
       from appointment a
       join patient p on p.id = a.patient_id
       left join staff sd on sd.id = a.dentist_id
       cross join lateral (select * from u where ${IN_SCOPE_SQL} order by ${PRIORITY_SQL}, u.starts_at limit 1) w
      where a.clinic_id = $1 and a.blocked_ok_at is null and ${VISIT_AHEAD_SQL}
      order by a.starts_at, patient_name
      limit 200`, [clinicId]);
  return insideVisits(tx, rows);
}

/** Calls → Keep it: the visit stays where it is, in closed time, and leaves the list. Row locked; it must still be
 *  booked or confirmed. Audit 'appointment.keep_blocked'. */
export async function keepInClosedTime(tx: Tx, clinicId: string, staffId: string, id: string): Promise<void> {
  const { rows: [cur] } = await tx.query<{ status: string }>('select status from appointment where id = $1 for update', [id]);
  if (!cur) throw new BlockRefused('That visit is not on this branch’s book any more.');
  if (cur.status !== 'booked' && cur.status !== 'confirmed') throw new BlockRefused(`That visit is already marked ${WORDS[cur.status] ?? cur.status}: there is nothing to keep.`);
  await tx.query('update appointment set blocked_ok_at = now() where id = $1', [id]);
  await tx.query(`insert into audit_log (clinic_id, staff_id, action, entity, entity_id) values ($1, $2, 'appointment.keep_blocked', 'appointment', $3)`, [clinicId, staffId, id]);
}

// ---------------------------------------------------------------------------
// Reading what the desk sent (the words are spec p07 §3.3)
// ---------------------------------------------------------------------------
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KINDS: readonly BlockKind[] = ['closed', 'leave', 'chair_out'];
const DAY_MS = 86_400_000, YEAR_AT_MOST = 366 * DAY_MS, BOOK_AHEAD = 3 * 365 * DAY_MS;
/** Today's checkChair words (src/lib/schedule-api.ts). */
const chairWords = (chairs: number) => (chairs === 1 ? 'This branch has one chair.' : `This branch has ${chairs} chairs; pick one of them.`);
/** A note as the API's text() reads a field: whitespace collapsed, trimmed, 200 characters at most; empty is none. */
const noteOf = (v: unknown) => { if (v === null || v === undefined) return null; const s = String(v).replace(/\s+/g, ' ').trim(); return s ? s.slice(0, 200) : null; };
const idOf = (v: unknown) => { const s = typeof v === 'string' ? v.trim().toLowerCase() : ''; return UUID.test(s) ? s : null; };
const dateOf = (v: unknown) => { const d = new Date(typeof v === 'string' || typeof v === 'number' ? v : NaN); return Number.isNaN(d.getTime()) ? null : d; };

/** The checks every block passes once it has a kind, a dentist or chair, and two times. */
function checkSpan(kind: BlockKind, startsAt: Date, endsAt: Date, rest: Omit<NewBlock, 'kind' | 'startsAt' | 'endsAt'>, now: Date, words: { order: string }): NewBlock | { error: string } {
  if (endsAt.getTime() <= startsAt.getTime()) return { error: words.order };
  if (endsAt.getTime() - startsAt.getTime() > YEAR_AT_MOST) return { error: 'Block a year at most at a time.' };
  if (endsAt.getTime() <= now.getTime()) return { error: 'That time has passed.' };
  if (startsAt.getTime() > now.getTime() + BOOK_AHEAD) return { error: 'That is outside the years this book covers.' };
  return { kind, startsAt, endsAt, ...rest };
}

/** A block from the calendar's panel (JSON): kind, the dentist for leave, the chair for a chair, ISO times, a note. */
export function readBlock(input: { kind?: unknown; dentistId?: unknown; chair?: unknown; startsAt?: unknown; endsAt?: unknown; note?: unknown },
  o: { chairs: number; now: Date }): NewBlock | { error: string } {
  const kind = KINDS.find((k) => k === input.kind);
  if (!kind) return { error: 'Choose what is blocked: the clinic, a dentist or a chair.' };
  let dentistId: string | null = null, chair: number | null = null;
  if (kind === 'leave') { dentistId = idOf(input.dentistId); if (!dentistId) return { error: 'Choose the dentist who is away.' }; }
  if (kind === 'chair_out') {
    const n = Number(input.chair);
    if (input.chair === null || input.chair === undefined || input.chair === '' || !Number.isInteger(n) || n < 1 || n > o.chairs) return { error: chairWords(o.chairs) };
    chair = n;
  }
  const startsAt = dateOf(input.startsAt), endsAt = dateOf(input.endsAt);
  if (!startsAt || !endsAt) return { error: 'Pick when it starts and when it ends.' };
  return checkSpan(kind, startsAt, endsAt, { dentistId, chair, note: noteOf(input.note) }, o.now, { order: 'It ends before it starts.' });
}

/** A block from Settings → Closed days (a form): kind closed or leave, the dentist for leave, From and Until as
 *  dates, read as whole Manila days [from 00:00, until + 1 day 00:00). A blank Until is one day. */
export function readWholeDays(form: FormData, o: { now: Date }): NewBlock | { error: string } {
  const kind = (['closed', 'leave'] as const).find((k) => k === form.get('kind'));
  if (!kind) return { error: 'Choose what is blocked: the clinic, a dentist or a chair.' };
  let dentistId: string | null = null;
  if (kind === 'leave') { dentistId = idOf(form.get('dentist')); if (!dentistId) return { error: 'Choose the dentist who is away.' }; }
  const ymd = (v: FormDataEntryValue | null) => {
    const s = typeof v === 'string' ? v.trim() : '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) !== s) return null;
    return s;
  };
  const from = ymd(form.get('from'));
  if (!from) return { error: 'Pick the first day.' };
  const untilRaw = form.get('until');
  const until = typeof untilRaw === 'string' && untilRaw.trim() ? ymd(untilRaw) : from;
  if (!until) return { error: 'Pick the first day.' };
  const startsAt = new Date(`${from}T00:00:00+08:00`), endsAt = new Date(Date.parse(`${until}T00:00:00+08:00`) + DAY_MS);
  return checkSpan(kind, startsAt, endsAt, { dentistId, chair: null, note: noteOf(form.get('note')) }, o.now, { order: 'Until is before From.' });
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

/** Add a block, under the book's lock: the dentist must be at this clinic (isDentistHere) and the chair within its
 *  count. Visits ahead inside it (in its scope) lose any earlier "kept", so a new closure puts them on Calls: nothing
 *  else happens to them, and no text changes. Audit 'schedule.block'. Returns the block and the visits inside it. */
export async function addBlock(tx: Tx, clinicId: string, staffId: string, b: NewBlock): Promise<{ block: BlockRange; inside: InsideVisit[] }> {
  await lockBook(tx, clinicId);
  const { rows: [c] } = await tx.query<{ chairs: number }>('select chairs from clinic where id = $1', [clinicId]);
  if (!c) throw new BlockRefused('This account cannot open that clinic.');
  if (b.kind === 'chair_out' && (b.chair === null || b.chair > c.chairs)) throw new BlockRefused(chairWords(c.chairs));
  if (b.kind === 'leave' && (!b.dentistId || !(await isDentistHere(tx, clinicId, b.dentistId)))) throw new BlockRefused('That dentist is not at this clinic.');
  const { rows: [row] } = await tx.query<{ id: string }>(
    `insert into clinic_block (clinic_id, kind, starts_at, ends_at, dentist_id, chair, note, created_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
    [clinicId, b.kind, b.startsAt, b.endsAt, b.kind === 'leave' ? b.dentistId : null, b.kind === 'chair_out' ? b.chair : null, b.note, staffId]);
  await tx.query(
    `with u as (select dentist_id, chair, starts_at, ends_at from clinic_block where id = $1)
     update appointment a set blocked_ok_at = null from u
      where a.clinic_id = $2 and a.blocked_ok_at is not null and ${VISIT_AHEAD_SQL} and ${IN_SCOPE_SQL}`, [row.id, clinicId]);
  await tx.query(`insert into audit_log (clinic_id, staff_id, action, entity, entity_id) values ($1, $2, 'schedule.block', 'clinic_block', $3)`, [clinicId, staffId, row.id]);
  const block = (await blockById(tx, row.id))!;
  const { rows } = await tx.query<VisitRow>(
    `with u as (select b.kind, b.dentist_id, b.chair, b.starts_at, b.ends_at, b.note, s.full_name as dentist_name
                  from clinic_block b left join staff s on s.id = b.dentist_id where b.id = $1)
     select ${visitColumns('u')}
       from appointment a
       join patient p on p.id = a.patient_id
       left join staff sd on sd.id = a.dentist_id
       cross join u
      where a.clinic_id = $2 and ${VISIT_AHEAD_SQL} and ${IN_SCOPE_SQL}
      order by a.starts_at, patient_name
      limit 200`, [row.id, clinicId]);
  await holdClosedReminders(tx, clinicId);
  return { block, inside: await insideVisits(tx, rows) };
}

/** Remove a block, under the book's lock: removed_at and removed_by, never a delete (the table allows nothing else).
 *  Audit 'schedule.unblock'. Returns the block as it was. */
export async function removeBlock(tx: Tx, clinicId: string, staffId: string, id: string): Promise<BlockRange> {
  await lockBook(tx, clinicId);
  const { rows: [cur] } = await tx.query<{ removed_at: Date | null }>('select removed_at from clinic_block where id = $1 for update', [id]);
  if (!cur) throw new BlockRefused('That block is not on this book.');
  if (cur.removed_at) throw new BlockRefused('That block was already removed.');
  const { rowCount } = await tx.query('update clinic_block set removed_at = now(), removed_by = $2 where id = $1 and removed_at is null', [id, staffId]);
  if (!rowCount) throw new BlockRefused('That block was already removed.');
  await tx.query(`insert into audit_log (clinic_id, staff_id, action, entity, entity_id) values ($1, $2, 'schedule.unblock', 'clinic_block', $3)`, [clinicId, staffId, id]);
  return (await blockById(tx, id))!;
}
