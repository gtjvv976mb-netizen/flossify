// Adding a patient's own answers to the records: the one add path shared by
// the poster's patient forms (src/lib/patient-forms.ts: "Add as a new
// patient", "Add to <patient>") and the patient intake (039). Each helper runs
// inside the caller's withClinic() transaction, after the caller has checked
// canEditRecords and locked what it adds (the form or the intake row), so
// row-level security decides what exists.
//
// The answers are the patient forms' shape (PatientFormValues, from
// parsePatientForm); the intake's page 1 is a subset of the same fields by
// name (src/lib/intake-def.ts), so these read only fields both have, and what
// a source does not ask about is simply empty.
//
// Rules kept (they were the forms' own, and stay the same for both):
// - A new patient takes the next free P- chart number under the clinic's lock
//   (lockClinic), as Add patient does.
// - Adding to a patient on file fills only what is empty on the record and
//   never changes a name; what differs is returned for the page to show. A
//   mobile or an email is never copied without the desk ticking it (`use`):
//   /me/ finds visits by mobile, and receipts go by email.
// - The health version is answered by the patient (answered_by 'patient',
//   recorded_by null: 021's rule for a patient's own answers), dated when it
//   goes on the record (answered_at now) so it is the current one; when the
//   answers were sent is in its `answers`. For a patient on file the
//   allergies, conditions and medicines already listed stay: something the
//   patient did not tick is not evidence it is gone.
// - One consent row per version per patient (a parent's or guardian's may be
//   added beside the patient's own).
// - Nothing here logs an answer.

import type { Tx } from './db';
import { lockClinic, nextChartNos } from './import';
import { isMinor, type HealthAnswers } from './health';
import { prettyPhone } from './messages';
import { FIELDS, answerText, healthLists, hmoName, stepAnswers, type PatientFormValues } from './patient-forms-def';

/** Where the answers came from: a poster's patient form (028), or an intake (039). */
export type AnswerSource =
  | { kind: 'form'; id: string; ref: string; version: string; sentAt: Date }
  | { kind: 'intake'; id: string; ref: string; version: string; sentAt: Date };

export const audit = (tx: Tx, clinicId: string, staffId: string, action: string, entity: string, id: string) =>
  tx.query('insert into audit_log (clinic_id, staff_id, action, entity, entity_id) values ($1, $2, $3, $4, $5)', [clinicId, staffId, action, entity, id]);

/** The last ten digits of a phone number, for matching a mobile however it was typed. */
export const digits10 = (s: string | null) => (s ?? '').replace(/\D/g, '').slice(-10);

// ---------------------------------------------------------------------------
// A new patient
// ---------------------------------------------------------------------------
/**
 * Write the patient row from the answers: the next free P- chart number
 * (under lockClinic, taken here too: it is the same transaction's lock), the
 * names, birth date, sex, contact, address, occupation, a parent or guardian
 * when the answers name one (the patient was under 18), the HMO and the
 * emergency contact, created by `staffId`. Audit patient.create.
 */
export async function insertPatientFromAnswers(tx: Tx, a: { clinicId: string; staffId: string; values: PatientFormValues }): Promise<{ patientId: string; chartNo: string }> {
  await lockClinic(tx, a.clinicId);
  const v = a.values;
  const chartNo = nextChartNos((await tx.query<{ chart_no: string }>('select chart_no from patient')).rows.map((r) => r.chart_no), 1)[0];
  const minorForm = v.guardian_name !== null && v.guardian_name !== undefined;
  const patientId = (await tx.query<{ id: string }>(
    `insert into patient (clinic_id, chart_no, first_name, middle_name, last_name, suffix, birth_date, sex, phone, email, address_line, city, province, occupation,
                          guardian_name, guardian_relation, guardian_phone, hmo_name, hmo_member_no, emergency_name, emergency_relation, emergency_phone, created_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
     returning id`,
    [a.clinicId, chartNo, v.first_name, v.middle_name ?? null, v.last_name, v.suffix ?? null, v.birth_date, v.sex, v.mobile, v.email ?? null, v.address, v.city, v.province, v.occupation ?? null,
      minorForm ? v.guardian_name : null, minorForm ? v.guardian_relation : null, minorForm ? v.guardian_mobile : null,
      hmoName(v), v.hmo ? v.hmo_card_no ?? null : null, v.emergency_name, v.emergency_relation, v.emergency_mobile, a.staffId])).rows[0].id;
  await audit(tx, a.clinicId, a.staffId, 'patient.create', 'patient', patientId);
  return { patientId, chartNo };
}

// ---------------------------------------------------------------------------
// A patient on file
// ---------------------------------------------------------------------------
/** A detail on the record that the answers say differently: kept as it was on file. */
export interface KeptDetail { field: string; label: string; onFile: string; onForm: string }

// The record's columns the answers can fill, the answers' value for each, and how to show it. `ask`:
// filled only when the desk ticks it, having checked the person at the desk (a mobile finds visits on
// /me/; an email gets receipts). `take: false`: never copied one at a time from the record page (a
// birth date changes through the health history, which records the change).
export const FILLABLE: { col: string; label: string; from: (v: PatientFormValues) => string | null; show?: (s: string) => string; ask?: true; take?: false }[] = [
  { col: 'middle_name', label: 'Middle name', from: (v) => v.middle_name },
  { col: 'suffix', label: 'Suffix', from: (v) => v.suffix },
  { col: 'birth_date', label: 'Birth date', from: (v) => v.birth_date, show: (s) => answerText(FIELDS.birth_date, s) ?? s, take: false },
  { col: 'sex', label: 'Sex', from: (v) => v.sex, show: (s) => answerText(FIELDS.sex, s) ?? s },
  { col: 'phone', label: 'Mobile', from: (v) => v.mobile, show: prettyPhone, ask: true },
  { col: 'email', label: 'Email', from: (v) => v.email, ask: true },
  { col: 'address_line', label: 'Address', from: (v) => v.address },
  { col: 'city', label: 'City', from: (v) => v.city },
  { col: 'province', label: 'Province', from: (v) => v.province },
  { col: 'occupation', label: 'Occupation', from: (v) => v.occupation },
  { col: 'emergency_name', label: 'Emergency contact', from: (v) => v.emergency_name },
  { col: 'emergency_relation', label: 'Emergency contact’s relation', from: (v) => v.emergency_relation },
  { col: 'emergency_phone', label: 'Emergency contact’s number', from: (v) => v.emergency_mobile, show: prettyPhone },
  { col: 'guardian_name', label: 'Parent or guardian', from: (v) => v.guardian_name },
  { col: 'guardian_relation', label: 'Parent or guardian’s relation', from: (v) => v.guardian_relation },
  { col: 'guardian_phone', label: 'Parent or guardian’s mobile', from: (v) => v.guardian_mobile, show: prettyPhone },
  { col: 'hmo_name', label: 'HMO', from: (v) => hmoName(v) },
  { col: 'hmo_member_no', label: 'HMO card no.', from: (v) => (v.hmo ? v.hmo_card_no : null) },
];

/** The fields the record page may take from added answers one at a time (useFormDetail): every FILLABLE but the birth date. */
export const TAKEABLE: ReadonlySet<string> = new Set(FILLABLE.filter((x) => x.take !== false).map((x) => x.col));

export const sameText = (a: string, b: string) => a.normalize('NFKC').trim().toLocaleLowerCase('en') === b.normalize('NFKC').trim().toLocaleLowerCase('en');

/** The FILLABLE columns as text, for reading a patient row to compare. */
export const detailCols = () => FILLABLE.map((x) => x.col === 'birth_date' ? `to_char(birth_date, 'YYYY-MM-DD') as birth_date` : `${x.col}::text as ${x.col}`).join(', ');

/** What the answers would do to the record, by the FILLABLE rule. `use`: the asked-for fields the desk ticked. */
export function planFill(p: Record<string, string | null>, v: PatientFormValues, use: ReadonlySet<string>) {
  const fill: Record<string, string> = {};
  const fills: string[] = [];
  const differs: KeptDetail[] = [];
  const proposed: KeptDetail[] = [];
  for (const x of FILLABLE) {
    const want = x.from(v);
    if (!want) continue;
    const have = p[x.col];
    const shown = (s: string) => (x.show ? x.show(s) : s);
    if (have === null || have === '') {
      if (x.ask && !use.has(x.col)) proposed.push({ field: x.col, label: x.label, onFile: '', onForm: shown(want) });
      else { fill[x.col] = want; fills.push(x.label); }
    } else if (!sameText(have, want) && !(x.col === 'phone' && digits10(have) === digits10(want))) {
      differs.push({ field: x.col, label: x.label, onFile: shown(have), onForm: shown(want) });
    }
  }
  return { fill, fills, differs, proposed };
}

/**
 * "Use <what the answers say>" on the record after a form or an intake was
 * added to it: one detail (a TAKEABLE column) written from the stored answers,
 * over what was on file or into an empty field. Names are not among them, nor
 * the birth date. 'same' when the record already says it. Audit patient.update.
 * The caller checked canEditRecords and found the answers (useFormDetail in
 * patient-forms.ts, useIntakeDetail in intake.ts).
 */
export async function useAnswerDetail(tx: Tx, a: { clinicId: string; staffId: string; patientId: string; values: PatientFormValues; field: string }): Promise<'saved' | 'same' | 'gone'> {
  const x = FILLABLE.find((y) => y.col === a.field && TAKEABLE.has(y.col));
  if (!x || !/^[0-9a-f-]{36}$/i.test(a.patientId)) return 'gone';
  const want = x.from(a.values);
  if (!want) return 'gone';
  const p = (await tx.query<{ v: string | null }>(`select ${x.col}::text as v from patient where id = $1 and archived_at is null for update`, [a.patientId])).rows[0];
  if (!p) return 'gone';
  if (p.v !== null && p.v !== '' && sameText(p.v, want)) return 'same';
  await tx.query(`update patient set ${x.col} = $2, updated_at = now() where id = $1`, [a.patientId, want]);
  await audit(tx, a.clinicId, a.staffId, 'patient.update', 'patient', a.patientId);
  return 'saved';
}

export interface FillResult {
  /** The columns written, by name, and their values. */
  fill: Record<string, string>;
  /** Labels of what was empty on the record and is now filled ("Email", "Occupation"). */
  filled: string[];
  /** What the record already had and the answers say otherwise: kept as on file. */
  kept: KeptDetail[];
  /** A mobile or an email the record has none of and the desk did not tick (`use`): not written. */
  proposed: KeptDetail[];
  /** The birth date on the record now (filled, or as it was), for the consent rule. */
  birthOnFile: string | null;
}

/**
 * Fill what is empty on a patient on file from the answers (the FILLABLE
 * rule; `use`: 'phone', 'email' when the desk ticked them). Locks the patient
 * row. Null when there is no such patient here (another clinic's, archived,
 * or made up: row-level security finds nothing). Audit patient.update when
 * something was written.
 */
export async function fillPatientFromAnswers(tx: Tx, a: { clinicId: string; staffId: string; patientId: string; values: PatientFormValues; use?: readonly string[] }): Promise<FillResult | null> {
  // Row-level security: another clinic's patient is simply not found.
  const p = (await tx.query<Record<string, string | null>>(
    `select id, ${detailCols()} from patient where id = $1 and archived_at is null for update`, [a.patientId])).rows[0];
  if (!p) return null;
  const use = new Set((a.use ?? []).filter((c) => FILLABLE.some((x) => x.col === c && x.ask)));
  const { fill, fills: filled, differs: kept, proposed } = planFill(p, a.values, use);
  const cols = Object.keys(fill);
  if (cols.length) {
    await tx.query(
      `update patient set ${cols.map((c, i) => `${c} = $${i + 2}`).join(', ')}, updated_at = now() where id = $1`,
      [a.patientId, ...cols.map((c) => fill[c])]);
    await audit(tx, a.clinicId, a.staffId, 'patient.update', 'patient', a.patientId);
  }
  return { fill, filled, kept, proposed, birthOnFile: fill.birth_date ?? p.birth_date ?? null };
}

// ---------------------------------------------------------------------------
// The health version
// ---------------------------------------------------------------------------
/**
 * What goes into the health version's `answers`: which form or intake it
 * was, and the rest of the answers. The forms' shape is kept exactly as 028
 * wrote it; an intake's page 1 asks no teeth or cards step and no Facebook or
 * civil status, so those are left out.
 */
function historyAnswers(v: PatientFormValues, source: AnswerSource, birthChange: { from: string | null; to: string } | null): Record<string, unknown> {
  const head = { id: source.id, ref: source.ref, version: source.version, [source.kind === 'form' ? 'submitted_at' : 'sent_at']: source.sentAt };
  const rest = source.kind === 'form'
    ? {
      health: stepAnswers(v, 'health'),
      teeth: stepAnswers(v, 'teeth'),
      cards: stepAnswers(v, 'cards'),
      emergency: { name: v.emergency_name, relation: v.emergency_relation, mobile: v.emergency_mobile },
      facebook: v.facebook, civil_status: v.civil_status,
    }
    : {
      health: stepAnswers(v, 'health'),
      cards: { hmo: v.hmo ?? null, hmo_other: v.hmo_other ?? null, hmo_card_no: v.hmo_card_no ?? null },
      emergency: { name: v.emergency_name, relation: v.emergency_relation, mobile: v.emergency_mobile },
    };
  return { [source.kind]: head, ...rest, ...(birthChange ? { birth_date: birthChange } : {}) };
}

export interface HealthKept { allergiesKept: string[]; conditionsKept: string[]; medicationsKept: string[] }

/**
 * Write the health version the answers make (medical_history, answered_by
 * 'patient', recorded_by null, answered_at now, naming its form or intake).
 * `merge`: a patient on file — the lists on the latest version on file, by
 * whoever and whenever, stay unless the answers list them too, and its note
 * carries over; returned as `…Kept`. `birthChange`: a birth date filled in on
 * the record from the answers ({"from": null, "to": …}, health.ts's rule;
 * audit patient.birth_date). Audit health.update.
 */
export async function writeHealthFromAnswers(tx: Tx, a: {
  clinicId: string; staffId: string; patientId: string; values: PatientFormValues; source: AnswerSource; merge: boolean; birthChange?: string | null;
}): Promise<HealthKept> {
  const lists = healthLists(a.values);
  const col = a.source.kind === 'form' ? 'form_id' : 'intake_id';
  const birthChange = a.birthChange ? { from: null, to: a.birthChange } : null;
  if (!a.merge) {
    await tx.query(
      `insert into medical_history (clinic_id, patient_id, answered_at, answered_by, recorded_by, allergies, conditions, medications, note, answers, ${col})
       values ($1, $2, now(), 'patient', null, $3, $4, $5, null, $6, $7)`,
      [a.clinicId, a.patientId, lists.allergies, lists.conditions, lists.medications, JSON.stringify(historyAnswers(a.values, a.source, birthChange)), a.source.id]);
    await audit(tx, a.clinicId, a.staffId, 'health.update', 'patient', a.patientId);
    if (birthChange) await audit(tx, a.clinicId, a.staffId, 'patient.birth_date', 'patient', a.patientId);
    return { allergiesKept: [], conditionsKept: [], medicationsKept: [] };
  }
  // The latest version on file, whoever wrote it and whenever: what it lists stays unless the answers list it too.
  const latest = (await tx.query<HealthAnswers>(
    `select allergies, conditions, medications, note from medical_history where patient_id = $1 order by answered_at desc, id desc limit 1`, [a.patientId])).rows[0] ?? null;
  const low = (s: string) => s.toLocaleLowerCase('en');
  const notIn = (had: string[] | null | undefined, now: string[]) => (had ?? []).filter((x) => !now.some((y) => low(y) === low(x)));
  const allergiesKept = notIn(latest?.allergies, lists.allergies);
  const conditionsKept = notIn(latest?.conditions, lists.conditions);
  const medicationsKept = notIn(latest?.medications, lists.medications);
  await tx.query(
    `insert into medical_history (clinic_id, patient_id, answered_at, answered_by, recorded_by, allergies, conditions, medications, note, answers, ${col})
     values ($1, $2, now(), 'patient', null, $3, $4, $5, $6, $7, $8)`,
    [a.clinicId, a.patientId, [...lists.allergies, ...allergiesKept], [...lists.conditions, ...conditionsKept], [...lists.medications, ...medicationsKept],
      latest?.note ?? null, JSON.stringify(historyAnswers(a.values, a.source, birthChange)), a.source.id]);
  await audit(tx, a.clinicId, a.staffId, 'health.update', 'patient', a.patientId);
  if (birthChange) await audit(tx, a.clinicId, a.staffId, 'patient.birth_date', 'patient', a.patientId);
  return { allergiesKept, conditionsKept, medicationsKept };
}

// ---------------------------------------------------------------------------
// Consents
// ---------------------------------------------------------------------------
export type ConsentOutcome = 'saved' | 'already' | 'minor';

const manilaDay = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

/**
 * One patient_consent row for a version: channel 'form' (a poster's form,
 * form_id) or 'intake' (an intake's page 1, intake_id), given when the
 * answers were sent or agreed, by the name typed or held, as the patient or a
 * parent or guardian, recorded by the person adding it. 'already' when the
 * patient has one for that version, unless this one is a parent's or
 * guardian's and theirs is not: nothing is written.
 */
export async function writeConsentRow(tx: Tx, a: {
  clinicId: string; staffId: string; patientId: string; versionId: string; givenAt: Date; byName: string; as: 'patient' | 'guardian'; source: { kind: 'form' | 'intake'; id: string };
}): Promise<'saved' | 'already'> {
  const had = (await tx.query<{ agreed_as: string | null }>(
    'select agreed_as from patient_consent where patient_id = $1 and version_id = $2', [a.patientId, a.versionId])).rows;
  const addsGuardian = a.as === 'guardian' && !had.some((r) => r.agreed_as === 'guardian');
  if (had.length && !addsGuardian) return 'already';
  const col = a.source.kind === 'form' ? 'form_id' : 'intake_id';
  await tx.query(
    `insert into patient_consent (clinic_id, patient_id, version_id, given_at, channel, given_by_name, recorded_by, agreed_as, ${col})
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [a.clinicId, a.patientId, a.versionId, a.givenAt, a.source.kind, a.byName, a.staffId, a.as, a.source.id]);
  return 'saved';
}

/** Who agreed to the privacy notice on an intake's page 1 (intake.privacy_as, 039). 'none': nobody who could agree was there. */
export type PrivacyAs = 'patient' | 'parent' | 'court_guardian' | 'none';

/**
 * The privacy consent from an intake's page 1, as a patient_consent row
 * (channel 'intake', given when page 1 was agreed, by the name held, as the
 * patient or — a parent or a court-appointed guardian — 'guardian'), recorded
 * by the person adding it. 'none' writes nothing (the desk records a desk
 * consent when a parent comes: recordDeskConsent). 'minor': the birth date on
 * the record makes the patient under 18 on the day it was agreed and the
 * patient agreed: nothing is written. Audit consent.intake when saved.
 */
export async function writePrivacyConsent(tx: Tx, a: {
  clinicId: string; staffId: string; patientId: string; birthOnFile: string | null;
  intake: { id: string; privacyVersion: string | null; privacyAt: Date | null; privacyAs: PrivacyAs | null; privacyByName: string | null };
}): Promise<ConsentOutcome | 'none'> {
  const i = a.intake;
  if (!i.privacyAs || i.privacyAs === 'none' || !i.privacyVersion || !i.privacyAt || !i.privacyByName) return 'none';
  if (i.privacyAs === 'patient' && isMinor(a.birthOnFile, manilaDay(new Date(i.privacyAt)))) return 'minor';
  const out = await writeConsentRow(tx, {
    clinicId: a.clinicId, staffId: a.staffId, patientId: a.patientId, versionId: i.privacyVersion, givenAt: i.privacyAt, byName: i.privacyByName,
    as: i.privacyAs === 'patient' ? 'patient' : 'guardian', source: { kind: 'intake', id: i.id },
  });
  if (out === 'saved') await audit(tx, a.clinicId, a.staffId, 'consent.intake', 'patient', a.patientId);
  return out;
}

/** The day (Manila) a consent was given, for the minor rule. */
export const consentDay = manilaDay;
