// The schedule's data: what a day looks like, whether a visit fits, and the
// state machine a visit moves through. The page (/c/<slug>/schedule/) reads
// loadRange() for its first paint and the API (/api/schedule) for every change;
// both come here so the two never disagree about what a visit is.
//
// Rules kept from the Today page and the service map. Every query runs inside
// withClinic(): row-level security scopes it to one clinic, and the tenant is
// the protection, not a WHERE clause. A chair or a dentist is never shown
// holding two visits at once: findClash() answers with one sentence naming who
// is in the way, and the API refuses the write. Status changes are the Today
// page's state machine, copied here as ALLOWED and applyStatus() so the two
// pages keep one set of rules; a change to the machine is a change in both.
//
// chair is null until the desk places a visit. Web bookings and older rows
// arrive that way and sit in the page's Unplaced lane — the inbox — so
// nothing here invents a chair for them.

import type { Tx } from './db';
import { withClinic } from './db';
import { normalizePhone, PH_MOBILE } from './messages';

export type Appt = {
  id: string;
  patientId: string;
  patientName: string;
  chartNo: string;
  /** The number to reach them on: whoever booked when the visit is for someone else, else the patient's own. */
  phone: string | null;
  dentistId: string | null;
  dentistName: string | null;
  /** 1-based chair; null = not yet placed (the Unplaced lane). */
  chair: number | null;
  startsAt: string;
  endsAt: string;
  reason: string | null;
  status: string;
  source: string;
  publicRef: string | null;
  notes: string | null;
  /** The latest medical history's allergies, joined with commas; null when none are recorded. */
  allergies: string | null;
};

export type Range = {
  appointments: Appt[];
  chairs: number;
  /** dow (0 = Sunday) → [openMin, closeMin], or null when the clinic is shut that day. */
  hours: Record<number, [number, number] | null>;
  staff: { id: string; name: string; days: number[] }[];
  catalog: { code: string; name: string; minutes: number }[];
};

/** The statuses the desk may move a visit to — the Today page's set, copied, not forked. 'booked' is where a visit starts and is not a destination. */
export const ALLOWED = new Set(['confirmed', 'arrived', 'in_lobby', 'in_chair', 'completed', 'no_show', 'cancelled']);

/** A visit in these states still holds its chair and its dentist. Anything else has left the room. */
const HOLDS_SLOT = `a.status not in ('cancelled', 'no_show', 'completed')`;

// ---------------------------------------------------------------------------
// One select for every read, so a visit looks the same after a write as in a
// range. Web bookings for a single-word name store '—' as the last name (the
// bookings API); it is dropped here the way patient_visits() does.
// ---------------------------------------------------------------------------
const APPT_SELECT = `
  select a.id, a.patient_id, concat_ws(' ', p.first_name, nullif(p.last_name, '—')) as patient_name, p.chart_no,
         coalesce(nullif(a.booked_by_phone, ''), p.phone) as phone,
         a.dentist_id, s.full_name as dentist_name, a.chair, a.starts_at, a.ends_at, a.reason, a.status, a.source, a.public_ref, a.notes,
         (select h.allergies from medical_history h where h.patient_id = p.id order by h.answered_at desc limit 1) as allergies
    from appointment a
    join patient p on p.id = a.patient_id
    left join staff s on s.id = a.dentist_id`;

// A type alias, not an interface: pg's row constraint has an index signature, which an interface does not satisfy implicitly.
type ApptRow = {
  id: string; patient_id: string; patient_name: string; chart_no: string; phone: string | null;
  dentist_id: string | null; dentist_name: string | null; chair: number | null; starts_at: Date; ends_at: Date;
  reason: string | null; status: string; source: string; public_ref: string | null; notes: string | null; allergies: string[] | null;
};

export function rowToAppt(r: ApptRow): Appt {
  return {
    id: r.id, patientId: r.patient_id, patientName: r.patient_name, chartNo: r.chart_no, phone: r.phone ?? null,
    dentistId: r.dentist_id ?? null, dentistName: r.dentist_name ?? null, chair: r.chair ?? null,
    startsAt: new Date(r.starts_at).toISOString(), endsAt: new Date(r.ends_at).toISOString(),
    reason: r.reason ?? null, status: r.status, source: r.source, publicRef: r.public_ref ?? null, notes: r.notes ?? null,
    allergies: r.allergies?.length ? r.allergies.join(', ') : null,
  };
}

/** One visit by id, inside a clinic transaction; null when RLS or the id finds nothing. */
export async function readAppt(tx: Tx, id: string): Promise<Appt | null> {
  const { rows } = await tx.query<ApptRow>(`${APPT_SELECT} where a.id = $1`, [id]);
  return rows[0] ? rowToAppt(rows[0]) : null;
}

// ---------------------------------------------------------------------------
// A range: the visits, the chairs, the hours, who sits here, and what the
// clinic does. The page draws a day or a week from it.
// ---------------------------------------------------------------------------
export async function loadRange(clinicId: string, fromIso: string, toIso: string): Promise<Range> {
  const from = new Date(fromIso), to = new Date(toIso);
  return withClinic(clinicId, async (tx) => {
    const { rows: appts } = await tx.query<ApptRow>(
      `${APPT_SELECT}
       where a.starts_at < $2 and a.ends_at > $1 and a.status <> 'cancelled'
       order by a.starts_at, a.chair nulls last, a.created_at`, [from, to]);
    const { rows: [me] } = await tx.query<{ chairs: number }>('select chairs from clinic where id = $1', [clinicId]);
    const { rows: hrs } = await tx.query<{ dow: number; open_min: number; close_min: number }>('select dow, open_min, close_min from clinic_hours order by dow');
    // Dentists are staff who sit here on some day of the week. The team page writes days for every role,
    // so the roles that treat are named; an owner is a dentist at every clinic the seed and sign-up create.
    const { rows: staff } = await tx.query<{ id: string; name: string; days: number[] }>(
      `select s.id, s.full_name as name, array_agg(ss.dow order by ss.dow) as days
         from staff s join staff_schedule ss on ss.staff_id = s.id
        where ss.clinic_id = $1 and s.disabled_at is null and s.role in ('owner', 'dentist', 'associate')
        group by s.id, s.full_name
        order by s.role = 'owner' desc, s.full_name`, [clinicId]);
    // A procedure with no chair time was never bookable online; at the desk it takes the half hour the directory assumes.
    const { rows: catalog } = await tx.query<{ code: string; name: string; minutes: number }>(
      `select code, name, coalesce(minutes, 30)::int as minutes from procedure_catalog where active order by category nulls last, name`);
    const hours: Range['hours'] = { 0: null, 1: null, 2: null, 3: null, 4: null, 5: null, 6: null };
    for (const h of hrs) hours[h.dow] = [h.open_min, h.close_min];
    return { appointments: appts.map(rowToAppt), chairs: me?.chairs ?? 1, hours, staff, catalog };
  });
}

// ---------------------------------------------------------------------------
// Would this visit sit on top of another? One sentence naming who is in the
// way, or null. The chair is checked when there is one, the dentist when there
// is one; a visit's own row never clashes with itself. Cancelled, no-show and
// completed visits have left the chair and are not in the way.
// ---------------------------------------------------------------------------
export interface Proposed { id?: string; startsAt: Date; endsAt: Date; chair: number | null; dentistId: string | null }

export async function findClash(tx: Tx, clinicId: string, p: Proposed): Promise<string | null> {
  const own = p.id ?? null;
  if (p.chair !== null) {
    const { rows } = await tx.query<{ who: string; ends_at: Date }>(
      `select concat_ws(' ', p.first_name, nullif(p.last_name, '—')) as who, a.ends_at
         from appointment a join patient p on p.id = a.patient_id
        where a.clinic_id = $1 and a.chair = $2 and a.starts_at < $4 and a.ends_at > $3 and ${HOLDS_SLOT}
          and ($5::uuid is null or a.id <> $5)
        order by a.starts_at limit 1`, [clinicId, p.chair, p.startsAt, p.endsAt, own]);
    if (rows[0]) return `Chair ${p.chair} has ${rows[0].who} until ${timeText(rows[0].ends_at)}.`;
  }
  if (p.dentistId !== null) {
    const { rows } = await tx.query<{ who: string; dentist: string; ends_at: Date }>(
      `select concat_ws(' ', p.first_name, nullif(p.last_name, '—')) as who, s.full_name as dentist, a.ends_at
         from appointment a join patient p on p.id = a.patient_id join staff s on s.id = a.dentist_id
        where a.clinic_id = $1 and a.dentist_id = $2 and a.starts_at < $4 and a.ends_at > $3 and ${HOLDS_SLOT}
          and ($5::uuid is null or a.id <> $5)
        order by a.starts_at limit 1`, [clinicId, p.dentistId, p.startsAt, p.endsAt, own]);
    if (rows[0]) return `${shortName(rows[0].dentist)} is with ${rows[0].who} until ${timeText(rows[0].ends_at)}.`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// The state machine, as the Today page runs it: any allowed status may be set,
// arrived_at is stamped once on arrival (arrived or straight to the lobby),
// seated_at once when the chair is taken, cancelled_at on every cancellation.
// A cancellation also drops the texts still queued for that visit, so no
// reminder goes out for a visit that is not happening (patient_act in 010
// does the same from the patient's side).
// ---------------------------------------------------------------------------
export async function applyStatus(tx: Tx, clinicId: string, staffId: string, id: string, to: string): Promise<void> {
  if (!ALLOWED.has(to)) throw new Error(`Not a status the book knows: ${to}`);
  await tx.query(
    `update appointment set status = $2,
       arrived_at = case when $2 in ('arrived', 'in_lobby') then coalesce(arrived_at, now()) else arrived_at end,
       seated_at = case when $2 = 'in_chair' then coalesce(seated_at, now()) else seated_at end,
       cancelled_at = case when $2 = 'cancelled' then now() else cancelled_at end
     where id = $1`, [id, to]);
  if (to === 'cancelled') {
    await tx.query(`update message_log set status = 'cancelled' where appointment_id = $1 and status = 'queued' and direction = 'out'`, [id]);
  }
  await tx.query(`insert into audit_log (clinic_id, staff_id, action, entity, entity_id) values ($1, $2, $3, 'appointment', $4)`,
    [clinicId, staffId, `appointment.${to}`, id]);
}

// ---------------------------------------------------------------------------
// Words. Times are Manila time whatever the server's clock says, and read the
// way the desk says them: "9:45 am", "Thu 24 Sep, 10:30 am".
// ---------------------------------------------------------------------------
const TZ = 'Asia/Manila';

function parts(d: Date) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hourCycle: 'h12' }).formatToParts(d);
  const get = (t: string) => f.find((p) => p.type === t)?.value ?? '';
  return { wd: get('weekday'), day: get('day'), mon: get('month'), h: get('hour'), m: get('minute'), ap: get('dayPeriod').toLowerCase() };
}

/** "9:45 am" */
export function timeText(d: Date): string {
  const p = parts(d);
  return `${p.h}:${p.m} ${p.ap}`;
}

/** "Thu 24 Sep, 10:30 am" */
export function whenText(d: Date): string {
  const p = parts(d);
  return `${p.wd} ${p.day} ${p.mon}, ${p.h}:${p.m} ${p.ap}`;
}

/** "Dr. Ramon Cariño" → "Dr. Cariño"; a name without the title is used whole. A suffix (Jr., III) stays with the surname. */
export function shortName(full: string): string {
  const words = full.trim().split(/\s+/);
  if (words.length < 3 || !/^dra?\.?$/i.test(words[0])) return full.trim();
  const tail = /^(jr\.?|sr\.?|ii|iii|iv)$/i.test(words[words.length - 1]) ? words.slice(-2) : words.slice(-1);
  return `${words[0].replace(/\.?$/, '.')} ${tail.join(' ')}`;
}

/** True when a text can reach this number. */
export const canText = (phone: string | null | undefined) => !!phone && PH_MOBILE.test(normalizePhone(phone));

/** The texts the schedule sends. Clinic name first, then the fact, then what to do; no link in any of them. */
export const scheduleTexts = {
  /** A desk booking's confirmation — the same words a web booking gets, so a patient sees one voice. */
  confirmation: (clinic: string, reason: string | null, at: Date, ref: string | null, clinicPhone: string | null) =>
    `${clinic}: ${reason ?? 'your visit'} booked for ${whenText(at)}.${ref ? ` Ref ${ref}.` : ''} We'll text the day before; reply Y to confirm or call ${clinicPhone ?? 'the clinic'} to change.`,
  /** The desk moved a future visit to a new time. */
  moved: (clinic: string, at: Date, ref: string | null, clinicPhone: string | null) =>
    `${clinic}: your visit moved to ${whenText(at)}.${ref ? ` Ref ${ref}.` : ''} Reply Y to confirm or call ${clinicPhone ?? 'the clinic'}.`,
};
