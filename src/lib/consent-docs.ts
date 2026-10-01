// The consent forms on the record (039): what the Consent section lists, one
// form's page and its print, and the record's own writes — the named
// dentist's "I explained this" (attestDocument), a staff member's
// confirmation of a signing, a withdrawal, a capacity note, the paper form and
// its signing, removing a form, and going ahead after a refusal (phase 4 asks
// first with overrideConsent and consentGaps). The desk's intake is intake.ts;
// the words are consent-library.ts; the seal and the chain consent-seal.ts.
//
// Every write follows intake.ts's steps: the page checks csrfOk and the
// staff's save limit, then this runs in withClinic(): canEditRecords first,
// the form locked `for update`, and anything refused THROWN (Refused), so the
// page catches it outside the transaction and nothing half-done stays. The
// database checks every rule again (039's triggers).
//
// Nothing here logs an answer, a signature or a snapshot.

import type { Tx } from './db';
import { Refused } from './refused';
import { canEditRecords, manilaToday, ageOn, isMinor, day as manilaDayWords } from './health';
import { isProduction } from './env';
import {
  TEMPLATES, langsFor, renderDocument, readClinicPart, readPatientPart, EXPLAINED_LANGS,
  type Template, type Fields, type Rendered, type RenderCtx, type RawPart, type Signer, type Decision, type PatientPart,
} from './consent-library';
import { snapshotText, verifySigning, shortSeal } from './consent-seal';
import { audit } from './patient-add';
import { readStrokes, type Strokes } from './visit-consent';

type Q = Pick<Tx, 'query'>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (s: unknown): s is string => typeof s === 'string' && UUID.test(s);
const clean = (s: unknown) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().normalize('NFC');

export const NOT_ALLOWED = 'Your account cannot change patients’ records at this branch. Ask the owner.';

// ---------------------------------------------------------------------------
// Drawing a form
// ---------------------------------------------------------------------------
export interface ClinicFace { name: string; address: string | null; phone: string | null }

export async function clinicFace(q: Q, clinicId: string): Promise<ClinicFace> {
  const c = (await q.query<{ name: string; address_line: string | null; barangay: string | null; city: string | null; province: string | null; phone: string | null }>(
    'select name, address_line, barangay, city, province, phone from clinic where id = $1', [clinicId])).rows[0];
  // A part already said by an earlier one ("Baguio City" in the street line) is not said again.
  const parts = [c?.address_line, c?.barangay, c?.city, c?.province].map((x) => (x ?? '').trim()).filter(Boolean);
  const address = parts.filter((part, i) => !parts.slice(0, i).some((prev) => prev.toLowerCase().includes(part.toLowerCase()))).join(', ');
  return { name: c?.name ?? '', address: address || null, phone: c?.phone ?? null };
}

/** The language planned on a form: English, Filipino or the one typed. */
export const plannedLanguage = (d: { explainedIn: string | null; explainedOther: string | null }): string | null =>
  d.explainedIn === 'en' ? 'English' : d.explainedIn === 'fil' ? 'Filipino' : d.explainedIn === 'other' ? d.explainedOther : null;

export interface Attested { at: Date; lang: string; interpreter: string | null; assent: string | null; dentistName: string; dentistPrc: string }

/** A dentist's name without "Dr." or "Dra.": the forms' words say "Dr {dentist}" themselves. */
export const bareName = (n: string) => n.replace(/^(Dr|Dra|Doc)\.?\s+/i, '').trim();

/** The render context for a form: the clinic, the patient, its dentist and their confirmation, the languages this server shows. */
export function contextFor(t: Template, a: {
  clinic: ClinicFace; patientName: string; birth: string | null; minor: boolean | null;
  dentist: { name: string; prc: string | null } | null; attested: Attested | null; planned: string | null; date?: string;
}): RenderCtx {
  return {
    langs: langsFor(t, isProduction()),
    minor: a.minor,
    confirmed: !!a.attested,
    clinic: a.clinic,
    patient: { name: a.patientName, birth: a.birth },
    dentist: t.attest && a.dentist ? { name: bareName(a.attested?.dentistName ?? a.dentist.name), prc: a.attested?.dentistPrc ?? a.dentist.prc } : null,
    attested: a.attested ? { at: new Date(a.attested.at).toISOString(), lang: a.attested.lang, interpreter: a.attested.interpreter, assent: a.attested.assent } : null,
    language: a.attested?.lang ?? a.planned,
    date: a.date ?? manilaToday(),
  };
}

/** "Born 12 Mar 2014 · 12 years old": the For box's line. */
export function bornLine(birth: string | null, today = manilaToday()): string | null {
  if (!birth) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birth);
  if (!m) return null;
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const age = ageOn(birth, today);
  return `Born ${+m[3]} ${MONTHS[+m[2] - 1]} ${m[1]}${age !== null ? ` · ${age === 1 ? '1 year' : `${age} years`} old` : ''}`;
}

/** Who signed, in words: "Maria dela Cruz, mother". */
export const signerWords = (s: { name: string; as: string; relation: string | null; method?: string | null }) =>
  s.as === 'guardian' ? `${s.name}${s.relation ? `, ${s.relation}` : ''}` : s.method === 'mark' ? `${s.name}, by mark` : s.name;

// ---------------------------------------------------------------------------
// The record: the Consent section's list, one form
// ---------------------------------------------------------------------------
export type DocState = 'cancelled' | 'to_sign' | 'to_confirm' | 'agreed' | 'refused' | 'no_photos' | 'withdrawn';
export const STATE_WORDS: Record<DocState, { words: string; tone: 'success' | 'warn' | 'alert' | 'info' | 'neutral' }> = {
  agreed: { words: 'Signed', tone: 'success' },
  to_sign: { words: 'To sign', tone: 'warn' },
  to_confirm: { words: 'To confirm', tone: 'warn' },
  refused: { words: 'Did not agree', tone: 'alert' },
  no_photos: { words: 'No photos', tone: 'neutral' },
  withdrawn: { words: 'Withdrawn', tone: 'alert' },
  cancelled: { words: 'Removed', tone: 'neutral' },
};

export interface RecordSigning {
  id: string; decision: 'agreed' | 'refused'; channel: 'phone' | 'tablet' | 'desk' | 'paper'; method: 'sign' | 'mark';
  signedByName: string; signedAs: 'patient' | 'guardian'; relation: string | null; authority: string | null; authorityGround: string | null; authorityNote: string | null;
  explainedIn: string | null; readBy: string | null; strokes: Strokes | null; signedOn: string | null; attachmentId: string | null;
  needsConfirm: 'witness' | 'authority' | null; linkByName: string | null; openedAt: Date | null; decidedAt: Date; signedAt: Date;
  recordedByName: string | null; snapshot: string; sealSha256: string; snapshotSha256: string; chainSeq: number | null;
  confirmation: { kind: string; staffName: string; at: Date; attachmentId: string | null; note: string | null } | null;
  withdrawal: { toldBy: string; how: string; note: string | null; byName: string; at: Date } | null;
}
/** Treatment went ahead although this form was not agreed (consent_override, 039; phase 4.4 asks first): where, the form's state then, why, who, when. */
export interface RecordOverride { id: string; context: OverrideContext; stateThen: string; reason: string; staffName: string; at: Date }
export interface RecordDoc {
  id: string; ref: string; versionId: string; code: string; title: string; template: Template | null; state: DocState; fields: Fields;
  patientId: string | null; intakeId: string | null; intakeRef: string | null; intakeStatus: string | null; appointmentId: string | null;
  dentistId: string | null; dentistName: string | null; dentistPrc: string | null; explainedIn: string | null; explainedOther: string | null;
  preparedAt: Date; preparedByName: string; paperPrintedAt: Date | null; cancelledAt: Date | null; cancelWhy: string | null; inForce: boolean; rev: number;
  attestation: Attested | null;
  latest: RecordSigning | null;
  signings: RecordSigning[];
  /** Every time treatment went ahead without this form agreed, newest first. */
  overrides: RecordOverride[];
}

const DOC_SELECT = `
  select d.id, d.ref, d.version_id, coalesce(v.code, 'general') as code, v.title, consent_document_state(d.id) as state, d.fields, d.patient_id, d.intake_id,
         i.ref as intake_ref, i.status as intake_status, d.appointment_id, d.dentist_id, d.dentist_name, d.dentist_prc, d.explained_in, d.explained_other,
         d.prepared_at, ps.full_name as prepared_by_name, d.paper_printed_at, d.cancelled_at, d.cancel_why, consent_in_force(d.version_id) as in_force, d.rev,
         a.attested_at, a.explained_in as a_lang, a.interpreter as a_interpreter, a.assent as a_assent, a.dentist_name as a_name, a.dentist_prc as a_prc
    from consent_document d
    join consent_version v on v.id = d.version_id
    join staff ps on ps.id = d.prepared_by
    left join intake i on i.id = d.intake_id
    left join consent_attestation a on a.document_id = d.id`;

function docOf(r: Record<string, any>, signings: RecordSigning[], overrides: RecordOverride[] = []): RecordDoc {
  return {
    id: r.id, ref: r.ref, versionId: r.version_id, code: r.code, title: TEMPLATES[r.version_id]?.title.en ?? r.title, template: TEMPLATES[r.version_id] ?? null,
    state: r.state, fields: r.fields ?? {}, patientId: r.patient_id, intakeId: r.intake_id, intakeRef: r.intake_ref, intakeStatus: r.intake_status,
    appointmentId: r.appointment_id, dentistId: r.dentist_id, dentistName: r.dentist_name, dentistPrc: r.dentist_prc, explainedIn: r.explained_in,
    explainedOther: r.explained_other, preparedAt: r.prepared_at, preparedByName: r.prepared_by_name, paperPrintedAt: r.paper_printed_at,
    cancelledAt: r.cancelled_at, cancelWhy: r.cancel_why, inForce: r.in_force, rev: r.rev,
    attestation: r.attested_at ? { at: r.attested_at, lang: r.a_lang, interpreter: r.a_interpreter, assent: r.a_assent, dentistName: r.a_name, dentistPrc: r.a_prc } : null,
    latest: signings[0] ?? null,
    signings,
    overrides,
  };
}

async function overridesOf(q: Q, docIds: string[]): Promise<Map<string, RecordOverride[]>> {
  const out = new Map<string, RecordOverride[]>();
  if (!docIds.length) return out;
  const rows = (await q.query<{ id: string; document_id: string; context: OverrideContext; state_then: string; reason: string; staff_name: string; at: Date }>(
    `select o.id, o.document_id, o.context, o.state_then, o.reason, s.full_name as staff_name, o.at
       from consent_override o join staff s on s.id = o.staff_id where o.document_id = any($1::uuid[]) order by o.at desc, o.id desc`, [docIds])).rows;
  for (const r of rows) {
    const list = out.get(r.document_id) ?? [];
    list.push({ id: r.id, context: r.context, stateThen: r.state_then, reason: r.reason, staffName: r.staff_name, at: r.at });
    out.set(r.document_id, list);
  }
  return out;
}

async function signingsOf(q: Q, docIds: string[]): Promise<Map<string, RecordSigning[]>> {
  const out = new Map<string, RecordSigning[]>();
  if (!docIds.length) return out;
  const rows = (await q.query<Record<string, any>>(
    `select s.*, to_char(s.signed_on, 'YYYY-MM-DD') as signed_on_ymd, lb.full_name as link_by_name, rb.full_name as recorded_by_name, ch.seq as chain_seq,
            c.kind as c_kind, cs.full_name as c_staff, c.confirmed_at as c_at, c.attachment_id as c_file, c.note as c_note,
            w.told_by_name as w_told, w.how as w_how, w.note as w_note, ws.full_name as w_by, w.withdrawn_at as w_at
       from consent_signing s
       left join staff lb on lb.id = s.link_by left join staff rb on rb.id = s.recorded_by
       left join consent_chain ch on ch.signing_id = s.id
       left join consent_confirmation c on c.signing_id = s.id left join staff cs on cs.id = c.staff_id
       left join consent_withdrawal w on w.signing_id = s.id left join staff ws on ws.id = w.recorded_by
      where s.document_id = any($1::uuid[]) order by s.signed_at desc, s.id desc`, [docIds])).rows;
  for (const r of rows) {
    const list = out.get(r.document_id) ?? [];
    list.push({
      id: r.id, decision: r.decision, channel: r.channel, method: r.method, signedByName: r.signed_by_name, signedAs: r.signed_as, relation: r.relation,
      authority: r.authority, authorityGround: r.authority_ground, authorityNote: r.authority_note, explainedIn: r.explained_in, readBy: r.read_by,
      strokes: r.strokes ? readStrokes(r.strokes) : null, signedOn: r.signed_on_ymd ?? null,
      attachmentId: r.attachment_id, needsConfirm: r.needs_confirm, linkByName: r.link_by_name, openedAt: r.opened_at, decidedAt: r.decided_at,
      signedAt: r.signed_at, recordedByName: r.recorded_by_name, snapshot: r.snapshot, sealSha256: r.seal_sha256, snapshotSha256: r.snapshot_sha256,
      chainSeq: r.chain_seq === null ? null : Number(r.chain_seq),
      confirmation: r.c_kind ? { kind: r.c_kind, staffName: r.c_staff, at: r.c_at, attachmentId: r.c_file, note: r.c_note } : null,
      withdrawal: r.w_told ? { toldBy: r.w_told, how: r.w_how, note: r.w_note, byName: r.w_by, at: r.w_at } : null,
    });
    out.set(r.document_id, list);
  }
  return out;
}

/** A patient's consent forms, newest first (removed ones left out), with their latest signing. */
export async function loadConsentDocuments(q: Q, patientId: string): Promise<RecordDoc[]> {
  if (!isUuid(patientId)) return [];
  const rows = (await q.query<Record<string, any>>(`${DOC_SELECT} where d.patient_id = $1 and d.cancelled_at is null order by d.prepared_at desc`, [patientId])).rows;
  const ids = rows.map((r) => r.id);
  const [s, o] = await Promise.all([signingsOf(q, ids), overridesOf(q, ids)]);
  return rows.map((r) => docOf(r, s.get(r.id) ?? [], o.get(r.id) ?? []));
}

/** One form, with every signing (the latest counts; every one is kept). */
export async function loadConsentDocument(q: Q, docId: string): Promise<RecordDoc | null> {
  if (!isUuid(docId)) return null;
  const r = (await q.query<Record<string, any>>(`${DOC_SELECT} where d.id = $1`, [docId])).rows[0];
  if (!r) return null;
  const [s, o] = await Promise.all([signingsOf(q, [r.id]), overridesOf(q, [r.id])]);
  return docOf(r, s.get(r.id) ?? [], o.get(r.id) ?? []);
}

/** The stored snapshot, parsed (a Rendered-shaped document), or null when it does not parse. */
export function snapshotDoc(s: Pick<RecordSigning, 'snapshot'>): (Rendered & { ref?: string; document?: string }) | null {
  try { return JSON.parse(s.snapshot); } catch { return null; }
}

/** Is a stored signing unchanged: its snapshot's hash, its seal, its chain link (null while it is not on a record). */
export async function signingCheck(q: Q, s: RecordSigning) {
  const v = await verifySigning(q, s.id);
  return v ? { ...v, ok: v.snapshotOk && v.sealOk && v.chainOk !== false, short: shortSeal(s.sealSha256) } : null;
}

// ---------------------------------------------------------------------------
// The named dentist: Explain and confirm (§1.10)
// ---------------------------------------------------------------------------
export const ASSENT: readonly { value: 'agreed' | 'objected' | 'not_asked'; label: string }[] = [
  { value: 'agreed', label: 'Agreed' }, { value: 'objected', label: 'Objected' }, { value: 'not_asked', label: 'Not asked' },
];
export const INTERPRETER_MAX = 120;

/** May this person explain and confirm this form: its named dentist, treating here, with a PRC licence. */
export async function mayAttest(q: Q, clinicId: string, staffId: string, dentistId: string | null): Promise<boolean> {
  if (!dentistId || dentistId !== staffId) return false;
  const r = (await q.query<{ prc: string | null }>('select prc from treating_dentist($1, $2)', [staffId, clinicId])).rows[0];
  return !!r?.prc;
}

/**
 * The named dentist confirms the clinical part and records "I explained
 * this": the dentist's fields read with the dentist's own rules (required
 * ones required), saved, and frozen by the attestation (the language actually
 * used, an interpreter, and for a patient aged 7 to 17 — or whose age is not
 * known yet and the desk did not say 18 or over — what they said). Only
 * the form's own dentist, treating here with a PRC licence; the form open,
 * unsigned and not printed. Audit consent.attest.
 */
export async function attestDocument(tx: Tx, a: {
  clinicId: string; staffId: string; docId: string; rev: number; raw: RawPart; lang: string | null; langOther: string | null; interpreter: string | null; assent: string | null;
}): Promise<void> {
  if (!(await canEditRecords(tx, a.staffId, a.clinicId))) throw new Refused(NOT_ALLOWED);
  const docId = isUuid(a.docId) ? a.docId : null;
  // The intake first, then its live link, then the form: the order the patient's pages and the desk's writes
  // take (intake_gate, lockIntake), so two of them never wait on each other. The form's intake is read without a
  // lock, and read again once the form is locked: if it moved meanwhile, the page was stale.
  const intakeBefore = (await tx.query<{ intake_id: string | null }>('select intake_id from consent_document where id = $1', [docId])).rows[0]?.intake_id ?? null;
  if (intakeBefore) {
    await tx.query('select id from intake where id = $1 for update', [intakeBefore]);
    await tx.query('select token from intake_link where intake_id = $1 and retired_at is null for update', [intakeBefore]);
  }
  const d = (await tx.query<{ id: string; version_id: string; dentist_id: string | null; dentist_name: string | null; rev: number; fields: Fields; cancelled: boolean;
    printed: boolean; signed: boolean; attested: boolean; patient_id: string | null; intake_id: string | null; intake_open: boolean | null; desk_minor: string | null }>(
    `select d.id, d.version_id, d.dentist_id, d.dentist_name, d.rev, d.fields, d.cancelled_at is not null as cancelled, d.paper_printed_at is not null as printed,
            exists (select 1 from consent_signing s where s.document_id = d.id) as signed,
            exists (select 1 from consent_attestation x where x.document_id = d.id) as attested, d.patient_id, d.intake_id,
            (select i.status in ('preparing', 'out') from intake i where i.id = d.intake_id) as intake_open,
            (select i.desk_minor from intake i where i.id = d.intake_id) as desk_minor
       from consent_document d where d.id = $1 for update of d`, [docId])).rows[0];
  if (d && d.intake_id !== intakeBefore) throw new Refused('The form changed while you were reading it. Here it is as it is now.');
  if (!d || d.cancelled) throw new Refused('That form was removed.');
  const t = TEMPLATES[d.version_id];
  if (!t || !t.attest) throw new Refused('This form is not explained and confirmed by a dentist.');
  if (d.attested) throw new Refused('This form was explained and confirmed already.');
  if (d.signed || d.printed) throw new Refused('This form was signed or printed for paper already: its details are fixed.');
  if (!(await mayAttest(tx, a.clinicId, a.staffId, d.dentist_id))) {
    throw new Refused(`Only ${d.dentist_name ?? 'the dentist named on the form'} can confirm this. To change who explains, remove the form and prepare it again.`);
  }
  if (d.rev !== a.rev) throw new Refused('The form changed while you were reading it. Here it is as it is now.');
  // The patient's age for the assent: the record's birth date, or the intake's page 1.
  const birth = (await tx.query<{ b: string | null }>(`select to_char(consent_birth_date($1, $2), 'YYYY-MM-DD') as b`, [d.patient_id, d.intake_id])).rows[0]?.b ?? null;
  const age = birth ? ageOn(birth, manilaToday()) : null;
  const minor = birth ? isMinor(birth) : null;
  // What the patient said is asked of a patient aged 7 to 17, and while the age is not known yet unless the
  // desk said they are 18 or over (ExplainForm asks the same; consent_attestation_check, 043, holds it).
  const askAssent = age !== null ? age >= 7 && age <= 17 : d.desk_minor !== 'no';
  const read = readClinicPart(t, a.raw, { minor, dentist: true });
  const problems: string[] = [];
  for (const [name, text] of Object.entries(read.errors)) {
    const label = t.clinicFields.find((f) => f.name === name)?.label;
    problems.push(label ? `${label}: ${text}` : text);
  }
  const lang = a.lang === 'other' ? clean(a.langOther) : EXPLAINED_LANGS.some((c) => c.value === a.lang && c.value !== 'other') ? a.lang! : '';
  if (!lang) problems.push('Say which language you explained it in.');
  else if (lang.length > 40) problems.push('Keep the language under 40 characters.');
  const interpreter = clean(a.interpreter) || null;
  if (interpreter && interpreter.length > INTERPRETER_MAX) problems.push(`Keep the interpreter’s name under ${INTERPRETER_MAX} characters.`);
  const assent = ASSENT.find((x) => x.value === a.assent)?.value ?? null;
  if (askAssent && !assent) problems.push('Say what the patient said: agreed, objected, or not asked.');
  if (problems.length) throw new Refused(problems);
  await tx.query('update consent_document set fields = $2 where id = $1', [d.id, JSON.stringify(read.fields)]);
  await tx.query(
    `insert into consent_attestation (clinic_id, document_id, dentist_id, dentist_name, dentist_prc, explained_in, interpreter, assent, fields_sha256)
     values ($1, $2, $3, '-', '-', $4, $5, $6, repeat('0', 64))`,
    [a.clinicId, d.id, a.staffId, lang, interpreter, askAssent ? assent : null]);
  if (d.intake_id && d.intake_open) {
    await tx.query(`insert into intake_event (clinic_id, intake_id, kind, document_id, staff_id, detail) values ($1, $2, 'confirm', $3, $4, 'explained')`,
      [a.clinicId, d.intake_id, d.id, a.staffId]);
  }
  await audit(tx, a.clinicId, a.staffId, 'consent.attest', 'consent_document', d.id);
}

// ---------------------------------------------------------------------------
// Confirmations, withdrawals, capacity
// ---------------------------------------------------------------------------
/**
 * A staff member confirms a signing that needs it, under their own sign-in:
 * "I saw {name} make their mark" (a witness), or "I checked {the court
 * order | the ground | the parent's letter}", naming the patient's file.
 * Never the person who signed. Audit consent.confirm.
 */
export async function confirmSigning(tx: Tx, a: { clinicId: string; staffId: string; signingId: string; attachmentId: string | null; note: string | null }): Promise<void> {
  if (!(await canEditRecords(tx, a.staffId, a.clinicId))) throw new Refused(NOT_ALLOWED);
  const s = (await tx.query<{ id: string; needs_confirm: string | null; signed_by_name: string; recorded_by: string | null; patient_id: string | null; confirmed: boolean }>(
    `select s.id, s.needs_confirm, s.signed_by_name, s.recorded_by, d.patient_id,
            exists (select 1 from consent_confirmation c where c.signing_id = s.id) as confirmed
       from consent_signing s join consent_document d on d.id = s.document_id where s.id = $1 for update of d`, [isUuid(a.signingId) ? a.signingId : null])).rows[0];
  if (!s) throw new Refused('That signing is not here.');
  if (!s.needs_confirm) throw new Refused('This signing needs no confirmation.');
  if (s.confirmed) throw new Refused('This signing was confirmed already.');
  const me = (await tx.query<{ full_name: string }>('select full_name from staff where id = $1', [a.staffId])).rows[0]?.full_name ?? '';
  if (a.staffId === s.recorded_by || me.trim().toLowerCase() === s.signed_by_name.trim().toLowerCase()) throw new Refused('The person who signed does not confirm it. Ask a colleague.');
  const note = clean(a.note) || null;
  if (note && note.length > 200) throw new Refused('Keep the note under 200 characters.');
  let file: string | null = null;
  if (s.needs_confirm === 'authority') {
    if (!isUuid(a.attachmentId)) throw new Refused('Choose the file that shows it: the court order, the papers for the ground, or the parent’s letter. Upload it in Files first.');
    const ok = (await tx.query('select 1 from attachment where id = $1 and patient_id = $2 and removed_at is null', [a.attachmentId, s.patient_id])).rowCount;
    if (!ok) throw new Refused('That file is not in this patient’s Files.');
    file = a.attachmentId;
  }
  await tx.query('insert into consent_confirmation (clinic_id, signing_id, kind, staff_id, attachment_id, note) values ($1, $2, $3, $4, $5, $6)',
    [a.clinicId, s.id, s.needs_confirm, a.staffId, file, note]);
  await audit(tx, a.clinicId, a.staffId, 'consent.confirm', 'consent_signing', s.id);
}

export const WITHDRAW_HOW: readonly { value: 'in_person' | 'phone' | 'text' | 'letter' | 'other'; label: string }[] = [
  { value: 'in_person', label: 'In person' }, { value: 'phone', label: 'By phone' }, { value: 'text', label: 'By text' },
  { value: 'letter', label: 'By letter' }, { value: 'other', label: 'Another way' },
];

/** The patient takes their agreement back: who told us, how, and a note. Audit consent.withdraw. */
export async function withdrawConsent(tx: Tx, a: { clinicId: string; staffId: string; docId: string; toldBy: string; how: string; note: string | null }): Promise<void> {
  if (!(await canEditRecords(tx, a.staffId, a.clinicId))) throw new Refused(NOT_ALLOWED);
  const d = (await tx.query<{ id: string; state: string; latest: string | null }>(
    `select d.id, consent_document_state(d.id) as state,
            (select s.id from consent_signing s where s.document_id = d.id order by s.signed_at desc, s.id desc limit 1) as latest
       from consent_document d where d.id = $1 for update`, [isUuid(a.docId) ? a.docId : null])).rows[0];
  if (!d || !d.latest || !['agreed', 'to_confirm'].includes(d.state)) throw new Refused('Only a form the patient agreed to can be withdrawn.');
  const told = clean(a.toldBy), note = clean(a.note) || null;
  const problems: string[] = [];
  if (!told) problems.push('Write who told the clinic.');
  else if (told.length > 120) problems.push('Keep the name under 120 characters.');
  if (!WITHDRAW_HOW.some((h) => h.value === a.how)) problems.push('Say how they told the clinic.');
  if (note && note.length > 200) problems.push('Keep the note under 200 characters.');
  if (problems.length) throw new Refused(problems);
  await tx.query('insert into consent_withdrawal (clinic_id, signing_id, told_by_name, how, note, recorded_by) values ($1, $2, $3, $4, $5, $6)',
    [a.clinicId, d.latest, told, a.how, note, a.staffId]);
  await audit(tx, a.clinicId, a.staffId, 'consent.withdraw', 'consent_document', d.id);
}

export const CAPACITY_MAX = 300;
/** A treating dentist records that an adult patient cannot decide now: for 30 days a representative may sign on a clinic device. Audit consent.capacity. */
export async function recordCapacity(tx: Tx, a: { clinicId: string; staffId: string; patientId: string; reason: string }): Promise<void> {
  if (!(await canEditRecords(tx, a.staffId, a.clinicId))) throw new Refused(NOT_ALLOWED);
  const who = (await tx.query<{ prc: string | null }>('select prc from treating_dentist($1, $2)', [a.staffId, a.clinicId])).rows[0];
  if (!who?.prc) throw new Refused('Only a treating dentist here with a PRC licence on file records this.');
  const reason = clean(a.reason);
  if (!reason) throw new Refused('Write why the patient cannot decide now.');
  if (reason.length > CAPACITY_MAX) throw new Refused(`Keep it under ${CAPACITY_MAX} characters.`);
  const p = (await tx.query<{ birth: string | null }>(`select to_char(birth_date, 'YYYY-MM-DD') as birth from patient where id = $1 and archived_at is null`, [isUuid(a.patientId) ? a.patientId : null])).rows[0];
  if (!p) throw new Refused('That patient is not on file here.');
  if (!p.birth || isMinor(p.birth)) throw new Refused('Only for an adult patient with a birth date on file. For a patient under 18, a parent or guardian signs.');
  await tx.query('insert into capacity_note (clinic_id, patient_id, dentist_id, reason) values ($1, $2, $3, $4)', [a.clinicId, a.patientId, a.staffId, reason]);
  await audit(tx, a.clinicId, a.staffId, 'consent.capacity', 'patient', a.patientId);
}

/** The newest capacity note in the last 30 days, if any. */
export async function capacityNote(q: Q, patientId: string): Promise<{ at: Date; dentistName: string; reason: string } | null> {
  return (await q.query<{ at: Date; dentistName: string; reason: string }>(
    `select c.recorded_at as at, s.full_name as "dentistName", c.reason from capacity_note c join staff s on s.id = c.dentist_id
      where c.patient_id = $1 and c.recorded_at > now() - interval '30 days' order by c.recorded_at desc limit 1`, [patientId])).rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Paper
// ---------------------------------------------------------------------------
/** Print a form for signing on paper: unsigned, on a record, and explained first when it must be. Sets paper_printed_at once. Audit consent.paper_print. */
export async function printForPaper(tx: Tx, a: { clinicId: string; staffId: string; docId: string }): Promise<void> {
  if (!(await canEditRecords(tx, a.staffId, a.clinicId))) throw new Refused(NOT_ALLOWED);
  const d = (await tx.query<{ id: string; version_id: string; state: string; printed: boolean; attested: boolean; patient_id: string | null; intake_open: boolean | null }>(
    `select d.id, d.version_id, consent_document_state(d.id) as state, d.paper_printed_at is not null as printed,
            exists (select 1 from consent_attestation x where x.document_id = d.id) as attested, d.patient_id,
            (select i.status in ('preparing', 'out') from intake i where i.id = d.intake_id) as intake_open
       from consent_document d where d.id = $1 for update`, [isUuid(a.docId) ? a.docId : null])).rows[0];
  if (!d || !d.patient_id) throw new Refused('That form is not on a record.');
  if (d.intake_open) throw new Refused('That form is in forms being filled in now. Take it out of those forms, or throw them away, first.');
  const t = TEMPLATES[d.version_id];
  if (d.state !== 'to_sign' || (await tx.query('select 1 from consent_signing where document_id = $1', [d.id])).rowCount) throw new Refused('Only a form never signed is printed for signing.');
  if (t?.attest && !d.attested) throw new Refused('The dentist explains and confirms this form before it is printed for signing.');
  if (!d.printed) await tx.query('update consent_document set paper_printed_at = now() where id = $1', [d.id]);
  await audit(tx, a.clinicId, a.staffId, 'consent.paper_print', 'consent_document', d.id);
}

/**
 * A form signed on paper, recorded with its scan: the decision, who signed
 * and as whom (the same rules as on a device), the day on the paper (between
 * the print and today) and the scan (this patient's file, uploaded after the
 * print). The snapshot is the form as printed with that decision and signer.
 * Audit consent.paper.
 */
export async function recordPaperSigning(tx: Tx, a: {
  clinicId: string; staffId: string; docId: string; raw: RawPart; signedOn: string; attachmentId: string; clinic: ClinicFace;
}): Promise<void> {
  if (!(await canEditRecords(tx, a.staffId, a.clinicId))) throw new Refused(NOT_ALLOWED);
  // The form locked first, then read: what is checked is what is signed.
  await tx.query('select 1 from consent_document where id = $1 for update', [isUuid(a.docId) ? a.docId : null]);
  const doc = await loadConsentDocument(tx, a.docId);
  if (!doc || !doc.patientId || !doc.template) throw new Refused('That form is not on a record.');
  if (doc.intakeStatus === 'preparing' || doc.intakeStatus === 'out') throw new Refused('That form is in forms being filled in now. Take it out of those forms, or throw them away, first.');
  if (!doc.paperPrintedAt) throw new Refused('Print the form for signing first.');
  if (doc.state !== 'to_sign') throw new Refused('This form is signed already.');
  const t = doc.template;
  const p = (await tx.query<{ first_name: string; middle_name: string | null; last_name: string; suffix: string | null; birth: string | null }>(
    `select first_name, middle_name, last_name, suffix, to_char(birth_date, 'YYYY-MM-DD') as birth from patient where id = $1`, [doc.patientId])).rows[0];
  const name = [p.first_name, p.middle_name, p.last_name, p.suffix].map((x) => (x ?? '').trim()).filter(Boolean).join(' ');
  const minor = p.birth ? isMinor(p.birth) : null;
  if (minor === null) throw new Refused('Add the patient’s birth date first.');
  const part = readPatientPart(t, a.raw, { minor, device: 'clinic', patientName: name, fields: doc.fields });
  const problems = Object.values(part.errors);
  if (!part.decision || part.decision === 'later') problems.push('Say what they decided on the paper.');
  const day = /^\d{4}-\d{2}-\d{2}$/.test(a.signedOn) ? a.signedOn : '';
  if (!day) problems.push('Write the day on the paper.');
  if (!isUuid(a.attachmentId)) problems.push('Choose the scan of the signed paper. Upload it in Files first.');
  if (problems.length) throw new Refused([...new Set(problems)]);
  const ctx = contextFor(t, {
    clinic: a.clinic, patientName: name, birth: p.birth, minor, dentist: doc.dentistName ? { name: doc.dentistName, prc: doc.dentistPrc } : null,
    attested: doc.attestation, planned: plannedLanguage(doc), date: day,
  });
  const rendered = renderDocument(t, doc.fields, { ...ctx, answers: part.answers, initials: part.initials, decision: part.decision, signer: part.signer, read: part.read, explainedIn: part.explainedIn });
  const snapshot = snapshotText(rendered, { document: doc.id, ref: doc.ref });
  const s = part.signer!;
  try {
    await tx.query('savepoint paper');
    await tx.query(
      `insert into consent_signing (clinic_id, document_id, decision, channel, method, snapshot, snapshot_sha256, seal_sha256, answers, signed_by_name, signed_as,
                                    relation, authority, authority_ground, authority_note, explained_in, read_by, strokes, signed_on, attachment_id, recorded_by)
       values ($1, $2, $3, 'paper', $4, $5, repeat('0', 64), repeat('0', 64), $6, $7, $8, $9, $10, $11, $12, $13, $14, null, $15, $16, $17)`,
      [a.clinicId, doc.id, part.decision, s.method, snapshot, JSON.stringify(part.answers), s.name, s.as, s.relation, s.authority, s.ground, s.note,
        part.explainedIn, part.read && !part.read.self ? part.read.by : null, day, a.attachmentId, a.staffId]);
    await tx.query('release savepoint paper');
  } catch (e) {
    if ((e as { code?: string }).code !== '23514') throw e;
    await tx.query('rollback to savepoint paper');
    const m = String((e as Error).message);
    throw new Refused(/scan/.test(m) ? 'The scan must be this patient’s file, uploaded after the form was printed.'
      : /day on the paper/.test(m) ? 'The day on the paper must be between the day it was printed and today.'
      : /who signs/.test(m) ? 'That person cannot sign this form. See who may sign.'
      : 'The paper signing could not be recorded as given. Check the details.');
  }
  await audit(tx, a.clinicId, a.staffId, 'consent.paper', 'consent_document', doc.id);
}

/** Remove a form nobody signed. Audit consent.cancel. */
export async function cancelDocument(tx: Tx, a: { clinicId: string; staffId: string; docId: string }): Promise<void> {
  if (!(await canEditRecords(tx, a.staffId, a.clinicId))) throw new Refused(NOT_ALLOWED);
  const d = (await tx.query<{ id: string; signed: boolean; intake_open: boolean | null }>(
    `select d.id, exists (select 1 from consent_signing s where s.document_id = d.id) as signed,
            (select i.status in ('preparing', 'out') from intake i where i.id = d.intake_id) as intake_open
       from consent_document d where d.id = $1 and d.cancelled_at is null for update`, [isUuid(a.docId) ? a.docId : null])).rows[0];
  if (!d) throw new Refused('That form was removed already.');
  if (d.signed) throw new Refused('A signed form is never removed. It can be withdrawn.');
  if (d.intake_open) throw new Refused('That form is in forms being filled in now. Take it out of those forms instead.');
  await tx.query(`update consent_document set cancelled_at = now(), cancelled_by = $2, cancel_why = 'removed' where id = $1`, [d.id, a.staffId]);
  await audit(tx, a.clinicId, a.staffId, 'consent.cancel', 'consent_document', d.id);
}

/** A withdrawal in one line: "Withdrawn 1 Oct 2026: told by Ana Dimaculangan, by phone, recorded by Liwayway Domingo. “…”". */
export function withdrawalWords(w: NonNullable<RecordSigning['withdrawal']>): string {
  const how = WITHDRAW_HOW.find((h) => h.value === w.how)?.label.toLocaleLowerCase('en') ?? w.how;
  return `Withdrawn ${manilaDayWords(new Date(w.at))}: told by ${w.toldBy}, ${how}, recorded by ${w.byName}${w.note ? `. “${w.note}”` : ''}`;
}

export type OverrideContext = 'plan_done' | 'in_chair' | 'strip';
/** Where treatment went ahead without the form: the plan's Mark done, the chair, the This visit strip. */
export const OVERRIDE_CONTEXT: Record<OverrideContext, string> = { plan_done: 'treatment marked done', in_chair: 'seated in the chair', strip: 'the visit went ahead' };
/** The form's state when treatment went ahead, in words (consent_override.state_then). */
export const STATE_THEN_WORDS: Record<string, string> = {
  cancelled: 'removed', to_sign: 'not signed', to_confirm: 'not confirmed', agreed: 'agreed', refused: 'not agreed', no_photos: 'no photos',
  withdrawn: 'withdrawn', not_explained: 'not explained',
};
/** An override in one line: "Went ahead anyway (not signed), treatment marked done · Dr. Cariño, 1 Oct 2026, 2:31 pm: “…”". */
export function overrideWords(o: RecordOverride): string {
  const hm = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' }).format(new Date(o.at)).toLowerCase();
  return `Went ahead anyway (${STATE_THEN_WORDS[o.stateThen] ?? o.stateThen}), ${OVERRIDE_CONTEXT[o.context]} · ${o.staffName}, ${manilaDayWords(new Date(o.at))}, ${hm}: “${o.reason}”`;
}

/** A form linked to a plan line or a visit that is not agreed: what the record shows beside Mark done, and what an override records.
 *  explained: its dentist has explained it, or it is a form nobody explains. */
export interface ConsentGap { docId: string; title: string; state: DocState; explained: boolean }
/** Why a form is a gap: "not signed yet", "the patient did not agree", "withdrawn". */
export const gapWhy = (g: ConsentGap): string =>
  g.state === 'to_sign' ? (g.explained ? 'not signed yet' : 'not explained or signed yet') : g.state === 'to_confirm' ? 'signed, not confirmed yet'
    : g.state === 'refused' ? 'the patient did not agree' : g.state === 'withdrawn' ? 'withdrawn' : g.state === 'cancelled' ? 'removed' : STATE_WORDS[g.state]?.words.toLocaleLowerCase('en') ?? g.state;
/** The gap in words: "Extraction consent: not explained yet", "… the patient did not agree", "… withdrawn". */
export const gapWords = (g: ConsentGap): string => `${g.title}: ${gapWhy(g)}`;

/**
 * Every consent gap on this patient's record, by the plan line and by the visit
 * it is linked to (one read for the Treatment section, the tooth panel and the
 * This visit strip). A form not agreed — to sign, to confirm, refused or
 * withdrawn — on a line or a visit; "No photos" is a decision, not a gap.
 */
export async function consentGapsFor(q: Q, patientId: string): Promise<{ byPlanItem: Map<string, ConsentGap[]>; byVisit: Map<string, ConsentGap[]> }> {
  const byPlanItem = new Map<string, ConsentGap[]>(), byVisit = new Map<string, ConsentGap[]>();
  if (!isUuid(patientId)) return { byPlanItem, byVisit };
  const rows = (await q.query<{ id: string; version_id: string; title: string; plan_item_id: string | null; appointment_id: string | null; state: DocState; explained: boolean }>(
    `select d.id, d.version_id, v.title, d.plan_item_id, d.appointment_id, consent_document_state(d.id) as state,
            exists (select 1 from consent_attestation x where x.document_id = d.id) as explained
       from consent_document d join consent_version v on v.id = d.version_id
      where d.patient_id = $1 and d.cancelled_at is null and (d.plan_item_id is not null or d.appointment_id is not null)`, [patientId])).rows;
  for (const r of rows) {
    if (r.state === 'agreed' || r.state === 'no_photos') continue;
    // A form no dentist explains (the general consent) is never "not explained".
    const g: ConsentGap = { docId: r.id, title: TEMPLATES[r.version_id]?.title.en ?? r.title, state: r.state, explained: r.explained || !TEMPLATES[r.version_id]?.attest };
    if (r.plan_item_id) byPlanItem.set(r.plan_item_id, [...(byPlanItem.get(r.plan_item_id) ?? []), g]);
    if (r.appointment_id) byVisit.set(r.appointment_id, [...(byVisit.get(r.appointment_id) ?? []), g]);
  }
  return { byPlanItem, byVisit };
}

/**
 * Going ahead although a linked form is refused, withdrawn, unsigned,
 * unconfirmed or not explained: never blocked, the reason kept (phase 4.4
 * asks with it: the plan's Mark done, record.ts; the This visit strip, the
 * record page). Audit consent.override.
 */
export async function overrideConsent(tx: Tx, a: { clinicId: string; staffId: string; docId: string; context: OverrideContext; reason: string }): Promise<void> {
  if (!(await canEditRecords(tx, a.staffId, a.clinicId))) throw new Refused(NOT_ALLOWED);
  const reason = clean(a.reason);
  if (!reason) throw new Refused('Write why you are going ahead.');
  if (reason.length > 200) throw new Refused('Keep the reason under 200 characters.');
  const d = (await tx.query<{ id: string; version_id: string; state: string; attested: boolean }>(
    `select d.id, d.version_id, consent_document_state(d.id) as state, exists (select 1 from consent_attestation x where x.document_id = d.id) as attested
       from consent_document d where d.id = $1`, [isUuid(a.docId) ? a.docId : null])).rows[0];
  if (!d) throw new Refused('That form is not here.');
  // "Not explained" only for a form its dentist explains (the general consent is simply not signed).
  const notExplained = d.state === 'to_sign' && !d.attested && !!TEMPLATES[d.version_id]?.attest;
  await tx.query('insert into consent_override (clinic_id, document_id, context, state_then, reason, staff_id) values ($1, $2, $3, $4, $5, $6)',
    [a.clinicId, d.id, a.context, notExplained ? 'not_explained' : d.state, reason, a.staffId]);
  await audit(tx, a.clinicId, a.staffId, 'consent.override', 'consent_document', d.id);
}

/** Forms linked to one plan line or one visit that are not agreed (the plan's Mark done reads it, record.ts): the same rule as consentGapsFor. */
export async function consentGaps(q: Q, a: { planItemId?: string | null; visitId?: string | null }): Promise<ConsentGap[]> {
  if (!isUuid(a.planItemId) && !isUuid(a.visitId)) return [];
  const rows = (await q.query<{ id: string; version_id: string; state: DocState; explained: boolean }>(
    `select d.id, d.version_id, consent_document_state(d.id) as state, exists (select 1 from consent_attestation x where x.document_id = d.id) as explained
       from consent_document d where d.cancelled_at is null and (d.plan_item_id = $1 or d.appointment_id = $2)`,
    [isUuid(a.planItemId) ? a.planItemId : null, isUuid(a.visitId) ? a.visitId : null])).rows;
  return rows.filter((r) => r.state !== 'agreed' && r.state !== 'no_photos')
    .map((r) => ({ docId: r.id, title: TEMPLATES[r.version_id]?.title.en ?? r.version_id, state: r.state, explained: r.explained || !TEMPLATES[r.version_id]?.attest }));
}

export type { Decision, Signer, PatientPart };
