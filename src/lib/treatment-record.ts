// The Treatment record: the ledger on page 4 of the Philippine Dental Association's dental chart
// (https://pda.com.ph/docs/pda-dental-chart/) — Date · Tooth no./s · Procedure · Dentist/s · Amount charged ·
// Amount paid · Balance · Next appt. — one row per treatment, oldest first, drawn from what the record
// already holds. The record's section (patients/_record/TreatmentRecord.astro) and its print
// (patients/[patient]/treatment-record.astro) both build it here, so the screen and the paper never differ.
//
// Clinical rows come from loadVisits()'s placement (src/lib/visit-record.ts), so the ledger and the visit
// panel always agree on which visit a treatment belongs to. Money rows come from this module's own complete
// money query, never from Visit.money (which drops what it cannot place): only statements are charges — the
// price a dentist types on a treatment is a fee-guide estimate — and every line of a counted statement
// appears exactly once, on its treatment's row when the statement was issued that day, else as a charge row
// of its own on the statement's day.
//
// The running balance is patient_balance()'s rule (022), statement by statement, through sumsOf() in
// src/lib/invoices.ts — never a second definition. The last day's balance must equal patient_balance(); when
// it does not, no balance is shown and the section says so (and the server logs the patient id, no name).
// Money is only read, and only shown, for people who may bill (the page passes `money`).
import type { Tx } from './db';
import type { Clinical, Done } from './record';
import type { Extra } from './record-extra';
import type { Visit } from './visit-record';
import { STATE_WORDS, signerWords, type RecordDoc, type RecordSigning } from './consent-docs';
import { dateText } from './health';
import { sumsOf, fromDb, pesos, statementNo, methodLabel, DISCOUNTS, PAYOR_METHODS, type Cents } from './invoices';

const TZ = 'Asia/Manila';
const dayKey = (d: Date | string) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(d));
const timeWords = (d: Date | string) => new Intl.DateTimeFormat('en-PH', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }).format(new Date(d)).toLowerCase();
/** The first instant after a Manila day: "end of the day" for Next appt. */
const endOfDay = (day: string) => new Date(Date.parse(`${day}T00:00:00+08:00`) + 864e5);
const LIMIT = 2000;

export type RowKind = 'done' | 'adjust' | 'visit' | 'consent' | 'charge' | 'discount' | 'other' | 'payor' | 'payment';
export interface LedgerRow {
  kind: RowKind;
  /** Tooth pills: "36 MO", "11". */
  teeth: string[];
  /** The procedure column's words, and a smaller line under them. */
  words: string;
  detail: string | null;
  /** A visit row with nothing done shows its status as a chip (Did not come, In the chair …). */
  status: string | null;
  /** A missed or cancelled visit: its words in ink-2. */
  quiet: boolean;
  dentist: string | null;
  /** Centavos; a discount is negative. Null = the cell is empty. */
  charged: Cents | null;
  paid: Cents | null;
  /** Only on the last row of a day where money moved. */
  balance: Cents | null;
  /** Only on the last row of a day with a visit. */
  next: { text: string; visitKey: string | null } | null;
}
export interface LedgerDay {
  day: string;
  /** The visits this day's date opens: the first is the date itself, the rest "Also <time>". */
  open: { key: string; time: string }[];
  rows: LedgerRow[];
}
export type BalanceState = 'ok' | 'none' | 'too-many' | 'mismatch';
export interface Ledger {
  days: LedgerDay[];
  /** Treatments and braces adjustments: the head's "N treatments". */
  count: number;
  balance: BalanceState;
  /** patient_balance() now, in centavos. */
  onFile: Cents;
  /** Loaders keep the newest 300 treatments and 300 visits. */
  capped: boolean;
  /** Every visit key a date or a Next appt. opens: `?visit=` of another day lands on this section only for these. */
  openKeys: Set<string>;
}

interface StatementRow { id: string; appointment_id: string | null; issued_at: Date | string; series_prefix: string; number: string; total: string; discount: string; discount_kind: string | null; payor_name: string | null; payor_share: string; status: string }
interface LineRow { id: string; invoice_id: string; procedure_id: string | null; description: string; amount: string; line_no: number | null }
interface PaymentRow { id: string; invoice_id: string | null; amount: string; method: string; paid_on: string | null; received_at: Date | string }
export interface LedgerMoney { statements: StatementRow[]; lines: LineRow[]; payments: PaymentRow[]; complete: boolean; balance: string }

/** Every statement patient_balance() counts, their lines, every payment it counts, and patient_balance() itself — in
 *  ONE statement, so all of it is one snapshot: a payment committed while the record loads cannot make the ledger
 *  disagree with the balance it is checked against. Money is text, never a JSON number. Only for people who may bill. */
export async function loadLedgerMoney(tx: Tx, patientId: string): Promise<LedgerMoney> {
  const counted = `('issued', 'partly_paid', 'paid')`;
  const { rows: [r] } = await tx.query<{ statements: StatementRow[]; lines: LineRow[]; payments: PaymentRow[]; balance: string }>(
    `select
       (select coalesce(json_agg(x order by x.ord), '[]'::json) from (
          select row_number() over (order by i.issued_at, i.number) as ord, i.id, i.appointment_id, i.issued_at, i.series_prefix,
                 i.number::text as number, i.total::text as total, i.discount::text as discount, i.discount_kind, i.payor_name,
                 i.payor_share::text as payor_share, i.status
            from invoice i where i.patient_id = $1 and i.status in ${counted} order by i.issued_at, i.number limit ${LIMIT + 1}) x) as statements,
       (select coalesce(json_agg(x order by x.ord), '[]'::json) from (
          select row_number() over (order by l.line_no nulls last, l.id) as ord, l.id, l.invoice_id, l.procedure_id, l.description,
                 l.amount::text as amount, l.line_no
            from invoice_line l join invoice i on i.id = l.invoice_id
           where i.patient_id = $1 and i.status in ${counted} order by l.line_no nulls last, l.id limit ${LIMIT + 1}) x) as lines,
       (select coalesce(json_agg(x order by x.ord), '[]'::json) from (
          select row_number() over (order by y.received_at) as ord, y.id, y.invoice_id, y.amount::text as amount, y.method,
                 to_char(y.paid_on, 'YYYY-MM-DD') as paid_on, y.received_at
            from payment y left join invoice i on i.id = y.invoice_id
           where y.patient_id = $1 and y.voided_at is null and (y.invoice_id is null or i.status in ${counted})
           order by y.received_at limit ${LIMIT + 1}) x) as payments,
       coalesce(patient_balance($1), 0)::text as balance`, [patientId]);
  const complete = r.statements.length <= LIMIT && r.lines.length <= LIMIT && r.payments.length <= LIMIT;
  return { statements: r.statements.slice(0, LIMIT), lines: r.lines.slice(0, LIMIT), payments: r.payments.slice(0, LIMIT), complete, balance: r.balance };
}

/** Recalls with the day each was set (033: recall.created_at), for Next appt. */
export async function loadRecallsSet(tx: Tx, patientId: string): Promise<{ due: string; setOn: string }[]> {
  const { rows } = await tx.query(
    `select to_char(due_on, 'YYYY-MM-DD') as due, to_char(created_at at time zone 'Asia/Manila', 'YYYY-MM-DD') as set_on from recall where patient_id = $1`, [patientId]);
  return rows.map((r) => ({ due: r.due, setOn: r.set_on }));
}

/** A visit under way or done: on the ledger even before its booked time. */
const BEGUN = new Set(['arrived', 'in_lobby', 'in_chair', 'completed']);

/** Where a consent form was signed, for the ledger and the visit panel. */
export const SIGNED_WHERE: Record<RecordSigning['channel'], string> = { phone: 'on their phone', tablet: 'on the clinic’s tablet', desk: 'on a device handed to them', paper: 'on paper' };
/** The moment a signing counts from: the paper's own day at noon Manila, else when it was signed. */
export const signedAtOf = (s: RecordSigning): Date => (s.channel === 'paper' && s.signedOn ? new Date(`${s.signedOn}T12:00:00+08:00`) : new Date(s.signedAt));
/** The teeth a form names (its clinic part's teeth, or an area). */
export const docTeeth = (d: RecordDoc): number[] => (Array.isArray(d.fields.teeth) ? (d.fields.teeth as number[]) : Array.isArray(d.fields.area) ? (d.fields.area as number[]) : []);
/** "Signed by Ana Dimaculangan · on their phone · 2:31 pm", or "Did not agree · Ana Dimaculangan · …", in the ledger's words. */
export function formWords(d: RecordDoc, s: RecordSigning): string {
  const who = signerWords({ name: s.signedByName, as: s.signedAs, relation: s.relation, method: s.method });
  const state = STATE_WORDS[d.state].words;
  const when = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' }).format(signedAtOf(s)).toLowerCase();
  const head = state === 'Signed' ? `Signed by ${who}` : `${state} · ${who}`;
  return [head, SIGNED_WHERE[s.channel], s.channel === 'paper' ? null : when, s.withdrawal ? `withdrawn ${dateText(dayKey(s.withdrawal.at))}` : null].filter(Boolean).join(' · ');
}
const tooth = (fdi: number | null, surface: string | null) => (fdi ? [`${fdi}${surface ? ` ${surface}` : ''}`] : []);
const blank = (kind: RowKind, words: string): LedgerRow => ({ kind, teeth: [], words, detail: null, status: null, quiet: false, dentist: null, charged: null, paid: null, balance: null, next: null });
const clip = (s: string | null | undefined, n: number) => (s ? (s.length > n ? `${s.slice(0, n).trimEnd()}…` : s) : null);

/** What a visit holds besides treatment, in words, for a visit row's detail. */
function holds(v: Visit): string[] {
  const out: string[] = [];
  const roots = v.notes.filter((n) => !n.amends).length;
  if (roots) out.push(roots === 1 ? 'Clinical note' : `${roots} clinical notes`);
  if (v.rx.length) out.push(v.rx.length === 1 ? 'prescription' : `${v.rx.length} prescriptions`);
  if (v.letters.length) out.push(v.letters.length === 1 ? 'letter' : `${v.letters.length} letters`);
  if (v.vitals.length) out.push('blood pressure');
  if (v.files.length) out.push(v.files.length === 1 ? 'one file' : `${v.files.length} files`);
  const signedForms = v.forms.filter((d) => d.latest).length;
  if (signedForms) out.push(signedForms === 1 ? 'consent form' : `${signedForms} consent forms`);
  return out;
}
const holdsNothing = (v: Visit) => holds(v).length === 0 && v.procs.length === 0 && v.adjustments.length === 0 && v.consents.length === 0;
const sentence = (xs: string[]) => (xs.length ? xs.join(', ').replace(/^./, (c) => c.toUpperCase()) : null);

export interface BuildIn {
  visits: Visit[];
  clinical: Clinical;
  extra: Extra;
  recalls: { due: string; setOn: string }[];
  /** null when this person may not see money. */
  money: LedgerMoney | null;
  /** patient_balance() as the page read it; the check uses the money's own snapshot (LedgerMoney.balance) when there is money. */
  onFile: string | number | null;
  patientId: string;
}

export function buildLedger(i: BuildIn): Ledger {
  const { visits, clinical: c, extra: x, recalls } = i;
  const onFile = fromDb((i.money ? i.money.balance : i.onFile) ?? 0);
  // A visit is on the ledger once it has begun: its time has come, the patient is here or was seen (someone seated
  // early, before the booked time), or something was done under it.
  const begun = (v: Visit) => !v.future || v.procs.length > 0 || v.adjustments.length > 0 || BEGUN.has(v.status ?? '');
  const past = visits.filter(begun);
  const today = dayKey(new Date());
  // A visit whose day shows on the ledger opens its panel from the date: every visit that has begun, except a
  // cancelled visit that holds nothing (it is not treatment; Visits lists it).
  const openable = (v: Visit) => begun(v) && !(v.status === 'cancelled' && holdsNothing(v));

  type Keyed = { row: LedgerRow; at: number; order: number };
  const byDay = new Map<string, { clinical: Keyed[]; money: Keyed[] }>();
  const slot = (day: string) => { let d = byDay.get(day); if (!d) { d = { clinical: [], money: [] }; byDay.set(day, d); } return d; };

  // --- money: statements, their lines, payments -------------------------------------------------------------
  const m = i.money;
  const stmtDay = new Map<string, string>();
  const stmtNo = new Map<string, string>();
  const linesOf = new Map<string, LineRow[]>();
  const used = new Set<string>();
  if (m) {
    for (const s of m.statements) { stmtDay.set(s.id, dayKey(s.issued_at)); stmtNo.set(s.id, statementNo(s.series_prefix, s.number)); }
    for (const l of m.lines) { const a = linesOf.get(l.invoice_id) ?? []; a.push(l); linesOf.set(l.invoice_id, a); }
  }
  // A treatment's own charge: its live lines on a statement issued the same day as its row.
  const chargedFor = (d: Done, day: string): Cents | null => {
    if (!m) return null;
    let sum = 0n, any = false;
    for (const l of m.lines) {
      if (l.procedure_id !== d.id || used.has(l.id) || stmtDay.get(l.invoice_id) !== day) continue;
      sum += fromDb(l.amount); any = true; used.add(l.id);
    }
    return any ? sum : null;
  };

  // --- clinical rows ------------------------------------------------------------------------------------------
  const procById = new Map(c.done.map((d) => [d.id, d]));
  const dentistOnDay = (day: string) => past.find((v) => v.day === day && v.dentist)?.dentist ?? null;
  let count = 0;
  for (const v of past) {
    for (const d of v.procs) {
      const r = blank('done', d.name);
      r.teeth = tooth(d.fdi, d.surface);
      const doneDay = dayKey(d.at);
      r.detail = [clip(d.note, 140), doneDay !== v.day ? `done ${dateText(doneDay)}` : null].filter(Boolean).join(' · ') || null;
      r.dentist = d.dentist;
      r.charged = chargedFor(d, v.day);
      slot(v.day).clinical.push({ row: r, at: +new Date(d.at), order: 0 });
      count++;
    }
    // The consent forms signed for this visit (through an intake, on a clinic device or on paper): one row each, what
    // was agreed and by whom, before the work it covers. A form still to sign is the visit panel's business, not history.
    for (const d of v.forms) {
      const s = d.latest;
      if (!s) continue;
      const r = blank('consent', d.title);
      r.teeth = docTeeth(d).map(String);
      r.detail = formWords(d, s);
      r.dentist = d.attestation?.dentistName ?? d.dentistName ?? v.dentist;
      slot(v.day).clinical.push({ row: r, at: +signedAtOf(s), order: -1 });
    }
    if (v.procs.length || v.adjustments.length) continue;
    // A visit with nothing done is a row when it is treatment history: not a cancelled visit that holds nothing,
    // and an "At the clinic" day only when it holds something clinical (a day made by a statement alone is not a visit).
    if (v.status === 'cancelled' && holdsNothing(v)) continue;
    if (!v.id && holds(v).length === 0) continue;
    const r = blank('visit', 'No treatment recorded');
    const what = holds(v);
    r.dentist = v.dentist;
    if (!v.id) r.detail = ['At the clinic, no booking', ...what].join(' · ');
    else if (v.source === 'import') { r.words = v.reason || 'Visit'; r.detail = 'From old records'; r.teeth = v.asked.map(String); }
    else if (v.status === 'completed') r.detail = [v.reason, sentence(what)].filter(Boolean).join(' · ') || null;
    else if (v.status === 'no_show') { r.status = 'no_show'; r.quiet = true; r.words = ''; r.detail = v.reason; }
    else if (v.status === 'cancelled') { r.status = 'cancelled'; r.quiet = true; r.words = ''; r.detail = sentence(what); }
    else if (v.status === 'booked' || v.status === 'confirmed') { r.status = v.status; r.words = ''; r.detail = [v.day === today ? 'Not marked yet' : 'Not marked done or missed', v.reason].filter(Boolean).join(' · '); }
    else if (v.status) { r.status = v.status; r.words = ''; r.detail = v.reason; }
    // A statement that names this visit, issued that day, with exactly one line that is not a recorded treatment's
    // (a treatment's line belongs on the treatment's own row, wherever that is): its charge sits on the visit row.
    if (m && v.id) {
      const s = m.statements.find((s2) => s2.appointment_id === v.id && stmtDay.get(s2.id) === v.day && (linesOf.get(s2.id) ?? []).length === 1);
      const l = s ? linesOf.get(s.id)![0] : null;
      // The charged line names what was done (a consultation, an emergency visit): it is the procedure's words.
      if (l && !used.has(l.id) && !(l.procedure_id && procById.has(l.procedure_id))) {
        r.charged = fromDb(l.amount); used.add(l.id);
        if (v.status === 'completed' || !v.status) { r.words = l.description; r.detail = [v.reason !== l.description ? v.reason : null, sentence(what)].filter(Boolean).join(' · ') || null; }
        else r.detail = [r.detail, `Charged: ${l.description}`].filter(Boolean).join(' · ');
      }
    }
    slot(v.day).clinical.push({ row: r, at: +new Date(v.at), order: 1 });
  }
  // Braces adjustments: every one, on its day, with that day's dentist.
  for (const p of x.plans) for (const a of p.adjustments) {
    if (!a.on) continue;
    const r = blank('adjust', 'Braces adjustment');
    r.detail = clip(a.note, 140);
    r.dentist = dentistOnDay(a.on);
    slot(a.on).clinical.push({ row: r, at: Date.parse(`${a.on}T12:00:00+08:00`), order: 0 });
    count++;
  }

  // --- money rows ---------------------------------------------------------------------------------------------
  const payRowDay = new Map<string, string>();
  if (m) {
    let n = 0;
    for (const s of m.statements) {
      const day = stmtDay.get(s.id)!;
      const no = stmtNo.get(s.id)!;
      const at = +new Date(s.issued_at);
      const lines = (linesOf.get(s.id) ?? []).slice().sort((a, b) => (a.line_no ?? 1e9) - (b.line_no ?? 1e9));
      for (const l of lines) {
        if (used.has(l.id)) continue;
        used.add(l.id);
        const d = l.procedure_id ? procById.get(l.procedure_id) : undefined;
        const r = blank('charge', l.description);
        if (d) { r.teeth = tooth(d.fdi, d.surface); r.dentist = d.dentist; }
        const doneDay = d ? dayKey(d.at) : null;
        r.detail = [no, doneDay && doneDay !== day ? `done ${dateText(doneDay)}` : null].filter(Boolean).join(' · ');
        r.charged = fromDb(l.amount);
        slot(day).money.push({ row: r, at, order: n++ });
      }
      const discount = fromDb(s.discount);
      if (discount > 0n) {
        const r = blank('discount', (s.discount_kind && DISCOUNTS[s.discount_kind as keyof typeof DISCOUNTS]?.line) || 'Discount');
        r.detail = no; r.charged = -discount;
        slot(day).money.push({ row: r, at, order: n++ });
      }
      const linesTotal = lines.reduce((t, l) => t + fromDb(l.amount), 0n);
      const other = fromDb(s.total) - (linesTotal - discount);
      if (other !== 0n) {
        // A statement with no lines at all (an opening balance) is one charge; otherwise the difference is its own row.
        const r = lines.length ? blank('other', `Other change on ${no}`) : blank('charge', `Statement ${no}`);
        if (!lines.length) r.detail = 'No items listed on it';
        r.charged = other;
        slot(day).money.push({ row: r, at, order: n++ });
      }
      const share = fromDb(s.payor_share);
      if (share > 0n) {
        const r = blank('payor', `${s.payor_name ?? 'HMO'}’s part: ${pesos(share)}`);
        r.detail = `${no} · not owed by the patient`;
        slot(day).money.push({ row: r, at, order: n++ });
      }
    }
    for (const y of m.payments) {
      const s = y.invoice_id ? m.statements.find((s2) => s2.id === y.invoice_id) : undefined;
      const own = y.paid_on ?? dayKey(y.received_at);
      const sDay = s ? stmtDay.get(s.id)! : null;
      const day = sDay && sDay > own ? sDay : own;
      payRowDay.set(y.id, day);
      const payor = PAYOR_METHODS.has(y.method);
      const r = blank('payment', payor ? `Payment from ${s?.payor_name ?? methodLabel(y.method)}` : `Payment · ${methodLabel(y.method)}`);
      r.detail = [payor ? 'its part' : null, s ? stmtNo.get(s.id) : null, day !== own ? `paid ${dateText(own)}` : null].filter(Boolean).join(' · ') || null;
      r.paid = fromDb(y.amount);
      slot(day).money.push({ row: r, at: +new Date(y.received_at) + 1e12, order: n++ });
    }
  }

  // --- the running balance: patient_balance()'s rule, statement by statement (sumsOf) --------------------------
  const balanceAt = (day: string | null): Cents => {
    if (!m) return 0n;
    let total = 0n;
    for (const s of m.statements) {
      if (day !== null && stmtDay.get(s.id)! > day) continue;
      const pays = m.payments.filter((y) => y.invoice_id === s.id && (day === null || payRowDay.get(y.id)! <= day)).map((y) => ({ amount: y.amount, method: y.method, voided_at: null }));
      const r = sumsOf(s, pays);
      total += r.balance - r.payorDue;
    }
    for (const y of m.payments) if (!y.invoice_id && (day === null || payRowDay.get(y.id)! <= day)) total -= fromDb(y.amount);
    return total;
  };
  let balance: BalanceState = 'none';
  if (m) {
    if (!m.complete) balance = 'too-many';
    else if (balanceAt(null) !== onFile) { balance = 'mismatch'; console.warn('treatment-record balance mismatch', i.patientId); }
    else balance = 'ok';
  }

  // --- days, oldest first ----------------------------------------------------------------------------------------
  const openKeys = new Set<string>();
  const days: LedgerDay[] = [...byDay.keys()].sort().map((day) => {
    const g = byDay.get(day)!;
    const rows = [
      ...g.clinical.sort((a, b) => a.at - b.at || a.order - b.order).map((k) => k.row),
      ...g.money.sort((a, b) => a.at - b.at || a.order - b.order).map((k) => k.row),
    ];
    const here = past.filter((v) => v.day === day && openable(v)).sort((a, b) => +a.at - +b.at);
    const open = here.map((v) => ({ key: v.key, time: v.dateOnly ? '' : timeWords(v.at) }));
    open.forEach((o) => openKeys.add(o.key));
    const last = rows[rows.length - 1];
    // Balance on a day where money moved.
    const moved = rows.some((r) => r.charged !== null || r.paid !== null) || (!!m && m.statements.some((s) => stmtDay.get(s.id) === day));
    if (balance === 'ok' && moved) last.balance = balanceAt(day);
    // Next appt. on a day with a visit: the appointment set by the end of that day, else a check-up set that day,
    // else a braces adjustment's next date set that day.
    if (here.length) {
      const end = endOfDay(day);
      const nextVisit = visits
        .filter((v) => v.id && +v.at >= +end && v.bookedAt && +new Date(v.bookedAt) <= +end)
        .sort((a, b) => +a.at - +b.at)[0];
      if (nextVisit) {
        const tail = nextVisit.status === 'cancelled' ? ' · cancelled' : nextVisit.status === 'no_show' ? ' · did not come' : '';
        last.next = { text: `${dateText(nextVisit.day)}${tail}`, visitKey: nextVisit.key };
        if (openable(nextVisit)) openKeys.add(nextVisit.key);
      } else {
        const rc = recalls.filter((r) => r.setOn === day).sort((a, b) => (a.due < b.due ? -1 : 1))[0];
        const adj = x.plans.flatMap((p) => p.adjustments).find((a) => a.on === day && a.nextOn);
        if (rc) last.next = { text: `Check-up due ${dateText(rc.due)}`, visitKey: null };
        else if (adj) last.next = { text: `Adjustment due ${dateText(adj.nextOn)}`, visitKey: null };
      }
    }
    return { day, open, rows };
  });

  const capped = c.done.length >= 300 || visits.filter((v) => v.id).length >= 300;
  return { days, count, balance, onFile, capped, openKeys };
}

/** "₱1,200.00", "₱0.00", "₱200.00 credit". */
export const balanceWords = (c: Cents) => (c < 0n ? `${pesos(-c)} credit` : pesos(c));
/** "₱1,500.00", or "−₱200.00" for a discount. */
export const amountWords = (c: Cents) => (c < 0n ? `−${pesos(-c)}` : pesos(c));
