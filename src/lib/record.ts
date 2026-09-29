// The clinical record beyond health and the chart (033): the treatment plan, treatments done,
// clinical notes, prescriptions, files (X-rays, photos, documents), lab cases, the next check-up, and the
// chart's history. The Treatment record, the ledger of what was done and paid, is src/lib/treatment-record.ts.
//
// Every read and write runs inside withClinic (row-level security decides whether the patient is
// here at all); every write first asks canEditRecords (the role's "records.edit") in the same
// transaction and writes an audit_log line. A signed clinical note is never changed: a correction
// is an addendum. A file taken off the record is hidden (removed_at), never deleted by a click.
//
// Patient files live on disk under <UPLOAD_DIR>/records/<clinic id>/ — never under the public
// /uploads/ route, whose shape (two uuids) the 'records' folder cannot match — and are served only
// by /c/<slug>/patients/<id>/files/<file>/, behind requireWorkspace.
import './dotenv';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type { Tx } from './db';
import { canEditRecords, manilaToday, oneLine } from './health';
import { UPLOAD_DIR } from './uploads';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const FDI = new Set([...[1, 2, 3, 4].flatMap((q) => [1, 2, 3, 4, 5, 6, 7, 8].map((n) => q * 10 + n)), ...[5, 6, 7, 8].flatMap((q) => [1, 2, 3, 4, 5].map((n) => q * 10 + n))]);
const SURFACE = /^[MODBLIFP]{1,5}$/;

// --- small readers -----------------------------------------------------------------------------
const text = (v: FormDataEntryValue | null, max: number) => String(v ?? '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f​-‏‪-‮⁦-⁩﻿]/g, '').trim().slice(0, max + 1);
const line = (v: FormDataEntryValue | null, max: number) => oneLine(v).slice(0, max + 1);
/** "16", "16 17", "11,12, 21" → valid FDI numbers, in order, no repeats. */
export function teethFrom(v: unknown): number[] {
  const out: number[] = [];
  for (const m of String(v ?? '').matchAll(/\d{2}/g)) { const n = Number(m[0]); if (FDI.has(n) && !out.includes(n)) out.push(n); }
  return out;
}
const toothOf = (v: FormDataEntryValue | null) => { const t = teethFrom(v); return t.length ? t[0] : null; };
/** "MO", "M O", "MMO" → "MO": letters only, each once, then checked. */
const surfaceOf = (v: FormDataEntryValue | null) => { const s = [...new Set(String(v ?? '').toUpperCase().replace(/[^A-Z]/g, ''))].join(''); return s && SURFACE.test(s) ? s : null; };
/** The tooth a ToothPick posted. The typed box wins when the radios hold nothing; both holding a tooth,
 *  and different, is a clash (scripts off). An older page posts `fdi` as text; it reads the same. */
function pickedTooth(form: FormData): { raw: string; fdi: number | null; clash: string | null } {
  const typed = String(form.get('fdi_typed') ?? '').trim(), picked = String(form.get('fdi') ?? '').trim();
  const raw = typed || picked, fdi = toothOf(raw);
  const clash = typed && picked && fdi && toothOf(picked) !== fdi ? `${picked} is picked and ${typed} is typed. Keep one of them.` : null;
  return { raw, fdi, clash };
}
/** "1,500", "₱1500.50" → centavos-safe string for numeric(12,2), or null when it is not an amount. */
export function amountOf(v: unknown): string | null {
  const s = String(v ?? '').replace(/[₱,\s]/g, '');
  if (!s) return '0';
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(s)) return null;
  return s;
}
const dayOf = (v: FormDataEntryValue | null) => { const s = String(v ?? '').trim(); return ISO_DAY.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) ? s : null; };

const looksLike = (mime: string, b: Buffer) =>
  mime === 'image/jpeg' ? b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff
  : mime === 'image/png' ? b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  : mime === 'image/webp' ? b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP'
  : mime === 'application/pdf' ? b.subarray(0, 5).toString('latin1') === '%PDF-'
  : false;

// --- words -------------------------------------------------------------------------------------
export const PLAN_STATUS: Record<string, { label: string; tone: 'neutral' | 'accent' | 'warn' | 'muted' }> = {
  planned: { label: 'Planned', tone: 'neutral' },
  accepted: { label: 'Accepted', tone: 'warn' },
  done: { label: 'Done', tone: 'accent' },
  declined: { label: 'Declined', tone: 'muted' },
};
export const FILE_KINDS: Record<string, string> = {
  xray_periapical: 'X-ray · periapical', xray_bitewing: 'X-ray · bitewing', xray_panoramic: 'X-ray · panoramic', cbct: 'CBCT scan',
  photo_intraoral: 'Photo · inside the mouth', photo_extraoral: 'Photo · face and smile', document: 'Document', other: 'Other',
};
export const LAB_STATUS: Record<string, string> = { ordered: 'Ordered', sent: 'Sent to the lab', received: 'Back from the lab', fitted: 'Fitted', remake: 'Remake' };
export const LAB_NEXT: Record<string, string | null> = { ordered: 'sent', sent: 'received', received: 'fitted', fitted: null, remake: 'sent' };
export const RECALL_REASONS = ['Check-up and cleaning', 'Check-up', 'Orthodontic adjustment', 'Review after treatment', 'Periodontal maintenance'];
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const FILE_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };
export const RX_ROWS = 6;

// --- shapes ------------------------------------------------------------------------------------
export interface PlanItem { id: string; loaId: string | null; name: string; fdi: number | null; surface: string | null; price: string; phase: number; status: string; note: string | null; createdAt: Date; decidedAt: Date | null; by: string | null }
export interface Done { id: string; visitId: string | null; name: string; code: string | null; category: string | null; fdi: number | null; surface: string | null; price: string; at: Date; dentist: string | null; note: string | null; fromPlan: boolean }
export interface Note { id: string; visitId: string | null; visitOn: string; dentist: string | null; complaint: string | null; findings: string | null; diagnosis: string | null; treatment: string | null; plan: string | null; teeth: number[]; amends: string | null; by: string | null; at: Date }
export interface RxItem { drug: string; strength: string; qty: string; sig: string }
/** ptr / ptrYear: the copy of the prescriber's PTR taken when it was saved (041), never the live staff value. */
export interface Rx { id: string; visitId: string | null; at: Date; prescriber: string | null; prescriberId: string; prc: string | null; ptr: string | null; ptrYear: number | null; items: RxItem[]; notes: string | null }
export interface FileRow { id: string; visitId: string | null; kind: string; mime: string; bytes: number; takenAt: string | null; fdi: number | null; caption: string | null; by: string | null; at: Date; thumb: boolean }
export interface Recall { id: string; dueOn: string; reason: string; by: string | null; at: Date; /** The Manila day the check-up text last went (036), or null. */ textedOn: string | null }
export interface Lab { id: string; lab: string; description: string; shade: string | null; sentOn: string | null; dueOn: string | null; receivedOn: string | null; cost: string; status: string; note: string | null; at: Date }
/** ptr / ptrYear: the PTR on file now; rank / isOwner: their role's, for who may fix it (ptrFix on the record page). */
export interface Clinician { id: string; name: string; prc: string | null; ptr: string | null; ptrYear: number | null; rank: number | null; isOwner: boolean }
/** code: the fee guide's code (restoration, sealant …): the picker carries the chart's surfaces over only for work on surfaces. */
export interface CatalogItem { id: string; code: string; name: string; price: string; max: string | null; from: boolean; tooth: boolean; category: string | null }

export interface Clinical { plan: PlanItem[]; done: Done[]; notes: Note[]; rx: Rx[]; files: FileRow[]; recall: Recall | null; labs: Lab[]; clinicians: Clinician[]; catalog: CatalogItem[] }

export async function loadClinical(tx: Tx, clinicId: string, patientId: string): Promise<Clinical> {
  const [plan, done, notes, rx, files, recall, labs, clinicians, catalog] = await Promise.all([
    tx.query(`select i.*, s.full_name as by_name from treatment_plan_item i left join staff s on s.id = i.created_by
               where i.patient_id = $1 order by (i.status in ('done', 'declined')), i.phase, i.created_at`, [patientId]),
    tx.query(`select d.id, d.appointment_id, coalesce(d.name, c.name, 'Treatment') as name, c.code, c.category, d.fdi, d.surface, d.price, d.performed_at, s.full_name as dentist, d.clinical_note, d.plan_id is not null as from_plan
                from procedure_done d left join procedure_catalog c on c.id = d.catalog_id left join staff s on s.id = d.performed_by
               where d.patient_id = $1 order by d.performed_at desc limit 300`, [patientId]),
    tx.query(`select n.*, to_char(n.visit_on, 'YYYY-MM-DD') as day, d.full_name as dentist, c.full_name as by_name
                from clinical_note n left join staff d on d.id = n.dentist_id left join staff c on c.id = n.created_by
               where n.patient_id = $1 order by n.visit_on desc, n.created_at desc limit 300`, [patientId]),
    tx.query(`select r.id, r.appointment_id, r.issued_at, r.items, r.notes, r.prescriber_id, s.full_name, s.prc_licence, r.ptr_number, r.ptr_year
                from prescription r left join staff s on s.id = r.prescriber_id where r.patient_id = $1 order by r.issued_at desc limit 200`, [patientId]),
    tx.query(`select a.id, a.appointment_id, a.kind, a.mime, a.bytes, to_char(a.taken_at at time zone 'Asia/Manila', 'YYYY-MM-DD') as taken, a.fdi, a.caption, s.full_name as by_name, a.created_at, a.storage_key
                from attachment a left join staff s on s.id = a.uploaded_by where a.patient_id = $1 and a.removed_at is null order by coalesce(a.taken_at, a.created_at) desc limit 500`, [patientId]),
    tx.query(`select r.id, to_char(r.due_on, 'YYYY-MM-DD') as due, r.reason, s.full_name as by_name, r.created_at, to_char(r.last_sent_at at time zone 'Asia/Manila', 'YYYY-MM-DD') as texted
                from recall r left join staff s on s.id = r.created_by where r.patient_id = $1 and r.completed_at is null order by r.due_on limit 1`, [patientId]),
    tx.query(`select l.*, to_char(l.sent_on, 'YYYY-MM-DD') as sent, to_char(l.due_on, 'YYYY-MM-DD') as due, to_char(l.received_on, 'YYYY-MM-DD') as received
                from lab_order l where l.patient_id = $1 order by (l.status = 'fitted'), l.created_at desc limit 100`, [patientId]),
    tx.query(`select s.id, s.full_name, s.prc_licence, s.ptr_number, s.ptr_year, cr.rank, cr.is_owner
                from staff s join staff_access a on a.staff_id = s.id and a.clinic_id = $1 left join clinic_role cr on cr.id = s.role_id
               where s.disabled_at is null and s.role in ('owner', 'dentist', 'associate') order by s.full_name`, [clinicId]),
    tx.query(`select id, code, name, default_price, price_max, price_from, tooth_scoped, category from procedure_catalog where active order by category nulls last, name`),
  ]);
  return {
    plan: plan.rows.map((r) => ({ id: r.id, loaId: r.loa_id ?? null, name: r.name, fdi: r.fdi, surface: r.surface, price: r.price, phase: r.phase, status: r.status, note: r.note, createdAt: r.created_at, decidedAt: r.decided_at, by: r.by_name })),
    done: done.rows.map((r) => ({ id: r.id, visitId: r.appointment_id ?? null, name: r.name, code: r.code ?? null, category: r.category ?? null, fdi: r.fdi, surface: r.surface, price: r.price, at: r.performed_at, dentist: r.dentist, note: r.clinical_note, fromPlan: r.from_plan })),
    notes: notes.rows.map((r) => ({ id: r.id, visitId: r.appointment_id ?? null, visitOn: r.day, dentist: r.dentist, complaint: r.complaint, findings: r.findings, diagnosis: r.diagnosis, treatment: r.treatment, plan: r.plan, teeth: r.teeth ?? [], amends: r.amends_id, by: r.by_name, at: r.created_at })),
    rx: rx.rows.map((r) => ({ id: r.id, visitId: r.appointment_id ?? null, at: r.issued_at, prescriber: r.full_name, prescriberId: r.prescriber_id, prc: r.prc_licence, ptr: r.ptr_number, ptrYear: r.ptr_year ?? null, items: Array.isArray(r.items) ? r.items : [], notes: r.notes })),
    files: files.rows.map((r) => ({ id: r.id, visitId: r.appointment_id ?? null, kind: r.kind, mime: r.mime, bytes: Number(r.bytes), takenAt: r.taken, fdi: r.fdi, caption: r.caption, by: r.by_name, at: r.created_at, thumb: String(r.storage_key).includes('|thumb') })),
    recall: recall.rows[0] ? { id: recall.rows[0].id, dueOn: recall.rows[0].due, reason: recall.rows[0].reason, by: recall.rows[0].by_name, at: recall.rows[0].created_at, textedOn: recall.rows[0].texted ?? null } : null,
    labs: labs.rows.map((r) => ({ id: r.id, lab: r.lab_name, description: r.description, shade: r.shade, sentOn: r.sent, dueOn: r.due, receivedOn: r.received, cost: r.cost, status: r.status, note: r.note, at: r.created_at })),
    clinicians: clinicians.rows.map((r) => ({ id: r.id, name: r.full_name, prc: r.prc_licence, ptr: r.ptr_number, ptrYear: r.ptr_year ?? null, rank: r.rank ?? null, isOwner: !!r.is_owner })),
    catalog: catalog.rows.map((r) => ({ id: r.id, code: r.code, name: r.name, price: r.default_price, max: r.price_max, from: r.price_from, tooth: r.tooth_scoped, category: r.category })),
  };
}

// --- changes to the chart ---------------------------------------------------------------------
export interface ChartChange { at: Date; by: string | null; n: number; teeth: string }
/** The chart's changes, newest first, grouped by the minute and the person (tooth_state rows): the Chart section's
 *  "Changes to the chart". The chart itself is the odontogram's; this only reads its history. */
export async function loadChartChanges(tx: Tx, patientId: string): Promise<ChartChange[]> {
  const { rows } = await tx.query(
    `select date_trunc('minute', t.noted_at) as at, s.full_name, count(*)::int as n, string_agg(distinct t.fdi::text, ', ' order by t.fdi::text) as teeth
       from tooth_state t left join staff s on s.id = t.noted_by where t.patient_id = $1 group by 1, 2 order by 1 desc limit 200`, [patientId]);
  return rows.map((r) => ({ at: r.at, by: r.full_name ?? null, n: r.n, teeth: r.teeth }));
}

// --- writing -----------------------------------------------------------------------------------
export interface Ctx { clinicId: string; staffId: string; patientId: string }
/** What a post did: where to go back to, or what was wrong (with what was typed, to show again). */
export type Outcome = { ok: true; section: string; saved: string } | { ok: false; section: string; problem: string; values: Record<string, string> };
const SECTION_OF: Record<string, string> = {
  'plan-add': 'treatment', 'plan-status': 'treatment', 'plan-remove': 'treatment', 'done-add': 'treatment', 'lab-add': 'treatment', 'lab-next': 'treatment',
  'note-add': 'notes', 'rx-add': 'rx', 'file-add': 'files', 'file-remove': 'files', 'recall-set': 'overview', 'recall-done': 'overview', 'recall-clear': 'overview',
};
export const RECORD_INTENTS = new Set(Object.keys(SECTION_OF));

const audit = (tx: Tx, c: Ctx, action: string, entity: string, id: string) =>
  tx.query(`insert into audit_log (clinic_id, staff_id, action, entity, entity_id) values ($1, $2, $3, $4, $5)`, [c.clinicId, c.staffId, action, entity, id]);

/**
 * The visit a chairside post is for (036): the record's This visit strip puts the visit's id in a hidden
 * `visit` field on the treatment, note, prescription, blood pressure and file forms, so what is written
 * during a visit names it (appointment_id) instead of being matched to it by the day later. Only this
 * patient's own visit, and never a cancelled or missed one; anything else is simply no visit.
 */
export async function visitOf(tx: Tx, form: FormData, patientId: string): Promise<string | null> {
  const id = String(form.get('visit') ?? '');
  if (!UUID.test(id)) return null;
  const r = await tx.query(`select id from appointment where id = $1 and patient_id = $2 and status not in ('cancelled', 'no_show')`, [id, patientId]);
  return r.rows[0]?.id ?? null;
}

/** One post from the record page. The patient must exist here (RLS) and the person may edit records. */
export async function recordAction(tx: Tx, c: Ctx, intent: string, form: FormData): Promise<Outcome | 'none'> {
  const section = SECTION_OF[intent] ?? 'overview';
  // What was posted, to draw again on a refusal. The tooth picker posts several `teeth` (a note) and `surface`
  // (M, O, D …) entries: they are kept together, space-separated, not just the last one.
  const values: Record<string, string> = {};
  for (const [k, v] of form.entries()) {
    if (typeof v !== 'string' || k === '_csrf' || k === 'intent') continue;
    values[k] = (k === 'teeth' || k === 'surface') && k in values ? `${values[k]} ${v}` : v;
  }
  const fail = (problem: string): Outcome => ({ ok: false, section, problem, values });
  const done = (saved: string): Outcome => ({ ok: true, section, saved });
  const here = (await tx.query('select id from patient where id = $1 and archived_at is null', [c.patientId])).rows[0];
  if (!here) return 'none';
  if (!(await canEditRecords(tx, c.staffId, c.clinicId))) return fail('Your role cannot change records at this branch. Ask the owner.');
  const clinician = async (id: string) => UUID.test(id) ? (await tx.query(
    `select s.id, s.full_name, s.prc_licence, s.ptr_number, s.ptr_year from staff s join staff_access a on a.staff_id = s.id and a.clinic_id = $2
      where s.id = $1 and s.disabled_at is null and s.role in ('owner', 'dentist', 'associate')`, [id, c.clinicId])).rows[0] : undefined;
  const catalogItem = async (id: string) => UUID.test(id) ? (await tx.query('select id, name, default_price from procedure_catalog where id = $1', [id])).rows[0] : undefined;

  switch (intent) {
    case 'plan-add': case 'done-add': {
      const cat = await catalogItem(String(form.get('catalog_id') ?? ''));
      const name = line(form.get('name'), 160) || cat?.name || '';
      if (!name) return fail('Choose a treatment from your fee guide, or type one.');
      if (name.length > 160) return fail('Keep the treatment’s name to 160 characters.');
      const { raw: typedTooth, fdi, clash } = pickedTooth(form);
      if (typedTooth && !fdi) return fail('That is not a tooth number. Use the FDI numbers on the chart: 11 to 48, or 51 to 85 for baby teeth.');
      if (clash) return fail(clash);
      // The picker's toggles post one `surface` each (M, O …); an older page posts them as one text ("MOD").
      const typedSurface = form.getAll('surface').map(String).join('').trim();
      const surface = surfaceOf(typedSurface);
      if (typedSurface && !surface) return fail('Surfaces are letters: M, O, D, B, L (or I, F, P), up to five, like “MOD”.');
      const price = amountOf(form.get('price') || (cat ? cat.default_price : ''));
      if (price === null) return fail('Write the price as a number, like 1500 or 1,500.00.');
      if (intent === 'plan-add') {
        const phase = Math.min(9, Math.max(1, Number(form.get('phase')) || 1));
        const note = line(form.get('note'), 500);
        let plan = (await tx.query(`select id from treatment_plan where patient_id = $1 and status in ('proposed', 'accepted', 'in_progress') order by created_at desc limit 1`, [c.patientId])).rows[0];
        if (!plan) plan = (await tx.query(`insert into treatment_plan (clinic_id, patient_id, name) values ($1, $2, 'Treatment plan') returning id`, [c.clinicId, c.patientId])).rows[0];
        const { rows: [it] } = await tx.query(
          `insert into treatment_plan_item (clinic_id, plan_id, patient_id, catalog_id, name, fdi, surface, price, phase, note, created_by)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) returning id`,
          [c.clinicId, plan.id, c.patientId, cat?.id ?? null, name, fdi, surface, price, phase, note || null, c.staffId]);
        await audit(tx, c, 'record.plan_add', 'treatment_plan_item', it.id);
        return done('plan');
      }
      const dentist = await clinician(String(form.get('dentist') ?? ''));
      if (!dentist) return fail('Choose the dentist who did it.');
      const on = dayOf(form.get('on')) ?? manilaToday();
      if (on > manilaToday()) return fail('A treatment done cannot be dated in the future.');
      const note = text(form.get('note'), 2000);
      const { rows: [d] } = await tx.query(
        `insert into procedure_done (clinic_id, patient_id, catalog_id, name, fdi, surface, price, performed_by, performed_at, clinical_note, created_by, appointment_id)
         values ($1, $2, $3, $4, $5, $6, $7, $8, case when $9::date = (now() at time zone 'Asia/Manila')::date then now() else ($9::date + time '12:00') at time zone 'Asia/Manila' end, $10, $11, $12) returning id`,
        [c.clinicId, c.patientId, cat?.id ?? null, name, fdi, surface, price, dentist.id, on, note || null, c.staffId, await visitOf(tx, form, c.patientId)]);
      await audit(tx, c, 'record.done_add', 'procedure_done', d.id);
      return done('done');
    }
    case 'plan-status': {
      const id = String(form.get('item') ?? '');
      const to = String(form.get('to') ?? '');
      if (!UUID.test(id) || !['planned', 'accepted', 'declined', 'done'].includes(to)) return fail('Choose what to do with that item.');
      const it = (await tx.query('select * from treatment_plan_item where id = $1 and patient_id = $2 for update', [id, c.patientId])).rows[0];
      if (!it) return fail('That item is not on the plan any more. The plan shows where it stands now.');
      if (it.status === 'done') return fail('That item is done already.');
      let doneId: string | null = null;
      if (to === 'done') {
        const dentist = await clinician(String(form.get('dentist') ?? '')) ?? await clinician(c.staffId);
        if (!dentist) return fail('Choose the dentist who did it.');
        const { rows: [d] } = await tx.query(
          `insert into procedure_done (clinic_id, patient_id, plan_id, catalog_id, name, fdi, surface, price, performed_by, clinical_note, created_by, appointment_id)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) returning id`,
          [c.clinicId, c.patientId, it.plan_id, it.catalog_id, it.name, it.fdi, it.surface, it.price, dentist.id, it.note, c.staffId, await visitOf(tx, form, c.patientId)]);
        doneId = d.id;
      }
      await tx.query('update treatment_plan_item set status = $2, decided_at = now(), done_id = coalesce($3, done_id) where id = $1', [id, to, doneId]);
      // The HMO's LOA for it is used once every item it covers is done (034).
      if (to === 'done' && it.loa_id) {
        await tx.query(`update hmo_loa set status = 'used' where id = $1 and status = 'approved'
                          and not exists (select 1 from treatment_plan_item where loa_id = $1 and status in ('planned', 'accepted'))`, [it.loa_id]);
      }
      await audit(tx, c, `record.plan_${to}`, 'treatment_plan_item', id);
      return done(`plan-${to}`);
    }
    case 'plan-remove': {
      const id = String(form.get('item') ?? '');
      const r = UUID.test(id) ? await tx.query(`delete from treatment_plan_item where id = $1 and patient_id = $2 and status <> 'done' returning id`, [id, c.patientId]) : { rowCount: 0 };
      if (!r.rowCount) return fail('That item is done, or not on the plan any more.');
      await audit(tx, c, 'record.plan_remove', 'treatment_plan_item', id);
      return done('plan-removed');
    }
    case 'note-add': {
      const fields = { complaint: text(form.get('complaint'), 2000), findings: text(form.get('findings'), 4000), diagnosis: text(form.get('diagnosis'), 2000), treatment: text(form.get('treatment'), 4000), plan: text(form.get('plan'), 2000) };
      if (!Object.values(fields).some(Boolean)) return fail('Write at least one part of the note.');
      const MAX: Record<string, number> = { complaint: 2000, findings: 4000, diagnosis: 2000, treatment: 4000, plan: 2000 };
      if (Object.entries(fields).some(([k, v]) => v.length > MAX[k])) return fail('One part of the note is too long. Split it into two notes.');
      const amends = String(form.get('amends') ?? '');
      if (amends && !(UUID.test(amends) && (await tx.query('select 1 from clinical_note where id = $1 and patient_id = $2', [amends, c.patientId])).rowCount)) return fail('The note this adds to is not on this record.');
      const dentist = await clinician(String(form.get('dentist') ?? ''));
      const on = dayOf(form.get('visit_on')) ?? manilaToday();
      if (on > manilaToday()) return fail('A clinical note cannot be dated in the future.');
      const { rows: [n] } = await tx.query(
        `insert into clinical_note (clinic_id, patient_id, visit_on, dentist_id, complaint, findings, diagnosis, treatment, plan, teeth, amends_id, created_by, appointment_id)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) returning id`,
        // Ticked teeth (several `teeth`) and typed ones (`teeth_typed`, or an older page's `teeth` text) together: they cannot clash.
        [c.clinicId, c.patientId, on, dentist?.id ?? null, fields.complaint || null, fields.findings || null, fields.diagnosis || null, fields.treatment || null, fields.plan || null,
         teethFrom([...form.getAll('teeth'), form.get('teeth_typed') ?? ''].map(String).join(' ')), amends || null, c.staffId, await visitOf(tx, form, c.patientId)]);
      await audit(tx, c, amends ? 'record.note_addendum' : 'record.note_add', 'clinical_note', n.id);
      return done(amends ? 'addendum' : 'note');
    }
    case 'rx-add': {
      const prescriber = await clinician(String(form.get('prescriber') ?? ''));
      if (!prescriber) return fail('Choose the dentist who prescribes.');
      if (!prescriber.prc_licence) return fail(`${prescriber.full_name} has no PRC licence number on file. Add it on their page in Clinic settings first.`);
      const items: RxItem[] = [];
      const drugs = form.getAll('drug'), str = form.getAll('strength'), qty = form.getAll('qty'), sig = form.getAll('sig');
      for (let i = 0; i < Math.min(RX_ROWS, drugs.length); i++) {
        const it = { drug: line(drugs[i], 120), strength: line(str[i] ?? '', 60), qty: line(qty[i] ?? '', 40), sig: line(sig[i] ?? '', 240) };
        if (!it.drug && !it.strength && !it.qty && !it.sig) continue;
        if (!it.drug) return fail(`Line ${i + 1}: write the medicine’s name.`);
        if (!it.sig) return fail(`Line ${i + 1}: write how to take ${it.drug} (for example, 1 capsule every 8 hours for 7 days).`);
        items.push(it);
      }
      if (!items.length) return fail('Write at least one medicine.');
      const notes = text(form.get('notes'), 500);
      // The paper takes a copy of the prescriber's PTR as it is on file now, in this transaction (041); no PTR state refuses.
      const { rows: [r] } = await tx.query(
        `insert into prescription (clinic_id, patient_id, prescriber_id, items, notes, appointment_id, ptr_number, ptr_year)
         values ($1, $2, $3, $4::jsonb, $5, $6, $7, $8) returning id`,
        [c.clinicId, c.patientId, prescriber.id, JSON.stringify(items), notes || null, await visitOf(tx, form, c.patientId), prescriber.ptr_number ?? null, prescriber.ptr_year ?? null]);
      await audit(tx, c, 'record.rx_add', 'prescription', r.id);
      return { ok: true, section, saved: `rx:${r.id}` };
    }
    case 'file-add': {
      const files = form.getAll('file').filter((f): f is File => typeof f === 'object' && 'arrayBuffer' in f && (f as File).size > 0);
      if (!files.length) return fail('Choose a file to add: an X-ray, a photo or a PDF.');
      if (files.length > 10) return fail('Add up to 10 files at a time.');
      const kind = String(form.get('kind') ?? '');
      if (!Object.hasOwn(FILE_KINDS, kind)) return fail('Say what the file is: an X-ray, a photo or a document.');
      const { raw: typedTooth, fdi, clash } = pickedTooth(form);
      if (typedTooth && !fdi) return fail('That is not a tooth number. Use the FDI numbers on the chart, or leave it empty.');
      if (clash) return fail(clash);
      const taken = dayOf(form.get('taken_on'));
      if (taken && taken > manilaToday()) return fail('The day it was taken cannot be in the future.');
      const caption = line(form.get('caption'), 200);
      const read = new Map<File, Buffer>();
      for (const f of files) {
        if (!FILE_TYPES[f.type]) return fail(`${f.name} is not a JPEG, PNG, WebP picture or a PDF.`);
        if (f.size > MAX_FILE_BYTES) return fail(`${f.name} is larger than 25 MB. Save a smaller copy and try again.`);
        // The browser's word for the type is checked against the file's own first bytes, so nothing else is kept under a picture's name.
        const b = Buffer.from(await f.arrayBuffer());
        if (!looksLike(f.type, b)) return fail(`${f.name} is not really a ${FILE_TYPES[f.type].toUpperCase()} file. Save it again as a picture or a PDF.`);
        read.set(f, b);
      }
      const dir = join(UPLOAD_DIR, 'records', c.clinicId);
      await mkdir(dir, { recursive: true });
      const visit = await visitOf(tx, form, c.patientId);
      for (const f of files) {
        const id = randomUUID();
        const bytes = read.get(f)!;
        await writeFile(join(dir, `${id}.${FILE_TYPES[f.type]}`), bytes, { flag: 'wx' });
        let thumb = false;
        if (f.type.startsWith('image/')) {
          try {
            const { default: sharp } = await import('sharp');
            await sharp(bytes).rotate().resize({ width: 480, height: 480, fit: 'inside', withoutEnlargement: true }).webp({ quality: 70 }).toFile(join(dir, `${id}-thumb.webp`));
            thumb = true;
          } catch { return fail(`${f.name} could not be read as a picture.`); }
        }
        const { rows: [a] } = await tx.query(
          `insert into attachment (clinic_id, patient_id, kind, storage_key, bytes, mime, taken_at, fdi, caption, uploaded_by, appointment_id)
           values ($1, $2, $3, $4, $5, $6, case when $7::date is null then null else ($7::date + time '12:00') at time zone 'Asia/Manila' end, $8, $9, $10, $11) returning id`,
          [c.clinicId, c.patientId, f.type === 'application/pdf' && kind !== 'other' ? 'document' : kind, `${id}.${FILE_TYPES[f.type]}${thumb ? '|thumb' : ''}`, f.size, f.type, taken, fdi, caption || (files.length === 1 ? null : f.name.slice(0, 200)), c.staffId, visit]);
        await audit(tx, c, 'record.file_add', 'attachment', a.id);
      }
      return done(files.length === 1 ? 'file' : `files:${files.length}`);
    }
    case 'file-remove': {
      const id = String(form.get('file') ?? '');
      const r = UUID.test(id) ? await tx.query('update attachment set removed_at = now(), removed_by = $3 where id = $1 and patient_id = $2 and removed_at is null returning id', [id, c.patientId, c.staffId]) : { rowCount: 0 };
      if (!r.rowCount) return fail('That file is not on the record any more.');
      await audit(tx, c, 'record.file_remove', 'attachment', id);
      return done('file-removed');
    }
    case 'recall-set': {
      const months = Number(form.get('months'));
      const due = [3, 6, 12].includes(months)
        ? (await tx.query(`select to_char(((now() at time zone 'Asia/Manila')::date + make_interval(months => $1))::date, 'YYYY-MM-DD') as d`, [months])).rows[0].d
        : dayOf(form.get('due_on'));
      if (!due) return fail('Choose when: in 3, 6 or 12 months, or a day.');
      if (due <= manilaToday()) return fail('The next check-up needs a day after today.');
      const reason = line(form.get('reason'), 120) || RECALL_REASONS[0];
      await tx.query('update recall set completed_at = now() where patient_id = $1 and completed_at is null', [c.patientId]);
      const { rows: [r] } = await tx.query(`insert into recall (clinic_id, patient_id, due_on, reason, created_by) values ($1, $2, $3, $4, $5) returning id`, [c.clinicId, c.patientId, due, reason, c.staffId]);
      await audit(tx, c, 'record.recall_set', 'recall', r.id);
      return done('recall');
    }
    case 'recall-done': case 'recall-clear': {
      const r = await tx.query('update recall set completed_at = now() where patient_id = $1 and completed_at is null returning id', [c.patientId]);
      if (r.rowCount) await audit(tx, c, `record.${intent.replace('-', '_')}`, 'recall', r.rows[0].id);
      return done(intent === 'recall-done' ? 'recall-done' : 'recall-cleared');
    }
    case 'lab-add': {
      const lab = line(form.get('lab'), 120), description = line(form.get('description'), 200);
      if (!lab) return fail('Write the lab’s name.');
      if (!description) return fail('Write what the lab is making, for example “PFM crown, 21”.');
      const cost = amountOf(form.get('cost'));
      if (cost === null) return fail('Write the lab’s cost as a number, or leave it empty.');
      const sent = dayOf(form.get('sent_on')), due = dayOf(form.get('due_on'));
      if (sent && due && due < sent) return fail('The day it is due back cannot be before the day it was sent.');
      const { rows: [l] } = await tx.query(
        `insert into lab_order (clinic_id, patient_id, lab_name, description, shade, sent_on, due_on, cost, status, note, created_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) returning id`,
        [c.clinicId, c.patientId, lab, description, line(form.get('shade'), 20) || null, sent, due, cost, sent ? 'sent' : 'ordered', line(form.get('note'), 300) || null, c.staffId]);
      await audit(tx, c, 'record.lab_add', 'lab_order', l.id);
      return done('lab');
    }
    case 'lab-next': {
      const id = String(form.get('lab') ?? '');
      const to = String(form.get('to') ?? '');
      const l = UUID.test(id) ? (await tx.query('select status from lab_order where id = $1 and patient_id = $2 for update', [id, c.patientId])).rows[0] : undefined;
      if (!l) return fail('That lab case is not on the record any more.');
      if (to !== 'remake' && LAB_NEXT[l.status] !== to) return fail('That lab case has moved on already. The list shows where it stands now.');
      await tx.query(
        `update lab_order set status = $2,
                sent_on = case when $2 = 'sent' and sent_on is null then (now() at time zone 'Asia/Manila')::date else sent_on end,
                received_on = case when $2 = 'received' then (now() at time zone 'Asia/Manila')::date else received_on end
          where id = $1`, [id, to]);
      await audit(tx, c, `record.lab_${to}`, 'lab_order', id);
      return done('lab-moved');
    }
  }
  return fail('Choose what to do.');
}

/** A patient file's bytes, for the route that serves it (behind requireWorkspace, inside withClinic). */
export async function readRecordFile(tx: Tx, clinicId: string, patientId: string, fileId: string, thumb: boolean): Promise<{ bytes: Buffer; mime: string; name: string } | null> {
  if (!UUID.test(fileId) || !UUID.test(clinicId)) return null;
  const a = (await tx.query('select storage_key, mime, kind, caption from attachment where id = $1 and patient_id = $2 and removed_at is null', [fileId, patientId])).rows[0];
  if (!a) return null;
  const [key, flag] = String(a.storage_key).split('|');
  const m = /^([0-9a-f-]{36})\.(jpg|png|webp|pdf)$/.exec(key);
  if (!m) return null;
  const path = thumb && flag === 'thumb' ? join(UPLOAD_DIR, 'records', clinicId, `${m[1]}-thumb.webp`) : join(UPLOAD_DIR, 'records', clinicId, key);
  try {
    const bytes = await readFile(path);
    return { bytes, mime: thumb && flag === 'thumb' ? 'image/webp' : a.mime, name: `${(a.caption || FILE_KINDS[a.kind] || 'file').replace(/[^\w .-]+/g, '').slice(0, 60) || 'file'}.${m[2]}` };
  } catch { return null; }
}

/** A post the record refused, for the section to show again: which form, the sentence, what was typed. */
export interface RecordProblem { intent: string; text: string; values: Record<string, string> }
/** The side panel each form lives in, so a refused post comes back open in it. */
export const PANEL_OF: Record<string, string> = {
  'plan-add': 'rec-plan-add', 'done-add': 'rec-done-add', 'lab-add': 'rec-lab-add', 'note-add': 'rec-note-add', 'rx-add': 'rec-rx-add', 'file-add': 'rec-file-add', 'recall-set': 'rec-recall-set',
};
