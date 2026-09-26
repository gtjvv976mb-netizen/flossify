// The record's everyday paperwork (034), beside src/lib/record.ts: blood pressure and pulse before
// anaesthesia, dental certificates and letters (a referral, a request for medical clearance), an HMO's
// letter of authorization (LOA) for plan items, and payment plans — braces or any treatment paid monthly.
//
// Same rules as record.ts: every read and write inside withClinic (row-level security), every write asks
// canEditRecords first in the same transaction and writes an audit_log line, and a refused post is an
// Outcome the page shows again. A reading, a letter and an adjustment are written once (the database lets
// the app insert them only; a clearance's reply is the one thing written into a letter later). A payment
// plan's money is the statement it makes (createStatement, src/lib/invoices.ts), paid on the Finances page
// like any other, so no balance is ever counted twice; making or stopping one needs finance.bill.
import { randomUUID } from 'node:crypto';
import type { Tx } from './db';
import { canEditRecords, manilaToday, oneLine } from './health';
import { createStatement, payorOptions, type PayorOption } from './invoices';
import type { Outcome, TimelineEvent } from './record';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const line = (v: FormDataEntryValue | null, max: number) => oneLine(v).slice(0, max + 1);
const text = (v: FormDataEntryValue | null, max: number) => String(v ?? '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f​-‏‪-‮⁦-⁩﻿]/g, '').trim().slice(0, max + 1);
const dayOf = (v: FormDataEntryValue | null) => { const s = String(v ?? '').trim(); return ISO_DAY.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) ? s : null; };
const int = (v: FormDataEntryValue | null) => { const s = String(v ?? '').trim(); return /^\d{1,3}$/.test(s) ? Number(s) : s ? NaN : null; };
const pesos = (v: FormDataEntryValue | null): string | null => { const s = String(v ?? '').replace(/[₱,\s]/g, ''); if (!s) return ''; return /^\d{1,9}(\.\d{1,2})?$/.test(s) ? s : null; };
const addDays = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const addMonths = (ymd: string, n: number) => {
  const [y, m, d] = ymd.split('-').map(Number);
  const last = new Date(Date.UTC(y, m - 1 + n + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1 + n, Math.min(d, last))).toISOString().slice(0, 10);
};
export const peso = (n: number | string) => `₱${Number(n).toLocaleString('en-PH', { minimumFractionDigits: Number(n) % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;

// Blood pressure in words lives beside this file with no Node imports, so the page's script can use it too.
import { bpWords, pulseWords } from './record-extra-words';
export { bpWords, pulseWords, type BpLevel, type BpWords } from './record-extra-words';


// --- shapes ------------------------------------------------------------------------------------------
export interface Vital { id: string; at: Date; sys: number | null; dia: number | null; pulse: number | null; note: string | null; by: string | null }
export interface Letter {
  id: string; kind: 'certificate' | 'referral' | 'clearance'; dentist: string; dentistId: string; prc: string | null; issuedOn: string; seenOn: string | null;
  toName: string | null; toRole: string | null; purpose: string | null; diagnosis: string | null; treatment: string | null; restDays: number | null; body: string | null;
  answer: string | null; answerNote: string | null; answeredOn: string | null; at: Date; by: string | null;
}
export interface Loa {
  id: string; payor: string; memberNo: string | null; requestedOn: string; status: string; loaNumber: string | null; approvedOn: string | null; validUntil: string | null;
  amount: string | null; denialReason: string | null; note: string | null; items: { id: string; name: string; fdi: number | null; status: string }[]; at: Date; expired: boolean;
}
export interface PayPlan {
  id: string; kind: 'braces' | 'installment'; title: string; total: number; down: number; monthly: number; months: number; startOn: string; adjustWeeks: number | null;
  status: string; note: string | null; invoiceId: string; invoiceStatus: string; paid: number; at: Date;
  adjustments: { id: string; on: string; note: string | null; nextOn: string | null; by: string | null }[];
  // Worked out from the schedule and what was paid on the statement:
  dueNow: number; behind: number; missed: number; nextDueOn: string | null; nextDueAmount: number; nextAdjustOn: string | null; lastOn: string;
}
export interface Extra { vitals: Vital[]; letters: Letter[]; loas: Loa[]; plans: PayPlan[]; hmoPayors: PayorOption[] }

export const LETTER_KIND: Record<Letter['kind'], string> = { certificate: 'Dental certificate', referral: 'Referral letter', clearance: 'Request for medical clearance' };
export const ANSWER: Record<string, string> = { cleared: 'Cleared for treatment', not_cleared: 'Not cleared yet', conditions: 'Cleared, with conditions' };
export const LOA_STATUS: Record<string, string> = { requested: 'Waiting for the HMO', approved: 'Approved', denied: 'Denied', used: 'Used', cancelled: 'Cancelled' };

/** Where a plan stands today: what should be paid by now, what is behind, the next payment and adjustment. */
export function planState(p: Omit<PayPlan, 'dueNow' | 'behind' | 'missed' | 'nextDueOn' | 'nextDueAmount' | 'nextAdjustOn' | 'lastOn'>, today: string) {
  const dates = Array.from({ length: p.months }, (_, i) => addMonths(p.startOn, i + 1));
  const rest = Math.max(0, p.total - p.down);
  // The last month takes what rounding left, so the schedule adds up to the total exactly.
  const amounts = dates.map((_, i) => (i < p.months - 1 ? Math.min(p.monthly, Math.max(0, rest - p.monthly * i)) : Math.max(0, rest - p.monthly * (p.months - 1))));
  let dueNow = p.startOn <= today ? p.down : 0;
  dates.forEach((d, i) => { if (d <= today) dueNow += amounts[i]; });
  dueNow = Math.min(dueNow, p.total);
  const behind = Math.max(0, Math.round((dueNow - p.paid) * 100) / 100);
  // Walk the schedule with what was paid: the payments due by today it does not cover are the ones missed
  // (the down payment counts as one), and the first one it does not cover is the next to pay.
  let covered = p.paid, nextDueOn: string | null = null, nextDueAmount = 0, missed = 0;
  const all = [{ on: p.startOn, amt: p.down }, ...dates.map((on, i) => ({ on, amt: amounts[i] }))].filter((x) => x.amt > 0);
  for (const x of all) {
    if (covered >= x.amt - 1e-9) { covered -= x.amt; continue; }
    if (!nextDueOn) { nextDueOn = x.on; nextDueAmount = Math.round((x.amt - covered) * 100) / 100; }
    covered = 0;
    if (x.on <= today) missed++;
  }
  const last = p.adjustments[0];
  const nextAdjustOn = p.kind !== 'braces' || p.status !== 'active' ? null : last?.nextOn ?? (last ? addDays(last.on, (p.adjustWeeks ?? 4) * 7) : addDays(p.startOn, (p.adjustWeeks ?? 4) * 7));
  return { dueNow, behind, missed, nextDueOn, nextDueAmount, nextAdjustOn, lastOn: dates[dates.length - 1] ?? p.startOn };
}

export async function loadExtra(tx: Tx, patientId: string, hmoNames: Map<string, string>, today = manilaToday()): Promise<Extra> {
  const [vitals, letters, loas, items, plans, adj, payors] = await Promise.all([
    tx.query(`select v.*, s.full_name from vital_sign v left join staff s on s.id = v.taken_by where v.patient_id = $1 order by v.taken_at desc limit 30`, [patientId]),
    tx.query(`select l.*, to_char(l.issued_on, 'YYYY-MM-DD') as issued, to_char(l.seen_on, 'YYYY-MM-DD') as seen, to_char(l.answered_on, 'YYYY-MM-DD') as answered,
                     d.full_name as dentist, d.prc_licence, c.full_name as by_name
                from clinical_letter l join staff d on d.id = l.dentist_id left join staff c on c.id = l.created_by
               where l.patient_id = $1 order by l.created_at desc limit 100`, [patientId]),
    tx.query(`select a.*, to_char(a.requested_on, 'YYYY-MM-DD') as requested, to_char(a.approved_on, 'YYYY-MM-DD') as approved, to_char(a.valid_until, 'YYYY-MM-DD') as valid
                from hmo_loa a where a.patient_id = $1 order by a.created_at desc limit 50`, [patientId]),
    tx.query(`select id, name, fdi, status, loa_id from treatment_plan_item where patient_id = $1 and loa_id is not null`, [patientId]),
    tx.query(`select p.*, to_char(p.start_on, 'YYYY-MM-DD') as start, i.status as invoice_status,
                     (select coalesce(sum(y.amount), 0) from payment y where y.invoice_id = p.invoice_id and y.voided_at is null) as paid
                from payment_plan p join invoice i on i.id = p.invoice_id where p.patient_id = $1 order by (p.status = 'active') desc, p.created_at desc`, [patientId]),
    tx.query(`select a.id, a.plan_id, to_char(a.done_on, 'YYYY-MM-DD') as done, a.note, to_char(a.next_on, 'YYYY-MM-DD') as next, s.full_name
                from plan_adjustment a left join staff s on s.id = a.done_by where a.patient_id = $1 order by a.done_on desc, a.created_at desc`, [patientId]),
    payorOptions(tx, hmoNames),
  ]);
  return {
    vitals: vitals.rows.map((r) => ({ id: r.id, at: r.taken_at, sys: r.systolic, dia: r.diastolic, pulse: r.pulse, note: r.note, by: r.full_name })),
    letters: letters.rows.map((r) => ({
      id: r.id, kind: r.kind, dentist: r.dentist, dentistId: r.dentist_id, prc: r.prc_licence, issuedOn: r.issued, seenOn: r.seen, toName: r.to_name, toRole: r.to_role,
      purpose: r.purpose, diagnosis: r.diagnosis, treatment: r.treatment, restDays: r.rest_days, body: r.body, answer: r.answer, answerNote: r.answer_note, answeredOn: r.answered,
      at: r.created_at, by: r.by_name,
    })),
    loas: loas.rows.map((r) => ({
      id: r.id, payor: r.payor_name, memberNo: r.member_no, requestedOn: r.requested, status: r.status, loaNumber: r.loa_number, approvedOn: r.approved, validUntil: r.valid,
      amount: r.amount, denialReason: r.denial_reason, note: r.note, at: r.created_at,
      items: items.rows.filter((i) => i.loa_id === r.id).map((i) => ({ id: i.id, name: i.name, fdi: i.fdi, status: i.status })),
      expired: r.status === 'approved' && !!r.valid && r.valid < today,
    })),
    plans: plans.rows.map((r) => {
      const base = {
        id: r.id, kind: r.kind, title: r.title, total: Number(r.total), down: Number(r.down_payment), monthly: Number(r.monthly), months: r.months, startOn: r.start,
        adjustWeeks: r.adjust_weeks, status: r.invoice_status === 'paid' && r.status === 'active' ? 'finished' : r.status, note: r.note, invoiceId: r.invoice_id,
        invoiceStatus: r.invoice_status, paid: Number(r.paid), at: r.created_at,
        adjustments: adj.rows.filter((a) => a.plan_id === r.id).map((a) => ({ id: a.id, on: a.done, note: a.note, nextOn: a.next, by: a.full_name })),
      };
      return { ...base, ...planState(base, today) };
    }),
    hmoPayors: payors.filter((p) => p.kind === 'hmo'),
  };
}

/** The paperwork's lines on the Timeline. */
export function extraEvents(x: Extra, money: boolean): TimelineEvent[] {
  const ev: TimelineEvent[] = [];
  for (const v of x.vitals) {
    const w = v.sys && v.dia ? bpWords(v.sys, v.dia) : null;
    ev.push({ at: v.at, kind: 'health', title: v.sys ? `Blood pressure ${v.sys}/${v.dia}` : `Pulse ${v.pulse}`, detail: [w?.label, v.pulse && v.sys ? `pulse ${v.pulse}` : null, v.note].filter(Boolean).join(' · ') || null, by: v.by, section: 'health', tone: w?.tone === 'alert' ? 'alert' : 'neutral' });
  }
  for (const l of x.letters) {
    ev.push({ at: l.at, kind: 'note', title: LETTER_KIND[l.kind], detail: l.kind === 'certificate' ? l.purpose ?? l.diagnosis : [l.toRole, l.toName].filter(Boolean).join(' · ') || null, by: l.dentist, section: 'rx' });
    if (l.answer && l.answeredOn) ev.push({ at: new Date(`${l.answeredOn}T12:00:00+08:00`), kind: 'health', title: `Physician replied: ${ANSWER[l.answer].toLowerCase()}`, detail: l.answerNote, section: 'rx', tone: l.answer === 'not_cleared' ? 'alert' : 'accent' });
  }
  for (const a of x.loas) ev.push({ at: a.at, kind: 'money', title: `LOA from ${a.payor}: ${LOA_STATUS[a.status].toLowerCase()}`, detail: a.loaNumber ? `Approval code ${a.loaNumber}` : a.items.map((i) => i.name).join(', ') || null, section: 'treatment', tone: a.status === 'denied' ? 'alert' : a.status === 'approved' ? 'accent' : 'neutral' });
  for (const p of x.plans) {
    ev.push({ at: p.at, kind: 'money', title: `${p.kind === 'braces' ? 'Braces plan' : 'Payment plan'} started: ${p.title}`, detail: money ? `${peso(p.total)} · ${peso(p.down)} down, ${peso(p.monthly)} a month for ${p.months} months` : null, section: 'treatment' });
    for (const a of p.adjustments) ev.push({ at: new Date(`${a.on}T12:00:00+08:00`), kind: 'treatment', title: 'Braces adjustment', detail: a.note, by: a.by, section: 'treatment', tone: 'accent' });
  }
  return ev;
}

// --- writing -----------------------------------------------------------------------------------------
export interface ExtraCtx { clinicId: string; staffId: string; patientId: string; canBill: boolean; hmoNames: Map<string, string> }
const SECTION_OF: Record<string, string> = {
  'vitals-add': 'health', 'letter-add': 'rx', 'letter-answer': 'rx',
  'loa-add': 'treatment', 'loa-approve': 'treatment', 'loa-deny': 'treatment', 'loa-cancel': 'treatment',
  'payplan-add': 'treatment', 'payplan-stop': 'treatment', 'adjust-add': 'treatment',
};
export const EXTRA_INTENTS = new Set(Object.keys(SECTION_OF));
export const EXTRA_ANCHOR: Record<string, string> = {
  'vitals-add': 'vitals', 'letter-add': 'letters', 'letter-answer': 'letters', 'loa-add': 'loas', 'loa-approve': 'loas', 'loa-deny': 'loas', 'loa-cancel': 'loas',
  'payplan-add': 'payplans', 'payplan-stop': 'payplans', 'adjust-add': 'payplans',
};
export const EXTRA_PANEL: Record<string, string> = { 'vitals-add': 'rec-vitals-add', 'letter-add': 'rec-letter-add', 'loa-add': 'rec-loa-add', 'payplan-add': 'rec-payplan-add' };

const audit = (tx: Tx, c: ExtraCtx, action: string, entity: string, id: string) =>
  tx.query(`insert into audit_log (clinic_id, staff_id, action, entity, entity_id) values ($1, $2, $3, $4, $5)`, [c.clinicId, c.staffId, action, entity, id]);

export async function extraAction(tx: Tx, c: ExtraCtx, intent: string, form: FormData): Promise<Outcome | 'none'> {
  const section = SECTION_OF[intent] ?? 'overview';
  const values = Object.fromEntries([...form.entries()].filter(([k, v]) => typeof v === 'string' && !['_csrf', 'intent'].includes(k)).map(([k, v]) => [k, String(v)])) as Record<string, string>;
  values._items = form.getAll('items').map(String).join(',');
  const fail = (problem: string): Outcome => ({ ok: false, section, problem, values });
  const done = (saved: string): Outcome => ({ ok: true, section, saved });
  if (!(await tx.query('select id from patient where id = $1 and archived_at is null', [c.patientId])).rowCount) return 'none';
  if (!(await canEditRecords(tx, c.staffId, c.clinicId))) return fail('Your role cannot change records at this branch. Ask the owner.');
  const today = manilaToday();

  switch (intent) {
    case 'vitals-add': {
      const sys = int(form.get('systolic')), dia = int(form.get('diastolic')), pulse = int(form.get('pulse'));
      if ([sys, dia, pulse].some((n) => Number.isNaN(n))) return fail('Write each reading as a whole number, like 120 and 80.');
      if ((sys === null) !== (dia === null)) return fail('Blood pressure is two numbers: the top one (systolic) and the bottom one (diastolic).');
      if (sys === null && pulse === null) return fail('Write the blood pressure, the pulse, or both.');
      if (sys !== null && (sys < 50 || sys > 300 || dia! < 30 || dia! > 200 || dia! >= sys)) return fail('That blood pressure does not look right. The top number is between 50 and 300, and higher than the bottom one.');
      if (pulse !== null && (pulse < 20 || pulse > 250)) return fail('A pulse is between 20 and 250 beats a minute.');
      const note = line(form.get('note'), 300);
      if (note.length > 300) return fail('Keep the note under 300 characters.');
      const { rows: [v] } = await tx.query(`insert into vital_sign (clinic_id, patient_id, systolic, diastolic, pulse, note, taken_by) values ($1, $2, $3, $4, $5, $6, $7) returning id`,
        [c.clinicId, c.patientId, sys, dia, pulse, note || null, c.staffId]);
      await audit(tx, c, 'record.vitals_add', 'vital_sign', v.id);
      return done(sys !== null ? `vitals-${bpWords(sys, dia!).level}` : 'vitals');
    }
    case 'letter-add': {
      const kind = String(form.get('kind') ?? '');
      if (!['certificate', 'referral', 'clearance'].includes(kind)) return fail('Choose which letter to write.');
      const dentistId = String(form.get('dentist') ?? '');
      const d = UUID.test(dentistId) ? (await tx.query(
        `select s.id, s.full_name, s.prc_licence from staff s join staff_access a on a.staff_id = s.id and a.clinic_id = $2
          where s.id = $1 and s.disabled_at is null and s.role in ('owner', 'dentist', 'associate')`, [dentistId, c.clinicId])).rows[0] : undefined;
      if (!d) return fail('Choose the dentist who signs it.');
      if (!d.prc_licence) return fail(`${d.full_name} has no PRC licence number on file. Add it on their page in Clinic settings first.`);
      const seen = dayOf(form.get('seen_on'));
      const f = {
        toName: line(form.get('to_name'), 120), toRole: line(form.get('to_role'), 120), purpose: line(form.get('purpose'), 200),
        diagnosis: text(form.get('diagnosis'), 1000), treatment: text(form.get('treatment'), 1000), body: text(form.get('body'), 2000),
      };
      if (f.toName.length > 120 || f.toRole.length > 120 || f.purpose.length > 200 || f.diagnosis.length > 1000 || f.treatment.length > 1000 || f.body.length > 2000) return fail('One part is too long. Shorten it.');
      const restRaw = int(form.get('rest_days'));
      if (Number.isNaN(restRaw) || (restRaw !== null && restRaw > 14)) return fail('Days of rest is a whole number from 0 to 14.');
      if (seen && seen > today) return fail('The day the patient was seen cannot be in the future.');
      if (kind === 'certificate') {
        if (!seen) return fail('Write the day the patient was seen.');
        if (!f.diagnosis && !f.treatment) return fail('Write what was found or what was done: that is what the certificate attests.');
      }
      if (kind === 'referral' && !f.toRole) return fail('Say who it is for: the kind of specialist, like “Oral surgeon” or “Orthodontist”.');
      if (kind === 'referral' && !f.diagnosis) return fail('Write why you are referring the patient.');
      if (kind === 'clearance' && !f.treatment) return fail('Write the treatment you plan, like “Extraction of 36 under local anaesthesia”.');
      if (kind === 'clearance' && !f.diagnosis) return fail('Write the condition you need clearance for, like “Hypertension” or “Diabetes”.');
      const { rows: [l] } = await tx.query(
        `insert into clinical_letter (clinic_id, patient_id, kind, dentist_id, issued_on, seen_on, to_name, to_role, purpose, diagnosis, treatment, rest_days, body, created_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) returning id`,
        [c.clinicId, c.patientId, kind, d.id, today, seen, f.toName || null, f.toRole || (kind === 'clearance' ? 'Attending physician' : null), f.purpose || null,
         f.diagnosis || null, f.treatment || null, kind === 'certificate' ? restRaw ?? 0 : null, f.body || null, c.staffId]);
      await audit(tx, c, `record.letter_${kind}`, 'clinical_letter', l.id);
      return { ok: true, section, saved: `letter:${l.id}` };
    }
    case 'letter-answer': {
      const id = String(form.get('letter') ?? ''), answer = String(form.get('answer') ?? '');
      if (!Object.hasOwn(ANSWER, answer)) return fail('Choose what the physician said.');
      const on = dayOf(form.get('answered_on')) ?? today;
      if (on > today) return fail('The day of the reply cannot be in the future.');
      const note = text(form.get('answer_note'), 1000);
      if (note.length > 1000) return fail('Keep the note under 1,000 characters.');
      if (answer !== 'cleared' && !note) return fail(answer === 'conditions' ? 'Write the physician’s conditions, like “Take BP before; no epinephrine”.' : 'Write what the physician said, so the next visit knows.');
      const r = UUID.test(id) ? await tx.query(
        `update clinical_letter set answer = $3, answer_note = $4, answered_on = $5, answered_by = $6 where id = $1 and patient_id = $2 and kind = 'clearance' and answer is null returning id`,
        [id, c.patientId, answer, note || null, on, c.staffId]) : { rowCount: 0 };
      if (!r.rowCount) return fail('That request has a reply already, or is not on this record.');
      await audit(tx, c, 'record.clearance_answer', 'clinical_letter', id);
      return done('answered');
    }
    case 'loa-add': {
      const payorValue = String(form.get('payor') ?? '');
      const hmo = (await payorOptions(tx, c.hmoNames)).find((p) => p.kind === 'hmo' && p.value === payorValue);
      if (!hmo) return fail('Choose the HMO. The ones this branch takes are in Clinic settings → HMOs.');
      const memberNo = line(form.get('member_no'), 40);
      if (memberNo.length > 40) return fail('Keep the member number under 40 characters.');
      const requested = dayOf(form.get('requested_on')) ?? today;
      if (requested > today) return fail('The day it was asked for cannot be in the future.');
      const items = form.getAll('items').map(String).filter((x) => UUID.test(x));
      const note = line(form.get('note'), 300);
      const provider = (await tx.query(`select id from hmo_provider where kind = 'hmo' and lower(name) = lower($1) order by active desc limit 1`, [hmo.name])).rows[0];
      const { rows: [a] } = await tx.query(
        `insert into hmo_loa (clinic_id, patient_id, payor_name, provider_id, member_no, requested_on, note, created_by) values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
        [c.clinicId, c.patientId, hmo.name, provider?.id ?? null, memberNo || null, requested, note || null, c.staffId]);
      if (items.length) await tx.query(`update treatment_plan_item set loa_id = $1 where id = any($2::uuid[]) and patient_id = $3 and status in ('planned', 'accepted')`, [a.id, items, c.patientId]);
      await audit(tx, c, 'record.loa_add', 'hmo_loa', a.id);
      return done('loa');
    }
    case 'loa-approve': case 'loa-deny': case 'loa-cancel': {
      const id = String(form.get('loa') ?? '');
      const a = UUID.test(id) ? (await tx.query(`select status from hmo_loa where id = $1 and patient_id = $2 for update`, [id, c.patientId])).rows[0] : undefined;
      if (!a) return fail('That LOA is not on this record.');
      if (intent === 'loa-cancel') {
        if (!['requested', 'approved'].includes(a.status)) return fail('That LOA is closed already.');
        await tx.query(`update hmo_loa set status = 'cancelled', decided_by = $2 where id = $1`, [id, c.staffId]);
        await tx.query(`update treatment_plan_item set loa_id = null where loa_id = $1 and status <> 'done'`, [id]);
        await audit(tx, c, 'record.loa_cancel', 'hmo_loa', id);
        return done('loa-cancelled');
      }
      if (a.status !== 'requested') return fail('That LOA has an answer already. The list shows it.');
      if (intent === 'loa-deny') {
        const reason = line(form.get('reason'), 300);
        if (!reason) return fail('Write the HMO’s reason for denying it, in a few words.');
        await tx.query(`update hmo_loa set status = 'denied', denial_reason = $2, decided_by = $3 where id = $1`, [id, reason.slice(0, 300), c.staffId]);
        await audit(tx, c, 'record.loa_deny', 'hmo_loa', id);
        return done('loa-denied');
      }
      const code = line(form.get('loa_number'), 60);
      if (!code) return fail('Write the approval code the HMO gave.');
      if (code.length > 60) return fail('Keep the approval code under 60 characters.');
      const approved = dayOf(form.get('approved_on')) ?? today;
      const valid = dayOf(form.get('valid_until'));
      if (approved > today) return fail('The day it was approved cannot be in the future.');
      if (valid && valid < approved) return fail('It cannot run out before the day it was approved.');
      const amount = pesos(form.get('amount'));
      if (amount === null) return fail('Write the approved amount in pesos, or leave it empty.');
      await tx.query(`update hmo_loa set status = 'approved', loa_number = $2, approved_on = $3, valid_until = $4, amount = $5, decided_by = $6 where id = $1`,
        [id, code, approved, valid, amount || null, c.staffId]);
      await audit(tx, c, 'record.loa_approve', 'hmo_loa', id);
      return done('loa-approved');
    }
    case 'payplan-add': {
      if (!c.canBill) return fail('Only someone who may bill here makes a payment plan. Ask the owner.');
      const kind = form.get('kind') === 'braces' ? 'braces' : 'installment';
      const title = line(form.get('title'), 120) || (kind === 'braces' ? 'Braces' : '');
      if (!title) return fail('Say what the plan is for, like “Dentures, upper and lower”.');
      if (title.length > 120) return fail('Keep the name under 120 characters.');
      const total = pesos(form.get('total')), down = pesos(form.get('down'));
      if (!total || Number(total) <= 0) return fail('Write the total price in pesos, like 45000.');
      if (down === null) return fail('Write the down payment in pesos, or 0.');
      if (Number(down || 0) > Number(total)) return fail('The down payment cannot be more than the total.');
      const months = int(form.get('months'));
      if (!months || Number.isNaN(months) || months > 60) return fail('Choose how many months: 1 to 60.');
      const rest = Number(total) - Number(down || 0);
      const typedMonthly = pesos(form.get('monthly'));
      if (typedMonthly === null) return fail('Write the monthly amount in pesos, or leave it empty to divide it evenly.');
      const monthly = typedMonthly ? Number(typedMonthly) : Math.ceil(rest / months);
      if (monthly * months < rest - 0.001) return fail(`${peso(monthly)} a month for ${months} months does not reach ${peso(rest)}. Raise the monthly amount or add months.`);
      const start = dayOf(form.get('start_on')) ?? today;
      const weeks = kind === 'braces' ? int(form.get('adjust_weeks')) ?? 4 : null;
      if (weeks !== null && (Number.isNaN(weeks) || weeks < 1 || weeks > 26)) return fail('Adjustments are every 1 to 26 weeks.');
      const note = line(form.get('note'), 300);
      // The money is a statement like any other: made here, paid on the Finances page.
      const st = await createStatement(tx, c.clinicId, c.staffId, {
        patientId: c.patientId, lines: [{ catalogId: '', desc: title.slice(0, 120), qty: '1', price: total }], discount: 'none', discountId: '', payor: '', payorShare: '', formKey: randomUUID(),
      }, []);
      if ('problems' in st) return fail(st.problems.join(' '));
      const { rows: [p] } = await tx.query(
        `insert into payment_plan (clinic_id, patient_id, invoice_id, kind, title, total, down_payment, monthly, months, start_on, adjust_weeks, note, created_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) returning id`,
        [c.clinicId, c.patientId, st.id, kind, title, total, down || '0', String(monthly), months, start, weeks, note || null, c.staffId]);
      await audit(tx, c, 'record.payplan_add', 'payment_plan', p.id);
      return { ok: true, section, saved: `payplan:${st.id}` };
    }
    case 'payplan-stop': {
      if (!c.canBill) return fail('Only someone who may bill here stops a payment plan.');
      const id = String(form.get('plan') ?? '');
      const r = UUID.test(id) ? await tx.query(`update payment_plan set status = 'stopped', ended_at = now() where id = $1 and patient_id = $2 and status = 'active' returning id`, [id, c.patientId]) : { rowCount: 0 };
      if (!r.rowCount) return fail('That plan is not running any more.');
      await audit(tx, c, 'record.payplan_stop', 'payment_plan', id);
      return done('payplan-stopped');
    }
    case 'adjust-add': {
      const id = String(form.get('plan') ?? '');
      const p = UUID.test(id) ? (await tx.query(`select id, adjust_weeks from payment_plan where id = $1 and patient_id = $2 and kind = 'braces' and status = 'active'`, [id, c.patientId])).rows[0] : undefined;
      if (!p) return fail('That braces plan is not running.');
      const on = dayOf(form.get('done_on')) ?? today;
      if (on > today) return fail('An adjustment cannot be dated in the future.');
      const next = dayOf(form.get('next_on')) ?? addDays(on, (p.adjust_weeks ?? 4) * 7);
      if (next <= on) return fail('The next adjustment comes after this one.');
      const note = line(form.get('note'), 300);
      const { rows: [a] } = await tx.query(`insert into plan_adjustment (clinic_id, plan_id, patient_id, done_on, note, next_on, done_by) values ($1, $2, $3, $4, $5, $6, $7) returning id`,
        [c.clinicId, p.id, c.patientId, on, note || null, next, c.staffId]);
      await audit(tx, c, 'record.adjust_add', 'plan_adjustment', a.id);
      return { ok: true, section, saved: `adjusted:${next}` };
    }
  }
  return fail('Choose what to do.');
}

