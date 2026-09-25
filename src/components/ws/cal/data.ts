// The Dashboard's reads, server only. One transaction under withClinic() —
// row-level security keeps every row to this branch — and one query per
// panel, never one per row:
//
//   meta      the chairs, the hours, who treats here on which days, and the
//             fee guide with its prices (the calendar and the booking form)
//   cards     every visit the calendar, the summary strip and the "Requests
//             to place" lane need, in one select with a flag for each
//   money     what was collected today (finance roles only; never read for
//             anyone else)
//   patients  every patient, with next and last visit, alerts, HMO and —
//             for finance roles only — the balance (patient_balance(), the
//             one balance definition)
//
// A card is the schedule's Appt plus extras (model.ts). The Appt half uses the
// same expressions as APPT_SELECT in src/lib/schedule.ts, so a visit reads the
// same here as on every /api/schedule answer; /api/schedule adds the extras to
// its own answers with extrasFor() below.
//
// The price is the fee guide's (procedure_catalog): the service the visit was
// booked for, or — for visits written before a service was recorded (seeded,
// imported, older desk bookings) — the active service the reason names
// exactly, or names whole followed by tooth numbers only ("Restoration 26",
// "Root canal 36", "Extraction 36, 37"; the longest name wins). Nothing is guessed beyond that: "Braces
// consultation" is not Braces, and a visit with neither shows no price.
import type { Tx } from '../../../lib/db';
import { withClinic } from '../../../lib/db';
import { rowToAppt, type Appt } from '../../../lib/schedule';
import { hmoById } from '../../../data/directory';
import type { Card, Extras, Price, Pt, Service, StaffDay } from './model';

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const priceOf = (min: unknown, max: unknown, from: unknown, unit: unknown): Price =>
  min === null || min === undefined ? null : { min: Number(min), max: num(max), from: from === true, unit: (unit as string) || null };
const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
const joined = (v: unknown) => (Array.isArray(v) ? (v as string[]).filter(Boolean).join(', ') || null : ((v as string) || null));
const hmoName = (id: string | null) => (id ? (hmoById(id)?.name ?? id) : null);

// The patient's own HMO and member number, as Add patient and the import keep them (026).
const PATIENT_HMO = `case when nullif(btrim(p.hmo_name), '') is null then null
       else concat_ws(' · ', btrim(p.hmo_name), nullif(btrim(p.hmo_member_no), '')) end`;

/** "New" — one rule for the Dashboard and the Patients tab (src/pages/c/[clinic]/patients/_list/list.ts): the first
 *  completed visit is within the last 30 days, or there is none yet and the record was added within them. A record
 *  imported or added long ago with no completed visit on file is not new: it would stay "New" for ever.
 *  firstDone, createdAt: the SQL for the first completed visit's start and patient.created_at. */
export const isNewSql = (firstDone: string, createdAt: string) =>
  `(case when ${firstDone} is null then ${createdAt} > now() - interval '30 days' else ${firstDone} > now() - interval '30 days' end)`;

// What may follow a service's whole name (or code) in a reason and still be that service: a space, then
// tooth numbers only — "36", "#36", "36, 37", "14-16", "14/15 & 16". "Filling 36 MO" and "Braces
// consultation" are not matched.
const TEETH = '^[[:space:]]+#?[0-9][0-9[:space:],&/#-]*$';

// The Appt half: APPT_SELECT's expressions (src/lib/schedule.ts).
const BASE = `a.id, a.patient_id, concat_ws(' ', p.first_name, nullif(p.last_name, '—')) as patient_name, p.chart_no,
       coalesce(nullif(a.booked_by_phone, ''), p.phone) as phone,
       a.dentist_id, s.full_name as dentist_name, a.chair, a.starts_at, a.ends_at, a.reason, a.status, a.source, a.public_ref, a.notes,
       mh.allergies`;
const EXTRA = `coalesce(pc.id, pr.id) as catalog_id, coalesce(pc.name, pr.name) as service,
       coalesce(pc.default_price, pr.default_price) as price_min, coalesce(pc.price_max, pr.price_max) as price_max,
       coalesce(pc.price_from, pr.price_from) as price_from, coalesce(pc.unit, pr.unit) as price_unit,
       a.created_at, cb.full_name as created_by_name, a.booked_by_name, a.moved_at, a.hmo_id,
       mh.conditions, to_char(p.birth_date, 'YYYY-MM-DD') as birth, a.date_only, a.dentist_name as dentist_free,
       ${PATIENT_HMO} as patient_hmo, nullif(nullif(btrim(p.last_name), '—'), '') as last_name`;
const FROM = `
  from appointment a
  join patient p on p.id = a.patient_id
  left join staff s on s.id = a.dentist_id
  left join staff cb on cb.id = a.created_by
  left join procedure_catalog pc on pc.id = a.catalog_id
  left join lateral (
    select x.id, x.name, x.default_price, x.price_max, x.price_from, x.unit from procedure_catalog x
     cross join lateral (values (btrim(a.reason))) r(t)
     where a.catalog_id is null and a.reason is not null and x.active
       and (lower(r.t) = lower(x.name) or lower(r.t) = lower(x.code)
            or (lower(left(r.t, char_length(x.name))) = lower(x.name) and substr(r.t, char_length(x.name) + 1) ~ '${TEETH}')
            or (lower(left(r.t, char_length(x.code))) = lower(x.code) and substr(r.t, char_length(x.code) + 1) ~ '${TEETH}'))
     order by lower(r.t) = lower(x.name) desc, lower(r.t) = lower(x.code) desc, char_length(x.name) desc, x.name
     limit 1) pr on true
  left join lateral (
    select h.allergies, h.conditions from medical_history h where h.patient_id = p.id order by h.answered_at desc limit 1) mh on true`;

type Row = Record<string, any>;

function extrasOf(r: Row): Extras {
  const patient = String(r.patient_name ?? '').trim().toLowerCase();
  const booker = (r.booked_by_name as string | null)?.trim() || null;
  return {
    catalogId: r.catalog_id ?? null,
    service: r.service ?? null,
    price: priceOf(r.price_min, r.price_max, r.price_from, r.price_unit),
    createdAt: iso(r.created_at),
    bookedBy: r.created_by_name ?? null,
    bookedFor: booker && booker.toLowerCase() !== patient ? booker : null,
    movedAt: iso(r.moved_at),
    hmo: hmoName(r.hmo_id ?? null),
    patientHmo: r.patient_hmo ?? null,
    conditions: joined(r.conditions),
    birth: r.birth ?? null,
    dateOnly: r.date_only === true,
    dentistFree: (r.dentist_free as string | null)?.trim() || null,
    lastName: (r.last_name as string | null) ?? null,
  };
}
/** A visit and its extras as one card. A visit brought in from old records may name a dentist who is not on
 *  the team (026: dentist_name, never with a dentist_id); the card shows that name where a dentist goes. */
export const mergeExtras = (a: Appt, ex: Extras): Card => ({ ...a, ...ex, dentistName: a.dentistName ?? ex.dentistFree });
const cardOf = (r: Row): Card => mergeExtras(rowToAppt(r as Parameters<typeof rowToAppt>[0]), extrasOf(r));

/** The extras for these visits, by id: one query. /api/schedule adds them to its answers. */
export async function extrasFor(tx: Tx, ids: string[]): Promise<Map<string, Extras>> {
  if (ids.length === 0) return new Map();
  const { rows } = await tx.query(`select a.id, concat_ws(' ', p.first_name, nullif(p.last_name, '—')) as patient_name, ${EXTRA} ${FROM} where a.id = any($1::uuid[])`, [ids]);
  return new Map(rows.map((r: Row) => [r.id as string, extrasOf(r)]));
}
/** One visit from the schedule's own read, with the Dashboard's extras on it. */
export async function withExtras(tx: Tx, a: Appt): Promise<Card> {
  const ex = (await extrasFor(tx, [a.id])).get(a.id);
  return mergeExtras(a, ex ?? extrasOf({ patient_name: a.patientName }));
}

export type PatientRow = Pt;

export interface Dashboard {
  clinic: { chairs: number; area: string | null; name: string };
  /** May this person add and import patients here (staff_access.can_edit_records, canEditRecords())? */
  canEdit: boolean;
  hours: Record<number, [number, number] | null>;
  staff: StaffDay[];
  catalog: Service[];
  range: Card[];
  today: Card[];
  toPlace: Card[];
  toConfirm: Card[];
  collected: { amount: number; count: number } | null;
  patients: PatientRow[];
}

/**
 * Everything the Dashboard draws on first paint.
 * range: [from, to) instants of the calendar (a day or a week); today: Manila today's [start, end).
 */
export async function loadDashboard(clinicId: string, o: { from: Date; to: Date; todayFrom: Date; todayTo: Date; finance: boolean; staffId: string }): Promise<Dashboard> {
  return withClinic(clinicId, async (tx) => {
    // meta — one row. can_edit is canEditRecords()'s read (src/lib/health.ts): Add patient and Import refuse
    // anyone without it, so the Dashboard does not offer them.
    const { rows: [m] } = await tx.query(
      `select c.chairs, c.area, c.name,
              coalesce((select sa.can_edit_records from staff_access sa where sa.staff_id = $2 and sa.clinic_id = c.id), false) as can_edit,
              coalesce((select json_agg(json_build_array(h.dow, h.open_min, h.close_min)) from clinic_hours h), '[]'::json) as hours,
              coalesce((select json_agg(json_build_object('id', x.id, 'name', x.name, 'days', x.days) order by x.owner desc, x.name)
                          from (select s.id, s.full_name as name, s.role = 'owner' as owner, array_agg(ss.dow order by ss.dow) as days
                                  from staff s join staff_schedule ss on ss.staff_id = s.id
                                 where ss.clinic_id = c.id and s.disabled_at is null and s.role in ('owner', 'dentist', 'associate')
                                 group by s.id, s.full_name, s.role) x), '[]'::json) as staff,
              coalesce((select json_agg(json_build_object('id', k.id, 'code', k.code, 'name', k.name, 'minutes', coalesce(k.minutes, 30),
                                                          'min', k.default_price, 'max', k.price_max, 'from', k.price_from, 'unit', k.unit)
                                        order by k.category nulls last, k.name)
                          from procedure_catalog k where k.active), '[]'::json) as catalog
         from clinic c where c.id = $1`, [clinicId, o.staffId]);

    // cards — the calendar's range, today (the summary strip), and the website's requests and bookings (the lane).
    const { rows } = await tx.query(
      `select ${BASE}, ${EXTRA},
              (a.starts_at < $2 and a.ends_at > $1) as in_range,
              (a.starts_at >= $3 and a.starts_at < $4) as is_today,
              (a.source = 'request' and a.moved_at is null and a.status not in ('no_show', 'completed') and a.starts_at >= now() - interval '1 day') as to_place,
              (a.source = 'web' and a.status = 'booked' and a.starts_at >= now() - interval '1 day') as to_confirm
         ${FROM}
        where a.status <> 'cancelled'
          and ((a.starts_at < $2 and a.ends_at > $1)
            or (a.starts_at >= $3 and a.starts_at < $4)
            or (a.starts_at >= now() - interval '1 day' and a.source in ('request', 'web')
                and ((a.source = 'request' and a.moved_at is null and a.status not in ('no_show', 'completed')) or (a.source = 'web' and a.status = 'booked'))))
        order by a.starts_at, a.chair nulls last, a.created_at`,
      [o.from, o.to, o.todayFrom, o.todayTo]);

    const collected = o.finance
      ? (await tx.query(
          `select coalesce(sum(amount), 0) as amount, count(*)::int as n
             from payment where voided_at is null and paid_on = (now() at time zone 'Asia/Manila')::date`)).rows[0]
      : null;

    // patients — every one, with what the list and the side panel show.
    const { rows: pts } = await tx.query(
      `with v as (
         select a.patient_id,
                max(a.starts_at) filter (where a.status = 'completed') as last_at,
                min(a.starts_at) filter (where a.status = 'completed') as first_done,
                min(a.starts_at) filter (where a.ends_at > now() and a.status not in ('cancelled', 'no_show', 'completed')) as next_at,
                (array_agg(a.id order by a.starts_at) filter (where a.ends_at > now() and a.status not in ('cancelled', 'no_show', 'completed')))[1] as next_id,
                coalesce(bool_or(a.starts_at >= $1 and a.starts_at < $2 and a.status <> 'cancelled'), false) as today,
                array_agg(distinct a.dentist_id) filter (where a.dentist_id is not null and a.status <> 'cancelled') as dentists,
                (array_agg(a.hmo_id order by a.starts_at desc) filter (where a.hmo_id is not null))[1] as hmo_id
           from appointment a group by a.patient_id)
       select p.id, concat_ws(' ', p.first_name, nullif(p.last_name, '—')) as name,
              concat_ws(', ', nullif(p.last_name, '—'), p.first_name) as sort,
              p.chart_no, p.phone, to_char(p.birth_date, 'YYYY-MM-DD') as birth,
              mh.allergies, mh.conditions, v.last_at, v.next_at, v.next_id, coalesce(v.today, false) as today, v.dentists, v.hmo_id,
              ${isNewSql('v.first_done', 'p.created_at')} as is_new,
              cl.hmo as claim_hmo, ${PATIENT_HMO} as patient_hmo,
              ${o.finance ? 'patient_balance(p.id)' : 'null::numeric'} as balance
         from patient p
         left join v on v.patient_id = p.id
         left join lateral (select h.allergies, h.conditions from medical_history h where h.patient_id = p.id order by h.answered_at desc limit 1) mh on true
         left join lateral (select pr.name || coalesce(' · ' || nullif(c.member_no, ''), '') as hmo
                              from hmo_claim c join hmo_provider pr on pr.id = c.provider_id
                             where c.patient_id = p.id order by c.filed_at desc nulls last limit 1) cl on true
        where p.archived_at is null
        order by v.next_at nulls last, v.last_at desc nulls last, p.last_name, p.first_name`,
      [o.todayFrom, o.todayTo]);

    const hours: Dashboard['hours'] = { 0: null, 1: null, 2: null, 3: null, 4: null, 5: null, 6: null };
    for (const [dow, open, close] of (m?.hours ?? []) as [number, number, number][]) hours[dow] = [open, close];
    const cards = rows.map((r: Row) => ({ r, c: cardOf(r) }));
    return {
      clinic: { chairs: Math.max(1, Number(m?.chairs) || 1), area: m?.area ?? null, name: m?.name ?? '' },
      canEdit: m?.can_edit === true,
      hours,
      staff: (m?.staff ?? []) as StaffDay[],
      catalog: ((m?.catalog ?? []) as Row[]).map((k) => ({ id: k.id, code: k.code, name: k.name, minutes: Number(k.minutes) || 30, price: priceOf(k.min, k.max, k.from, k.unit) })),
      range: cards.filter((x) => x.r.in_range).map((x) => x.c),
      today: cards.filter((x) => x.r.is_today).map((x) => x.c),
      toPlace: cards.filter((x) => x.r.to_place).map((x) => x.c),
      toConfirm: cards.filter((x) => x.r.to_confirm).map((x) => x.c),
      collected: collected ? { amount: Number(collected.amount), count: Number(collected.n) } : null,
      patients: pts.map((r: Row) => ({
        id: r.id, name: r.name, sort: r.sort, chart: r.chart_no, phone: r.phone ?? null, birth: r.birth ?? null,
        allergies: (r.allergies ?? []).filter(Boolean), conditions: (r.conditions ?? []).filter(Boolean),
        next: iso(r.next_at), nextId: r.next_id ?? null, last: iso(r.last_at),
        today: r.today === true, isNew: r.is_new === true, dentists: r.dentists ?? [],
        hmo: r.patient_hmo ?? r.claim_hmo ?? hmoName(r.hmo_id ?? null),
        balance: o.finance && r.balance !== null ? Number(r.balance) : null,
      })),
    };
  });
}
