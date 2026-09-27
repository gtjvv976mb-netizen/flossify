// The consent a patient signs at a visit with their own finger, on the clinic's tablet (035).
//
// The desk opens /c/<slug>/patients/<id>/sign/<visit>/ on the tablet, ticks what the dentist explained,
// and hands it over; the patient (or a parent or guardian) reads the consent to examination and
// treatment in force (TREATMENT_CONSENT), writes their name and signs in the box. One post writes one
// visit_consent row — insert-only, checked here and again by the database — and an audit line.
//
// The signature is kept as strokes: a list of lines, each a list of [x, y] points in a SIG_W × SIG_H box,
// whole numbers only. readStrokes() checks a posted one (and one read back) before anything draws it;
// strokesPath() turns it into an SVG path, so the record shows the signature as it was drawn, at any size.
import type { Tx } from './db';
import { canEditRecords, isMinor, manilaToday, oneLine } from './health';
import { TREATMENT_CONSENT } from './patient-forms-def';

export const SIG_W = 1000;
export const SIG_H = 400;
const MAX_STROKES = 80;
const MAX_POINTS = 6000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type Strokes = [number, number][][];

/** A signature as posted or stored, checked: null when it is not one, or too little to be one. */
export function readStrokes(raw: unknown): Strokes | null {
  let v: unknown = raw;
  if (typeof raw === 'string') {
    if (raw.length > 120_000) return null;
    try { v = JSON.parse(raw); } catch { return null; }
  }
  if (!Array.isArray(v) || v.length < 1 || v.length > MAX_STROKES) return null;
  const out: Strokes = [];
  let points = 0;
  let ink = 0;
  for (const s of v) {
    if (!Array.isArray(s) || s.length < 1) return null;
    const line: [number, number][] = [];
    for (const p of s) {
      if (!Array.isArray(p) || p.length !== 2) return null;
      const [x, y] = p;
      if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x > SIG_W || y > SIG_H) return null;
      const last = line[line.length - 1];
      if (last) ink += Math.hypot(x - last[0], y - last[1]);
      line.push([x, y]);
      if (++points > MAX_POINTS) return null;
    }
    out.push(line);
  }
  // A tap or a stray line is not a signature.
  return ink >= 120 ? out : null;
}

/** The strokes as one SVG path ("M x y L x y …"); a single point is drawn as a dot. */
export function strokesPath(strokes: Strokes): string {
  return strokes.map((s) => (s.length === 1 ? `M${s[0][0]} ${s[0][1]}l0.1 0` : `M${s[0][0]} ${s[0][1]}` + s.slice(1).map(([x, y]) => `L${x} ${y}`).join(''))).join('');
}

export interface TreatmentConsent { id: string; title: string; points: readonly { head: string; body: string }[]; tick: string }

/** The consent to examination and treatment in force (Manila's today), with its words; null when none has words. */
export async function treatmentInForce(tx: Tx): Promise<TreatmentConsent | null> {
  const row = (await tx.query<{ id: string }>(
    `select id from consent_version where kind = 'treatment' and effective_from <= $1::date order by effective_from desc, id desc limit 1`, [manilaToday()])).rows[0];
  const words = row ? TREATMENT_CONSENT[row.id] : undefined;
  return row && words ? { id: row.id, ...words } : null;
}

export interface VisitConsent {
  id: string; visitId: string; versionId: string; title: string; treatment: string; dentist: string | null;
  signedBy: string; signedAs: 'patient' | 'guardian'; relation: string | null; strokes: Strokes | null; recordedBy: string | null; at: Date;
}

/** Every consent this patient signed at a visit, newest first. */
export async function loadVisitConsents(tx: Tx, patientId: string): Promise<VisitConsent[]> {
  const { rows } = await tx.query(
    `select c.id, c.appointment_id, c.version_id, v.title, c.treatment, d.full_name as dentist, c.signed_by_name, c.signed_as, c.relation,
            c.strokes, r.full_name as recorded_by, c.signed_at
       from visit_consent c join consent_version v on v.id = c.version_id
       left join staff d on d.id = c.dentist_id left join staff r on r.id = c.recorded_by
      where c.patient_id = $1 order by c.signed_at desc limit 300`, [patientId]);
  return rows.map((r) => ({
    id: r.id, visitId: r.appointment_id, versionId: r.version_id, title: TREATMENT_CONSENT[r.version_id]?.title ?? r.title, treatment: r.treatment,
    dentist: r.dentist, signedBy: r.signed_by_name, signedAs: r.signed_as === 'guardian' ? 'guardian' : 'patient', relation: r.relation,
    strokes: readStrokes(r.strokes), recordedBy: r.recorded_by, at: r.signed_at,
  }));
}

export interface SignIn {
  version: string; items: string[]; other: string; dentistId: string; signedAs: string; name: string; relation: string; strokes: string; agree: boolean;
}

export function readSignForm(form: FormData): SignIn {
  return {
    version: String(form.get('version') ?? ''),
    items: form.getAll('item').map((v) => String(v)).filter((v) => UUID.test(v)).slice(0, 40),
    other: String(form.get('other') ?? '').replace(/\r\n?/g, '\n').trim().slice(0, 601),
    dentistId: String(form.get('dentist') ?? ''),
    signedAs: String(form.get('signed_as') ?? ''),
    name: oneLine(form.get('name')).slice(0, 121),
    relation: oneLine(form.get('relation')).slice(0, 61),
    strokes: String(form.get('strokes') ?? ''),
    agree: form.get('agree') === 'yes',
  };
}

export type SignOutcome = { ok: true; id: string } | { ok: false; problem: string } | 'none';

/** What a plan line reads as on the consent: "Tooth-coloured filling · tooth 36 MO". */
export const planLine = (i: { name: string; fdi: number | null; surface: string | null }) =>
  i.fdi ? `${i.name} · tooth ${i.fdi}${i.surface ? ` ${i.surface}` : ''}` : i.name;

/**
 * Write one signed consent for a visit. The visit must be this patient's and still going ahead (not
 * cancelled or missed); the person at the desk may edit records; the words signed are the ones in force.
 */
export async function signVisit(tx: Tx, c: { clinicId: string; staffId: string; patientId: string; visitId: string }, s: SignIn): Promise<SignOutcome> {
  const fail = (problem: string): SignOutcome => ({ ok: false, problem });
  const p = (await tx.query<{ birth: string | null }>(
    `select to_char(birth_date, 'YYYY-MM-DD') as birth from patient where id = $1 and archived_at is null`, [c.patientId])).rows[0];
  if (!p || !UUID.test(c.visitId)) return 'none';
  const visit = (await tx.query<{ status: string; dentist_id: string | null }>(
    `select status, dentist_id from appointment where id = $1 and patient_id = $2 for update`, [c.visitId, c.patientId])).rows[0];
  if (!visit) return 'none';
  if (!(await canEditRecords(tx, c.staffId, c.clinicId))) return fail('Your role cannot change records at this branch. Ask the owner.');
  if (visit.status === 'cancelled' || visit.status === 'no_show') return fail('This visit was cancelled or missed. A consent is signed for a visit that is going ahead.');
  const words = await treatmentInForce(tx);
  if (!words) return fail('There is no consent to treatment in force to sign. Ask Flossify.');
  if (s.version !== words.id) return fail('The consent’s words changed while this page was open. Read the new words, then sign again.');

  // What was explained: the plan lines ticked (this patient's, still open), then anything typed.
  const ticked = s.items.length ? (await tx.query<{ id: string; name: string; fdi: number | null; surface: string | null }>(
    `select id, name, fdi, surface from treatment_plan_item where patient_id = $1 and id = any($2::uuid[]) and status in ('planned', 'accepted') order by phase, created_at`,
    [c.patientId, s.items])).rows : [];
  if (s.other.length > 600) return fail('Keep what was explained to 600 characters.');
  const treatment = [...ticked.map(planLine), s.other].filter(Boolean).join('\n');
  if (!treatment) return fail('Tick the treatment the dentist explained, or write it in.');
  if (treatment.length > 600) return fail('That is more treatment than one consent holds. Tick fewer lines, or sign a second consent for the rest.');

  let dentistId: string | null = null;
  if (s.dentistId) {
    const d = UUID.test(s.dentistId) ? (await tx.query(
      `select s.id from staff s join staff_access a on a.staff_id = s.id and a.clinic_id = $2
        where s.id = $1 and s.disabled_at is null and s.role in ('owner', 'dentist', 'associate')`, [s.dentistId, c.clinicId])).rows[0] : undefined;
    if (!d) return fail('Choose the dentist who explained the treatment from the list.');
    dentistId = d.id;
  }

  const signedAs = s.signedAs === 'patient' || s.signedAs === 'guardian' ? s.signedAs : null;
  if (!signedAs) return fail('Say who is signing: the patient, or a parent or guardian.');
  if (signedAs === 'patient' && isMinor(p.birth)) return fail('The patient is under 18 by the birth date on file, so a parent or guardian signs.');
  if (!s.name) return fail(signedAs === 'guardian' ? 'Write the parent’s or guardian’s full name.' : 'Write your full name.');
  if (s.name.length > 120) return fail('Keep the name to 120 characters.');
  if (signedAs === 'guardian' && !s.relation) return fail('Write how the person signing is related to the patient, like “Mother”.');
  if (s.relation.length > 60) return fail('Keep the relation to 60 characters.');
  if (!s.agree) return fail('Tick the box to say you agree.');
  const strokes = readStrokes(s.strokes);
  if (!strokes) return fail('Sign in the box with your finger, then press Sign.');

  const { rows: [row] } = await tx.query<{ id: string }>(
    `insert into visit_consent (clinic_id, patient_id, appointment_id, version_id, treatment, dentist_id, signed_by_name, signed_as, relation, strokes, recorded_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11) returning id`,
    [c.clinicId, c.patientId, c.visitId, words.id, treatment, dentistId ?? visit.dentist_id, s.name, signedAs, signedAs === 'guardian' ? s.relation : null, JSON.stringify(strokes), c.staffId]);
  await tx.query(`insert into audit_log (clinic_id, staff_id, action, entity, entity_id) values ($1, $2, 'consent.sign', 'visit_consent', $3)`, [c.clinicId, c.staffId, row.id]);
  return { ok: true, id: row.id };
}
