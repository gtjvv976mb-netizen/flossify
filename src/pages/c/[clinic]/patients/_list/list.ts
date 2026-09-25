// The Patients tab's one read (docs/workspace-redesign.md, "Patients tab"):
// every patient of this branch, searched, filtered, sorted and paged, with
// the counts on the filter pills and each record's check — in one SQL
// statement inside withClinic(), so row-level security keeps it to this
// branch and nothing is read per row from the page.
//
// How the statement goes: `pt` is the patients the search leaves (name either
// way round, chart no., or the mobile's digits — 0917… and +63 917… alike, as
// the top bar's search); the visits (`v`), the newest health history (`mh`),
// the consents to the notice in force (`cs`), the latest HMO claim (`cl`) and
// — for the people who may see money only — who has any statement or loose
// payment at all (`m`) are each one grouped pass joined to `pt`, never a
// subquery per patient. patient_balance() is the one balance definition; it
// is called only for patients with money on file (anyone else's is 0 by that
// same definition). The counts come from the searched set (so the pills say
// what each filter would show for this search); the page of rows from the
// filtered, sorted set, LIMIT/OFFSET.
//
// The record check, per patient — what the desk still has to ask for:
//   birth date      patient.birth_date is empty
//   health history  the newest medical_history version answers nothing (null
//                   lists and no note: nobody has asked yet; "None known" is an
//                   answer)
//   consent         no consent to the privacy notice in force
//                   (current_consent_version()), or — under 18 by the birth
//                   date — none from a parent or guardian (health.ts, the
//                   record page's own rule; the line then asks for "a
//                   guardian's consent"). Not asked while no notice is in force.
//   mobile          no mobile on file
//
// New: the first completed visit is within the last 30 days, or there is none
// yet and the record was added within them — isNewSql(), the Dashboard's own
// rule, so a patient is new on both or on neither. Today: a visit today
// (Manila) that is not cancelled. With balance: patient_balance() above zero
// (finance roles only).
import type { Tx } from '../../../../../lib/db';
import { withClinic } from '../../../../../lib/db';
import { hmoById } from '../../../../../data/directory';
import { isNewSql } from '../../../../../components/ws/cal/data';

export const FILTERS = ['all', 'today', 'new', 'balance', 'attention'] as const;
export type Filter = (typeof FILTERS)[number];
export const SORTS = ['name', 'last', 'next'] as const;
export type Sort = (typeof SORTS)[number];
/** Rows drawn at a time; "Show more" asks for the next ones. */
export const PAGE = 50;
/** The most rows one page draws (a link with ?show= from a browser without JavaScript). */
export const SHOW_MAX = 1000;
export const Q_MAX = 80;

export interface ListState {
  q: string;
  f: Filter;
  sort: Sort;
  /** Rows from the start (the page), or — for the next rows only — how many to send. */
  show: number;
  /** The first row to send (0 for the page; "Show more" sends the rows after those on screen). */
  from: number;
}

export interface Counts { all: number; today: number; new: number; balance: number; attention: number }

export interface Row {
  id: string;
  name: string;
  chartNo: string;
  phone: string | null;
  birth: string | null;
  sex: string | null;
  hmo: string | null;
  lastAt: Date | null;
  nextAt: Date | null;
  today: boolean;
  isNew: boolean;
  /** Pesos as Postgres wrote them ("1500.00"); null for people who may not see money. */
  balance: string | null;
  allergies: string[];
  conditions: string[];
  /** What the record still needs, in the order the desk asks for it. */
  needs: { birth: boolean; history: boolean; consent: boolean; guardian: boolean; mobile: boolean };
}

export interface ListResult {
  rows: Row[];
  counts: Counts;
  /** Rows the chosen filter has (for this search): the page shows the first `from + rows.length`. */
  matched: number;
  /** A privacy notice is in force (so consent is part of the check). */
  notice: boolean;
  area: string | null;
  /** May add and import patients here (staff_access.can_edit_records, canEditRecords()). */
  canEdit: boolean;
}

/** The state in the address, read once and checked. Anything odd falls back to the default. */
export function readState(params: URLSearchParams, finance: boolean): ListState {
  const q = (params.get('q') ?? '').replace(/\s+/g, ' ').trim().slice(0, Q_MAX);
  const fAsked = params.get('f') ?? '';
  const f: Filter = (FILTERS as readonly string[]).includes(fAsked) && (fAsked !== 'balance' || finance) ? (fAsked as Filter) : 'all';
  const sAsked = params.get('sort') ?? '';
  const sort: Sort = (SORTS as readonly string[]).includes(sAsked) ? (sAsked as Sort) : 'name';
  const n = (k: string, dflt: number, min: number, max: number) => {
    const v = Number.parseInt(params.get(k) ?? '', 10);
    return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : dflt;
  };
  return { q, f, sort, show: n('show', PAGE, 1, SHOW_MAX), from: n('from', 0, 0, 1_000_000) };
}

/** The address of a view of the list: only what differs from the default is written. */
export function listHref(base: string, s: Pick<ListState, 'q' | 'f' | 'sort'> & { show?: number }): string {
  const p = new URLSearchParams();
  if (s.q) p.set('q', s.q);
  if (s.f !== 'all') p.set('f', s.f);
  if (s.sort !== 'name') p.set('sort', s.sort);
  if (s.show && s.show !== PAGE) p.set('show', String(s.show));
  const t = p.toString();
  return t ? `${base}?${t}` : base;
}

/** Backslash, percent and underscore mean something to LIKE; the person typed them as letters. */
const esc = (s: string) => s.replace(/[\\%_]/g, (c) => '\\' + c);

// The last name as the list sorts it: a placeholder "—" (a patient booked with one name) sorts by the first name.
const NAME_ORDER = `lower(coalesce(nullif(nullif(btrim(r.last_name), ''), '—'), r.first_name)), lower(r.first_name), r.chart_no, r.id`;
const ORDER: Record<Sort, string> = {
  name: NAME_ORDER,
  last: `r.last_at desc nulls last, ${NAME_ORDER}`,
  next: `r.next_at asc nulls last, ${NAME_ORDER}`,
};
const WHERE: Record<Filter, string> = {
  all: 'true', today: 'r.today', new: 'r.is_new', balance: 'r.balance > 0', attention: 'r.attention',
};

/**
 * One page of the list and the counts. todayFrom/todayTo: Manila today's [start, end); today: its YYYY-MM-DD.
 */
export async function loadList(clinicId: string, o: {
  state: ListState; finance: boolean; staffId: string; todayFrom: Date; todayTo: Date; today: string;
}): Promise<ListResult> {
  return withClinic(clinicId, (tx) => readList(tx, clinicId, o));
}

async function readList(tx: Tx, clinicId: string, o: {
  state: ListState; finance: boolean; staffId: string; todayFrom: Date; todayTo: Date; today: string;
}): Promise<ListResult> {
  const { state: s, finance } = o;
  const words = s.q.split(/[\s,]+/).filter(Boolean).map((w) => `%${esc(w)}%`);
  const digits = s.q.replace(/\D/g, '');
  // A mobile when the text is mostly digits (spaces, a plus, dashes and brackets aside), as the top bar's search.
  const byPhone = digits.length >= 3 && digits.length >= s.q.replace(/[\s+()-]/g, '').length - 1;
  const local = digits.startsWith('0') ? `63${digits.slice(1)}` : digits;
  const filter = s.f === 'balance' && !finance ? 'all' : s.f;
  const params: unknown[] = [
    o.todayFrom, o.todayTo, s.q, words.length ? words : ['%'], `%${esc(s.q)}%`, byPhone, `%${digits}%`, `%${local}%`,
    o.today, o.staffId, clinicId, Math.min(s.show, SHOW_MAX), s.from,
  ];

  const { rows } = await tx.query(
    `with pt as (
       select p.id, p.first_name, p.last_name, p.suffix, p.chart_no, p.phone, p.birth_date, p.sex, p.hmo_name, p.created_at
         from patient p
        where p.archived_at is null
          and ($3 = ''
               or concat_ws(' ', p.first_name, p.middle_name, p.last_name, p.suffix) ilike all ($4::text[])
               or p.chart_no ilike $5
               or ($6 and (regexp_replace(coalesce(p.phone, ''), '\\D', '', 'g') like $7
                           or regexp_replace(coalesce(p.phone, ''), '\\D', '', 'g') like $8)))
     ), v as (
       select a.patient_id,
              max(a.starts_at) filter (where a.status = 'completed') as last_at,
              min(a.starts_at) filter (where a.status = 'completed') as first_done,
              min(a.starts_at) filter (where a.ends_at > now() and a.status not in ('cancelled', 'no_show', 'completed')) as next_at,
              bool_or(a.starts_at >= $1 and a.starts_at < $2 and a.status <> 'cancelled') as today,
              (array_agg(a.hmo_id order by a.starts_at desc) filter (where a.hmo_id is not null))[1] as hmo_id
         from appointment a join pt on pt.id = a.patient_id
        group by a.patient_id
     ), mh as (
       select distinct on (h.patient_id) h.patient_id, h.allergies, h.conditions,
              (h.allergies is not null or h.conditions is not null or h.medications is not null
               or nullif(btrim(coalesce(h.note, '')), '') is not null) as answered
         from medical_history h join pt on pt.id = h.patient_id
        order by h.patient_id, h.answered_at desc, h.id desc
     ), n as (
       select v.id from current_consent_version() v where v.id is not null
     ), cs as (
       select c.patient_id, bool_or(c.agreed_as = 'guardian') as guardian
         from patient_consent c join n on n.id = c.version_id join pt on pt.id = c.patient_id
        group by c.patient_id
     ), cl as (
       select distinct on (c.patient_id) c.patient_id, pr.name as hmo
         from hmo_claim c join hmo_provider pr on pr.id = c.provider_id join pt on pt.id = c.patient_id
        order by c.patient_id, c.filed_at desc nulls last
     )${finance ? `, m as (
       select i.patient_id from invoice i where i.status in ('issued', 'partly_paid', 'paid')
       union
       select y.patient_id from payment y where y.invoice_id is null and y.voided_at is null
     )` : ''}, r0 as (
       select pt.*, v.last_at, v.next_at, coalesce(v.today, false) as today, v.hmo_id, cl.hmo as claim_hmo,
              coalesce(mh.allergies, '{}') as allergies, coalesce(mh.conditions, '{}') as conditions,
              ${isNewSql('v.first_done', 'pt.created_at')} as is_new,
              ${finance ? 'case when m.patient_id is null then 0::numeric else patient_balance(pt.id) end' : 'null::numeric'} as balance,
              pt.birth_date is null as no_birth,
              not coalesce(mh.answered, false) as no_history,
              nullif(btrim(coalesce(pt.phone, '')), '') is null as no_mobile,
              (pt.birth_date is not null and pt.birth_date > ($9::date - interval '18 years')) as minor,
              exists (select 1 from n) as notice, cs.patient_id is not null as consented, coalesce(cs.guardian, false) as guardian
         from pt
         left join v on v.patient_id = pt.id
         left join mh on mh.patient_id = pt.id
         left join cs on cs.patient_id = pt.id
         left join cl on cl.patient_id = pt.id
         ${finance ? 'left join m on m.patient_id = pt.id' : ''}
     ), r as (
       select r0.*,
              (r0.notice and (not r0.consented or (r0.minor and not r0.guardian))) as no_consent,
              (r0.notice and r0.minor and not r0.guardian) as needs_guardian,
              (r0.no_birth or r0.no_history or r0.no_mobile or (r0.notice and (not r0.consented or (r0.minor and not r0.guardian)))) as attention
         from r0
     )
     select k.*, x.*
       from (select count(*)::int as n_all,
                    count(*) filter (where r.today)::int as n_today,
                    count(*) filter (where r.is_new)::int as n_new,
                    count(*) filter (where r.balance > 0)::int as n_balance,
                    count(*) filter (where r.attention)::int as n_attention,
                    count(*) filter (where ${WHERE[filter]})::int as n_matched,
                    exists (select 1 from n) as has_notice,
                    (select c.area from clinic c where c.id = $11) as clinic_area,
                    coalesce((select sa.can_edit_records from staff_access sa where sa.staff_id = $10 and sa.clinic_id = $11), false) as can_edit
               from r) k
       left join lateral (
         select r.id, r.first_name, r.last_name, r.suffix, r.chart_no, r.phone, to_char(r.birth_date, 'YYYY-MM-DD') as birth, r.sex,
                r.hmo_name, r.claim_hmo, r.hmo_id, r.last_at, r.next_at, r.today, r.is_new, r.balance, r.allergies, r.conditions,
                r.no_birth, r.no_history, r.no_consent, r.needs_guardian, r.no_mobile,
                row_number() over (order by ${ORDER[s.sort]}) as ord
           from r
          where ${WHERE[filter]}
          order by ${ORDER[s.sort]}
          limit $12 offset $13) x on true
      order by x.ord`,
    params,
  );

  const k = rows[0] ?? {};
  const clean = (v: unknown) => (Array.isArray(v) ? (v as unknown[]).filter((x): x is string => typeof x === 'string' && x.trim() !== '') : []);
  const hmoName = (id: string | null) => (id ? (hmoById(id)?.name ?? id) : null);
  return {
    counts: { all: k.n_all ?? 0, today: k.n_today ?? 0, new: k.n_new ?? 0, balance: finance ? k.n_balance ?? 0 : 0, attention: k.n_attention ?? 0 },
    matched: k.n_matched ?? 0,
    notice: k.has_notice === true,
    area: k.clinic_area ?? null,
    canEdit: k.can_edit === true,
    rows: rows.filter((r) => r.id).map((r) => ({
      id: r.id,
      // "First Last", as everywhere in the workspace; a placeholder "—" last name is left out.
      name: [r.first_name, r.last_name === '—' ? null : r.last_name, r.suffix].filter(Boolean).join(' '),
      chartNo: r.chart_no,
      phone: r.phone?.trim() || null,
      birth: r.birth ?? null,
      sex: r.sex ?? null,
      hmo: r.hmo_name?.trim() || r.claim_hmo || hmoName(r.hmo_id ?? null),
      lastAt: r.last_at ?? null,
      nextAt: r.next_at ?? null,
      today: r.today === true,
      isNew: r.is_new === true,
      balance: finance && r.balance !== null ? String(r.balance) : null,
      allergies: clean(r.allergies),
      conditions: clean(r.conditions),
      needs: { birth: r.no_birth, history: r.no_history, consent: r.no_consent, guardian: r.needs_guardian, mobile: r.no_mobile },
    })),
  };
}

/** What the record still needs, as one short line ("Needs birth date and consent"), or null when complete. */
export function needsLine(n: Row['needs']): string | null {
  const items = [
    n.birth && 'birth date',
    n.history && 'health history',
    n.consent && (n.guardian ? 'a guardian’s consent' : 'consent'),
    n.mobile && 'mobile',
  ].filter(Boolean) as string[];
  if (!items.length) return null;
  const list = items.length === 1 ? items[0] : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
  return `Needs ${list}`;
}
