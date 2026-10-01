// The intake, the desk's side (039): Add patient, step by step. A patient
// fills in their details (page 1, a new patient only) and signs the clinic's
// consent forms on a clinic tablet, on this device handed over, or (phase 3)
// on their own phone; the desk chooses the forms and fills in the clinic's
// part first. The patient's side is src/lib/intake-public.ts; the forms on
// the record are src/lib/consent-docs.ts; the words are consent-library.ts.
//
// Every write here runs inside the page's withClinic() transaction and
// follows the same steps (the intake spec §5.2):
//   1. the page checks csrfOk and hit('record:s:'+staff) before it opens the transaction;
//   2. first line: canEditRecords, else "Your account cannot add patients at this branch";
//   3. the intake is locked `for update`, then its live link (the definers take them in the same order);
//   4. `rev` must be the one the page was drawn at, and is bumped: the second of two saves is told;
//   5. anything refused is THROWN (Refused, src/lib/refused.ts): the page catches it outside the
//      transaction, so the rev bump and anything half-written roll back with it.
//
// What stays true:
// - An intake is not a patient. A new patient's intake ends as sent; the
//   server adds it at Send when nothing on file looks like them (addAtSend),
//   otherwise it waits for the desk (addIntake, Screen F). A patient on
//   file's intake has consent pages only and is on the record at Send.
// - Page 1 and the phone link open only where formsNoticeReady() holds (the
//   privacy notice in force names what page 1 collects); only offered()
//   templates are offered (CONSENT_REVIEWED on a production server).
// - A clinic device's link is made already claimed (a tablet's with the
//   tablet's own secret, a handed-over desk's with a secret made for that
//   browser), so no public claim is needed and no staff session stays on it.
// - A procedure form is signed only after its named dentist has explained it
//   and confirmed its clinical part (consent_attestation, consent-docs.ts).
// - Nothing here logs an answer, a token or a secret.

import { createHash, randomBytes, randomInt } from 'node:crypto';
import type { Tx } from './db';
import { Refused } from './refused';
import { canEditRecords, isMinor, manilaToday, ageOn } from './health';
import { isProduction } from './env';
import { formsNoticeReady, likelyMatches, KEY_ALPHABET, type LikelyMatch, type PatientFormValues } from './patient-forms';
import {
  TEMPLATES, CODES, offered, consentsForCatalog, OFTEN_WITH, PAGE_MINUTES, readClinicPart,
  type Template, type Code, type Fields, type FieldValue, type RawPart,
} from './consent-library';
import { templatesInForce } from './consent-seal';
import { INTAKE_FORM_VERSION } from './intake-def';
import { lockClinic } from './import';
import {
  audit, insertPatientFromAnswers, fillPatientFromAnswers, writeHealthFromAnswers, writePrivacyConsent, useAnswerDetail, type AnswerSource,
} from './patient-add';

type Q = Pick<Tx, 'query'>;

// ---------------------------------------------------------------------------
// Words and limits
// ---------------------------------------------------------------------------
export const NOT_ALLOWED = 'Your account cannot add patients at this branch. Ask the owner.';
export const STALE = 'Someone else changed these forms while you were working. Here they are as they are now.';
/** An intake that is not sent is gone this long after it was started (retention_purge, 039). */
export const INTAKE_KEEP_HOURS = 24;
/** A clinic tablet counts as there when it asked for work this recently (tablet_poll every 4 s). */
export const TABLET_FRESH_MS = 2 * 60 * 1000;
/** A tablet link unseen this long is left behind by a patient who walked away (the gate retires it as idle too). */
export const LINK_IDLE_MS = 20 * 60 * 1000;
/**
 * The phone path (phase 3, shipped): a QR code only this patient can use,
 * shown on the desk's screen and claimed by the first phone that opens it
 * (intake_claim); a patient on file types their birth date first
 * (intake_verify, three misses lock the link); the desk's live panel follows
 * it. Page 1 on a phone still needs the privacy notice to cover it
 * (page1Open), like every device. False closes the phone card on every server.
 */
export const PHONE_PATH_BUILT = true;

/** The first name shown under the code, at most (intake.label). */
export const LABEL_MAX = 40;
export const DISMISS_NOTE_MAX = 120;

export type DeskMinor = 'yes' | 'no' | 'unsure';
export type CameWith = 'parent' | 'guardian' | 'other_adult' | 'nobody';
export const CAME_WITH: readonly { value: CameWith; label: string }[] = [
  { value: 'parent', label: 'A parent' },
  { value: 'guardian', label: 'A legal guardian' },
  { value: 'other_adult', label: 'Another adult (a grandparent, relative, yaya …)' },
  { value: 'nobody', label: 'Nobody' },
];
export type IntakeStatus = 'preparing' | 'out' | 'sent' | 'added' | 'cancelled';
export type LinkDevice = 'phone' | 'tablet' | 'desk';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s: unknown): s is string => typeof s === 'string' && UUID.test(s);

// ---------------------------------------------------------------------------
// Tokens, secrets, references
// ---------------------------------------------------------------------------
const REF_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const refOf = (prefix: string, n: number) => { let s = prefix; for (let i = 0; i < n; i++) s += REF_ALPHABET[randomInt(REF_ALPHABET.length)]; return s; };
/** IN-7K2F: what the desk and the patient call an intake. */
export const newIntakeRef = () => refOf('IN-', 4);
/** CF-7K2FQ: printed on a form and its copy. */
export const newDocumentRef = () => refOf('CF-', 5);
/** A link: 26 characters of the forms' alphabet (no i, l, o, 0 or 1), about 129 bits. */
export function newLinkToken(): string {
  let k = '';
  for (let i = 0; i < 26; i++) k += KEY_ALPHABET[randomInt(KEY_ALPHABET.length)];
  return k;
}
export const TOKEN_SHAPE = /^[a-hjkmnp-z2-9]{26}$/;
/** A device's secret (a clinic tablet's fl_ctab, a handed-over desk's or a phone's fl_idev): 43 URL-safe characters. */
export const newDeviceSecret = (): string => randomBytes(32).toString('base64url');
export const SECRET_SHAPE = /^[A-Za-z0-9_-]{43}$/;
/** What the database keeps of a device's secret. */
export const secretHash = (secret: string): string => createHash('sha256').update(secret, 'utf8').digest('hex');

// ---------------------------------------------------------------------------
// What is open on this server
// ---------------------------------------------------------------------------
export interface IntakeGates {
  production: boolean;
  /** The privacy notice in force (current_consent_version()). */
  privacyVersion: string | null;
  /** Page 1 (a new patient's details) on any device: the notice in force names what it collects. */
  page1Open: boolean;
  /** The QR code for the patient's own phone (a new patient's page 1 still needs page1Open). */
  phoneOpen: boolean;
  /** The forms that may be offered: in force, words matching their stored hash, reviewed on a production server. */
  templates: Template[];
}

export async function intakeGates(q: Q): Promise<IntakeGates> {
  const production = isProduction();
  const privacyVersion = (await q.query<{ id: string | null }>('select (current_consent_version()).id as id')).rows[0]?.id ?? null;
  const page1Open = formsNoticeReady(privacyVersion);
  const templates = (await templatesInForce(q)).filter((t) => offered(t, production));
  return { production, privacyVersion, page1Open, phoneOpen: PHONE_PATH_BUILT, templates };
}

/** Sent intakes nobody has added yet (with the poster's forms, the "N patients sent their forms" line). */
export async function countSentIntakes(q: Q): Promise<number> {
  return Number((await q.query<{ n: string }>(`select count(*) as n from intake where status = 'sent'`)).rows[0]?.n ?? 0);
}

// ---------------------------------------------------------------------------
// The people and the things an intake points at
// ---------------------------------------------------------------------------
export interface Dentist { id: string; name: string; prc: string | null }

/** Treating staff with access here and not disabled: who may explain a form (a PRC licence is needed to be named). */
export async function treatingDentists(q: Q, clinicId: string): Promise<Dentist[]> {
  return (await q.query<Dentist>(
    `select s.id, s.full_name as name, nullif(btrim(coalesce(s.prc_licence, '')), '') as prc
       from staff s join staff_access a on a.staff_id = s.id and a.clinic_id = $1
      where s.disabled_at is null and s.role in ('owner', 'dentist', 'associate')
      order by s.full_name`, [clinicId])).rows;
}

export interface PatientOnFile { id: string; name: string; firstName: string; chartNo: string; birth: string | null; archived: boolean; phone: string | null }

export async function patientOnFile(q: Q, patientId: string): Promise<PatientOnFile | null> {
  if (!isUuid(patientId)) return null;
  const r = (await q.query<{ id: string; first_name: string; middle_name: string | null; last_name: string; suffix: string | null; chart_no: string; birth: string | null; archived: boolean; phone: string | null }>(
    `select id, first_name, middle_name, last_name, suffix, chart_no, to_char(birth_date, 'YYYY-MM-DD') as birth, archived_at is not null as archived, phone
       from patient where id = $1`, [patientId])).rows[0];
  if (!r) return null;
  return { id: r.id, name: [r.first_name, r.last_name, r.suffix].filter(Boolean).join(' '), firstName: r.first_name, chartNo: r.chart_no, birth: r.birth, archived: r.archived, phone: r.phone };
}

export interface VisitRef { id: string; patientId: string | null; startsAt: Date; status: string; dentistId: string | null; service: string | null; catalogId: string | null }

const GOING = ['booked', 'confirmed', 'arrived', 'in_lobby', 'in_chair'];

async function visitOf(q: Q, id: string): Promise<VisitRef | null> {
  if (!isUuid(id)) return null;
  return (await q.query<VisitRef>(
    `select a.id, a.patient_id as "patientId", a.starts_at as "startsAt", a.status, a.dentist_id as "dentistId",
            coalesce(c.name, nullif(btrim(a.reason), '')) as service, a.catalog_id as "catalogId"
       from appointment a left join procedure_catalog c on c.id = a.catalog_id where a.id = $1`, [id])).rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Reading an intake for the desk
// ---------------------------------------------------------------------------
export interface DeskPage {
  state: 'reading' | 'read' | 'question' | 'agreed' | 'refused' | 'later';
  docRev: number; openedAt: Date | null; decidedAt: Date | null;
  signedByName: string | null; signedAs: string | null; method: string | null; authority: string | null;
}
export interface DeskSigning { id: string; decision: 'agreed' | 'refused'; signedAt: Date; needsConfirm: string | null; confirmed: boolean; method: string; strokes: boolean }
export interface DeskDoc {
  id: string; ref: string; versionId: string; code: Code; template: Template | null; sort: number; rev: number; fields: Fields;
  dentistId: string | null; dentistName: string | null; dentistPrc: string | null;
  explainedIn: 'en' | 'fil' | 'other' | null; explainedOther: string | null;
  planItemId: string | null; inForce: boolean; paperPrinted: boolean;
  attestation: { at: Date; dentistName: string; explainedIn: string; interpreter: string | null; assent: string | null } | null;
  page: DeskPage | null;
  signing: DeskSigning | null;
}
export interface DeskLink {
  token: string; device: LinkDevice; tabletId: string | null; tabletName: string | null;
  createdAt: Date; openBy: Date; claimedAt: Date | null; lastSeenAt: Date | null; createdBy: string;
}
export interface DeskIntake {
  id: string; ref: string; target: 'new' | 'existing'; status: IntakeStatus; rev: number;
  label: string | null; deskMinor: DeskMinor | null; cameWith: CameWith | null;
  createdAt: Date; createdBy: string; createdByName: string; sentAt: Date | null; page1DoneAt: Date | null;
  privacyAs: string | null; decidedAt: Date | null; decidedByName: string | null; addedAs: string | null;
  cancelledAt: Date | null; cancelReason: string | null;
  patient: PatientOnFile | null;
  appointment: VisitRef | null;
  /** Page 1's answers (a new patient). Only Screen F reads them, never the live panel. */
  answers: Partial<PatientFormValues> & Record<string, unknown> | null;
  /** Page 1's birth date, when the patient gave it (the minor rule). */
  page1Birth: string | null;
  link: DeskLink | null;
  /** With no live link: the last one and why it ended (a phone's code not scanned in time, locked, idle, stopped). */
  lastLink: { device: LinkDevice; why: string | null; at: Date } | null;
  /** A patient on file on their phone: when the birth date matched (the pages open only after). */
  verifiedAt: Date | null;
  docs: DeskDoc[];
  /** When an unsent intake is purged. */
  expiresAt: Date;
}

/** An intake and everything the desk's steps draw, or null when it is not here (row-level security). */
export async function loadIntake(q: Q, id: string): Promise<DeskIntake | null> {
  if (!isUuid(id)) return null;
  const i = (await q.query<Record<string, any>>(
    `select i.*, s.full_name as created_by_name, d.full_name as decided_by_name
       from intake i join staff s on s.id = i.created_by left join staff d on d.id = i.decided_by where i.id = $1`, [id])).rows[0];
  if (!i) return null;
  const link = (await q.query<Record<string, any>>(
    `select l.token, l.device, l.tablet_id, t.name as tablet_name, l.created_at, l.open_by, l.claimed_at, l.last_seen_at, l.created_by
       from intake_link l left join clinic_tablet t on t.id = l.tablet_id where l.intake_id = $1 and l.retired_at is null`, [id])).rows[0];
  const last = link ? null : (await q.query<{ device: LinkDevice; retired_why: string | null; retired_at: Date }>(
    `select device, retired_why, retired_at from intake_link where intake_id = $1 and retired_at is not null order by retired_at desc limit 1`, [id])).rows[0] ?? null;
  const docs = (await q.query<Record<string, any>>(
    `select d.id, d.ref, d.version_id, coalesce(v.code, 'general') as code, d.sort, d.rev, d.fields, d.dentist_id, d.dentist_name, d.dentist_prc,
            d.explained_in, d.explained_other, d.plan_item_id, consent_in_force(d.version_id) as in_force, d.paper_printed_at is not null as printed,
            a.attested_at, a.dentist_name as a_dentist, a.explained_in as a_lang, a.interpreter as a_interpreter, a.assent as a_assent,
            pg.state, pg.doc_rev, pg.opened_at, pg.decided_at, pg.signed_by_name, pg.signed_as, pg.method, pg.authority,
            sg.id as s_id, sg.decision as s_decision, sg.signed_at as s_at, sg.needs_confirm as s_needs, sg.method as s_method, sg.strokes is not null as s_strokes,
            exists (select 1 from consent_confirmation c where c.signing_id = sg.id) as s_confirmed
       from consent_document d
       join consent_version v on v.id = d.version_id
       left join consent_attestation a on a.document_id = d.id
       left join intake_page pg on pg.intake_id = $1 and pg.document_id = d.id
       left join lateral (select * from consent_signing s where s.document_id = d.id order by s.signed_at desc, s.id desc limit 1) sg on true
      where d.intake_id = $1 and d.cancelled_at is null
      order by d.sort, d.prepared_at`, [id])).rows;
  const patient = i.patient_id ? await patientOnFile(q, i.patient_id) : null;
  const appointment = i.appointment_id ? await visitOf(q, i.appointment_id) : null;
  const birth = typeof i.answers?.birth_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(i.answers.birth_date) ? i.answers.birth_date : null;
  return {
    id: i.id, ref: i.ref, target: i.target, status: i.status, rev: i.rev, label: i.label, deskMinor: i.desk_minor, cameWith: i.came_with,
    createdAt: i.created_at, createdBy: i.created_by, createdByName: i.created_by_name, sentAt: i.sent_at, page1DoneAt: i.page1_done_at,
    privacyAs: i.privacy_as, decidedAt: i.decided_at, decidedByName: i.decided_by_name, addedAs: i.added_as,
    cancelledAt: i.cancelled_at, cancelReason: i.cancel_reason,
    patient, appointment, answers: i.answers ?? null, page1Birth: birth,
    link: link ? {
      token: link.token, device: link.device, tabletId: link.tablet_id, tabletName: link.tablet_name, createdAt: link.created_at, openBy: link.open_by,
      claimedAt: link.claimed_at, lastSeenAt: link.last_seen_at, createdBy: link.created_by,
    } : null,
    lastLink: last ? { device: last.device, why: last.retired_why, at: last.retired_at } : null,
    verifiedAt: i.verified_at ?? null,
    docs: docs.map((d) => ({
      id: d.id, ref: d.ref, versionId: d.version_id, code: d.code, template: TEMPLATES[d.version_id] ?? null, sort: d.sort, rev: d.rev, fields: d.fields ?? {},
      dentistId: d.dentist_id, dentistName: d.dentist_name, dentistPrc: d.dentist_prc, explainedIn: d.explained_in, explainedOther: d.explained_other,
      planItemId: d.plan_item_id, inForce: d.in_force, paperPrinted: d.printed,
      attestation: d.attested_at ? { at: d.attested_at, dentistName: d.a_dentist, explainedIn: d.a_lang, interpreter: d.a_interpreter, assent: d.a_assent } : null,
      page: d.state ? {
        state: d.state, docRev: d.doc_rev, openedAt: d.opened_at, decidedAt: d.decided_at, signedByName: d.signed_by_name, signedAs: d.signed_as,
        method: d.method, authority: d.authority,
      } : null,
      signing: d.s_id ? { id: d.s_id, decision: d.s_decision, signedAt: d.s_at, needsConfirm: d.s_needs, confirmed: d.s_confirmed, method: d.s_method, strokes: d.s_strokes } : null,
    })),
    expiresAt: new Date(new Date(i.created_at).getTime() + INTAKE_KEEP_HOURS * 3600_000),
  };
}

/** Under 18 for the forms: the record's birth date, else page 1's, else the desk's answer (null: not sure). */
export function intakeMinor(it: Pick<DeskIntake, 'patient' | 'page1Birth' | 'deskMinor'>, today = manilaToday()): boolean | null {
  const birth = it.patient?.birth ?? it.page1Birth;
  if (birth) return isMinor(birth, today);
  return it.deskMinor === 'yes' ? true : it.deskMinor === 'no' ? false : null;
}

/** The patient's age on the Manila calendar, when a birth date is known. */
export function intakeAge(it: Pick<DeskIntake, 'patient' | 'page1Birth'>, today = manilaToday()): number | null {
  const birth = it.patient?.birth ?? it.page1Birth;
  return birth ? ageOn(birth, today) : null;
}

/** "Juan D." for a new patient (the desk's label, or page 1's first name once given; else "New patient", the ref shown beside it), the name for a patient on file. */
export function intakeName(it: Pick<DeskIntake, 'patient' | 'label' | 'answers'>): string {
  if (it.patient) return it.patient.name;
  const first = typeof it.answers?.first_name === 'string' ? it.answers.first_name : null;
  const last = typeof it.answers?.last_name === 'string' ? it.answers.last_name : null;
  if (first) return last ? `${first} ${last.charAt(0)}.` : first;
  return it.label ?? 'New patient';
}

/** "10:36 am" in Manila. */
export const timeWords = (x: Date | string): string =>
  new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' }).format(new Date(x)).toLowerCase();

/** Where a form stands in the intake, in words and a tone (never colour alone). */
export type Tone = 'info' | 'success' | 'warn' | 'alert' | 'neutral';
export function partTag(d: DeskDoc): { words: string; tone: Tone } {
  const hm = (x: Date) => timeWords(x);
  if (!d.inForce) return { words: 'Updated words: renew the form', tone: 'warn' };
  if (d.signing) {
    if (d.signing.decision === 'agreed') {
      if (d.signing.needsConfirm && !d.signing.confirmed) return { words: 'To confirm', tone: 'warn' };
      return { words: `Signed ${hm(d.signing.signedAt)}`, tone: 'success' };
    }
    if (d.code === 'photos' && !d.signing.strokes) return { words: 'No photos', tone: 'neutral' };
    return { words: 'Did not agree', tone: 'alert' };
  }
  const p = d.page;
  if (!p) return { words: 'Not started', tone: 'neutral' };
  if ((p.state === 'agreed' || p.state === 'refused') && p.docRev !== d.rev) return { words: 'Sign again', tone: 'warn' };
  switch (p.state) {
    case 'reading': return { words: 'Reading', tone: 'info' };
    case 'read': return { words: d.attestation ? 'Read: ready to sign' : 'Read, waiting for the dentist', tone: 'info' };
    case 'question': return { words: 'Has a question', tone: 'warn' };
    case 'later': return { words: d.code === 'photos' ? 'Decide later' : 'Will ask the dentist', tone: 'warn' };
    case 'agreed': return { words: `Signed ${p.decidedAt ? hm(p.decidedAt) : ''}`.trim(), tone: 'success' };
    case 'refused': return d.code === 'photos' ? { words: 'No photos', tone: 'neutral' } : { words: 'Did not agree', tone: 'alert' };
  }
}

// ---------------------------------------------------------------------------
// Suggestions (step 1)
// ---------------------------------------------------------------------------
export interface Suggestion {
  code: Code;
  /** Pre-ticked: a plan line a treating dentist made and the patient accepted. A booking never pre-ticks. */
  tick: boolean;
  /** "Planned by Dr Reyes: extraction 36" · "Booked for: extraction (not yet examined)". */
  why: string;
  planItemId: string | null;
  teeth: number[];
}
export interface ConsentSuggestions {
  byCode: Partial<Record<Code, Suggestion[]>>;
  /** "Often needed" beside a form (anaesthesia beside fillings and crowns). */
  often: Partial<Record<Code, Code>>;
  /** The general consent in force already signed by this patient, and when. */
  generalSigned: Date | null;
}

/**
 * What to suggest for this patient: plan lines a treating dentist planned and
 * the patient accepted (pre-ticked, with anaesthesia where the procedure
 * numbs), the visit's booking (shown, never ticked: not yet examined), and
 * whether the consent to examination and treatment in force is signed
 * already (at a visit on the tablet, as an agreed form, or on the poster's
 * forms). Suggestions only: the desk decides.
 */
export async function suggestConsents(q: Q, a: { patientId: string | null; visit: VisitRef | null; generalVersion: string | null }): Promise<ConsentSuggestions> {
  const byCode: Partial<Record<Code, Suggestion[]>> = {};
  const add = (s: Suggestion) => { (byCode[s.code] ??= []).push(s); };
  if (a.patientId) {
    const plan = (await q.query<{ id: string; name: string; fdi: number | null; status: string; code: string | null; cat_name: string | null; category: string | null; by_name: string | null; treats: boolean }>(
      `select t.id, t.name, t.fdi, t.status, c.code, c.name as cat_name, c.category, s.full_name as by_name,
              coalesce(s.role in ('owner', 'dentist', 'associate'), false) as treats
         from treatment_plan_item t left join procedure_catalog c on c.id = t.catalog_id left join staff s on s.id = t.created_by
        where t.patient_id = $1 and t.status in ('planned', 'accepted') order by t.created_at`, [a.patientId])).rows;
    for (const p of plan) {
      const codes = consentsForCatalog(p.code, p.cat_name ?? p.name, p.category);
      const accepted = p.status === 'accepted' && p.treats;
      const what = `${p.name.toLocaleLowerCase('en')}${p.fdi ? ` ${p.fdi}` : ''}`;
      const why = accepted ? `Planned by ${p.by_name ?? 'the dentist'}: ${what}` : `Planned, not accepted yet: ${what}`;
      for (const code of codes) add({ code, tick: accepted, why, planItemId: p.id, teeth: p.fdi ? [p.fdi] : [] });
    }
  }
  if (a.visit && a.visit.service) {
    const cat = a.visit.catalogId
      ? (await q.query<{ code: string; name: string; category: string | null }>('select code, name, category from procedure_catalog where id = $1', [a.visit.catalogId])).rows[0]
      : null;
    for (const code of consentsForCatalog(cat?.code ?? null, cat?.name ?? a.visit.service, cat?.category ?? null)) {
      if (!byCode[code]?.some((s) => s.tick)) add({ code, tick: false, why: `Booked for: ${a.visit.service.toLocaleLowerCase('en')} (not yet examined)`, planItemId: null, teeth: [] });
    }
  }
  const often: Partial<Record<Code, Code>> = {};
  for (const [code, withs] of Object.entries(OFTEN_WITH) as [Code, readonly Code[]][]) {
    if (byCode[code]) for (const w of withs) if (!byCode[w]?.some((s) => s.tick)) often[w] = code;
  }
  let generalSigned: Date | null = null;
  if (a.patientId && a.generalVersion) {
    generalSigned = (await q.query<{ at: Date | null }>(
      `select greatest(
         (select max(vc.signed_at) from visit_consent vc where vc.patient_id = $1 and vc.version_id = $2),
         (select max(s.signed_at) from consent_document d join consent_signing s on s.document_id = d.id
           where d.patient_id = $1 and d.version_id = $2 and consent_document_state(d.id) = 'agreed'),
         (select max(pc.given_at) from patient_consent pc where pc.patient_id = $1 and pc.version_id = $2 and pc.channel = 'form')) as at`,
      [a.patientId, a.generalVersion])).rows[0]?.at ?? null;
  }
  return { byCode, often, generalSigned };
}

/** About how long the patient's part takes: page 1, each form, and the check. */
export function minutesFor(codes: readonly Code[], templates: readonly Template[], page1: boolean): { parts: number; minutes: number } {
  const ts = templates.filter((t) => codes.includes(t.code));
  return { parts: ts.length + (page1 ? 1 : 0), minutes: (page1 ? PAGE_MINUTES.page1 : 0) + ts.reduce((n, t) => n + t.minutes, 0) + PAGE_MINUTES.check };
}

// ---------------------------------------------------------------------------
// The writes
// ---------------------------------------------------------------------------
async function mayEdit(tx: Tx, clinicId: string, staffId: string): Promise<void> {
  if (!(await canEditRecords(tx, staffId, clinicId))) throw new Refused(NOT_ALLOWED);
}

type IntakeRow = {
  id: string; clinic_id: string; ref: string; target: 'new' | 'existing'; status: IntakeStatus; rev: number; patient_id: string | null;
  appointment_id: string | null; desk_minor: DeskMinor | null; came_with: CameWith | null; label: string | null; answers: Record<string, unknown> | null;
  created_by: string; created_at: Date; sent_at: Date | null; page1_done_at: Date | null; privacy_version: string | null; privacy_at: Date | null;
  privacy_as: string | null; privacy_by_name: string | null; form_version: string; decided_at: Date | null; decided_by: string | null;
};

/** Lock the intake, then its live link (the definers' order), and check and bump `rev` when the page sent one. */
async function lockIntake(tx: Tx, id: string, rev?: number | null): Promise<IntakeRow> {
  if (!isUuid(id)) throw new Refused('These forms are not here. They may have been removed.');
  const i = (await tx.query<IntakeRow>('select * from intake where id = $1 for update', [id])).rows[0];
  if (!i) throw new Refused('These forms are not here. They may have been removed.');
  await tx.query('select token from intake_link where intake_id = $1 and retired_at is null for update', [id]);
  if (rev !== undefined && rev !== null) {
    if (i.status === 'added' || i.status === 'cancelled') throw new Refused(STALE);
    const u = await tx.query('update intake set rev = rev + 1 where id = $1 and rev = $2', [id, rev]);
    if (!u.rowCount) throw new Refused(STALE);
  }
  return i;
}

/**
 * A form that was on the record before these forms began ("Sign on this
 * tablet" moved it in: startIntake's `documents`): on a patient, and prepared
 * before the intake was made. $2 is the intake's created_at. Taking it out of
 * the forms, or throwing the forms away, puts it back on the record as it was
 * (intake_id cleared) instead of removing it; only forms made for the intake
 * are removed.
 */
const FROM_RECORD = `(d.patient_id is not null and d.prepared_at < $2::timestamptz)`;

const event = (tx: Tx, clinicId: string, intakeId: string, kind: string, staffId: string | null, detail: string | null = null, documentId: string | null = null) =>
  tx.query('insert into intake_event (clinic_id, intake_id, kind, document_id, detail, staff_id) values ($1, $2, $3, $4, $5, $6)',
    [clinicId, intakeId, kind, documentId, detail, staffId]);

async function insertWithRef<T>(tx: Tx, make: () => string, run: (ref: string) => Promise<T | null>): Promise<T> {
  for (let n = 0; n < 12; n++) {
    const out = await run(make());
    if (out !== null) return out;
  }
  throw new Error('intake: no free reference after 12 tries');
}

/** The form in force for a code, if this server offers it. */
const templateFor = (gates: IntakeGates, code: Code) => gates.templates.find((t) => t.code === code) ?? null;

/**
 * Start an intake (Add patient → On their phone / At the clinic, the record's
 * Prepare consent forms, or Sign on this tablet for forms on the record). A
 * new patient needs page 1 open; a patient on file must be here, not
 * archived, with a birth date on file; a visit must be theirs and going
 * ahead. `documents`: forms on the record to sign again (never signed, or
 * last refused or withdrawn), moved into this intake; a form whose words are
 * no longer in force is prepared again under the words in force instead
 * (phase 4.2), whether or not it was signed. Audit intake.start.
 */
export type StartRefusal = 'patient' | 'birth' | 'page1' | 'visit' | 'doc_other' | 'doc_open' | 'doc_signed' | 'doc_words';
const refuseStart = (code: StartRefusal, text: string) => new Refused<{ code: StartRefusal }>(text, { code });

export async function startIntake(tx: Tx, a: {
  clinicId: string; staffId: string; gates: IntakeGates; patientId?: string | null; appointmentId?: string | null; documents?: readonly string[];
}): Promise<{ id: string }> {
  await mayEdit(tx, a.clinicId, a.staffId);
  let patient: PatientOnFile | null = null;
  if (a.patientId) {
    patient = await patientOnFile(tx, a.patientId);
    if (!patient || patient.archived) throw refuseStart('patient', 'That patient is not on file here any more.');
    if (!patient.birth) throw refuseStart('birth', `Add ${patient.firstName}’s birth date to their record first: the forms depend on their age.`);
  } else if (!a.gates.page1Open) {
    throw refuseStart('page1', 'A new patient’s details open here when the clinic’s privacy notice covers them. Type their details in first, then prepare their consent forms.');
  }
  let visit: VisitRef | null = null;
  if (a.appointmentId) {
    visit = await visitOf(tx, a.appointmentId);
    if (!visit || !GOING.includes(visit.status) || (patient && visit.patientId !== patient.id)) throw refuseStart('visit', 'That visit is not this patient’s, or is not going ahead.');
  }
  const docs = [...new Set(a.documents ?? [])];
  if (docs.length && !patient) throw refuseStart('doc_other', 'Forms on a record are signed again from that record.');
  const id = await insertWithRef(tx, newIntakeRef, async (ref) => (await tx.query<{ id: string }>(
    `insert into intake (clinic_id, ref, target, patient_id, appointment_id, form_version, created_by)
     values ($1, $2, $3, $4, $5, $6, $7) on conflict (clinic_id, ref) do nothing returning id`,
    [a.clinicId, ref, patient ? 'existing' : 'new', patient?.id ?? null, visit?.id ?? null, INTAKE_FORM_VERSION, a.staffId])).rows[0]?.id ?? null);
  for (const docId of docs) {
    const d = (await tx.query<{
      id: string; patient_id: string | null; cancelled: boolean; in_force: boolean; state: string; open_intake: string | null; title: string | null;
      code: string; version_id: string; fields: Fields; dentist_id: string | null; explained_in: string | null; explained_other: string | null;
      plan_item_id: string | null; appointment_id: string | null; signed: boolean;
    }>(
      `select d.id, d.patient_id, d.cancelled_at is not null as cancelled, consent_in_force(d.version_id) as in_force, consent_document_state(d.id) as state,
              (select i.ref from intake i where i.id = d.intake_id and i.status in ('preparing', 'out')) as open_intake, v.title,
              coalesce(v.code, 'general') as code, d.version_id, d.fields, d.dentist_id, d.explained_in, d.explained_other, d.plan_item_id, d.appointment_id,
              exists (select 1 from consent_signing s where s.document_id = d.id) as signed
         from consent_document d join consent_version v on v.id = d.version_id where d.id = $1 for update of d`, [isUuid(docId) ? docId : null])).rows[0];
    if (!d || d.patient_id !== patient!.id || d.cancelled) throw refuseStart('doc_other', 'That form is not this patient’s, or was removed.');
    if (d.open_intake) throw refuseStart('doc_open', `${d.title ?? 'That form'} is in forms being filled in now (${d.open_intake}). Take it out of those forms, or throw them away, first.`);
    if (!d.in_force) {
      // Newer words (phase 4.2, "Sign again"): the form is prepared again under the words in force, in this intake —
      // the clinic's part carried over where the fields are the same, the dentist, the visit and the plan line kept.
      // An unsigned old form retires as renewed; a signed one stays on the record as history. The named dentist
      // explains the new words again before they are signed (no attestation is copied).
      const t = templateFor(a.gates, d.code as Code);
      if (!t) throw refuseStart('doc_words', `The clinic has newer words for ${d.title ?? 'that form'} that this server does not offer yet.`);
      const was = TEMPLATES[d.version_id];
      const sameFields = !!was && JSON.stringify(was.clinicFields.map((f) => [f.name, f.kind])) === JSON.stringify(t.clinicFields.map((f) => [f.name, f.kind]));
      if (!d.signed) await tx.query(`update consent_document set cancelled_at = now(), cancelled_by = $2, cancel_why = 'renewed' where id = $1`, [d.id, a.staffId]);
      await insertWithRef(tx, newDocumentRef, async (ref) => (await tx.query<{ id: string }>(
        `insert into consent_document (clinic_id, ref, version_id, intake_id, patient_id, appointment_id, plan_item_id, fields, dentist_id, explained_in, explained_other, sort, prepared_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) on conflict (clinic_id, ref) do nothing returning id`,
        [a.clinicId, ref, t.version, id, patient!.id, d.appointment_id ?? visit?.id ?? null, d.plan_item_id, JSON.stringify(sameFields ? d.fields : {}),
          d.dentist_id, d.explained_in, d.explained_other, t.order, a.staffId])).rows[0]?.id ?? null);
      await event(tx, a.clinicId, id, 'renewed', a.staffId, t.version, d.id);
      await audit(tx, a.clinicId, a.staffId, 'consent.renew', 'consent_document', d.id);
      continue;
    }
    if (!['to_sign', 'refused', 'no_photos', 'withdrawn'].includes(d.state)) throw refuseStart('doc_signed', `${d.title ?? 'That form'} is signed already under the words in force. Only a form never signed, refused or withdrawn is signed again.`);
    await tx.query('update consent_document set intake_id = $2 where id = $1', [d.id, id]);
  }
  await event(tx, a.clinicId, id, 'started', a.staffId, docs.length ? 'to sign again' : null);
  await audit(tx, a.clinicId, a.staffId, 'intake.start', 'intake', id);
  return { id };
}

/** The desk's two questions (a new patient) and the name shown under the code. Audit intake.age. */
export async function setDeskAnswers(tx: Tx, a: {
  clinicId: string; staffId: string; intakeId: string; rev: number; deskMinor: string | null; cameWith: string | null; label: string | null;
}): Promise<void> {
  await mayEdit(tx, a.clinicId, a.staffId);
  const i = await lockIntake(tx, a.intakeId, a.rev);
  if (i.status !== 'preparing' && i.status !== 'out') throw new Refused('These forms were sent: the answers are fixed.');
  const out = readDeskAnswers(i.target, a);
  await tx.query('update intake set desk_minor = $2, came_with = $3, label = $4 where id = $1', [i.id, out.deskMinor, out.cameWith, out.label]);
  await audit(tx, a.clinicId, a.staffId, 'intake.age', 'intake', i.id);
}

function readDeskAnswers(target: 'new' | 'existing', a: { deskMinor: string | null; cameWith: string | null; label: string | null }) {
  if (target === 'existing') return { deskMinor: null, cameWith: null, label: null };
  const problems: string[] = [];
  const deskMinor = (['yes', 'no', 'unsure'] as const).find((x) => x === a.deskMinor) ?? null;
  if (!deskMinor) problems.push('Say whether the patient is under 18: yes, no or not sure.');
  const cameWith = deskMinor === 'no' ? null : CAME_WITH.find((c) => c.value === a.cameWith)?.value ?? null;
  if (deskMinor && deskMinor !== 'no' && !cameWith) problems.push('Say who came with them.');
  const label = (a.label ?? '').replace(/\s+/g, ' ').trim().normalize('NFC') || null;
  if (label && label.length > LABEL_MAX) problems.push(`Keep the first name under ${LABEL_MAX} characters.`);
  if (problems.length) throw new Refused(problems);
  return { deskMinor, cameWith, label };
}

/** Plan lines and fee-guide rows for one form, to fill in what a new form proposes. */
async function prefillFor(tx: Tx, t: Template, a: { patientId: string | null; suggestions: Suggestion[] }): Promise<Fields> {
  const fields: Fields = {};
  const teeth = [...new Set(a.suggestions.flatMap((s) => s.teeth))].sort((x, y) => x - y);
  for (const f of t.clinicFields) {
    if (!f.prefill) continue;
    if (f.prefill === 'plan_teeth') { if (teeth.length) fields[f.name] = f.maxTeeth === 1 ? teeth.slice(0, 1) : teeth.slice(0, f.maxTeeth ?? 16); continue; }
    if (f.prefill === 'fee_guide') {
      const chips = await feeChips(tx, t, teeth.length || 1);
      if (chips.length === 1) fields[f.name] = chips[0].money;
      continue;
    }
    fields[f.name] = f.prefill.value as FieldValue;
  }
  return fields;
}

export interface FeeChip { label: string; money: { kind: 'amount'; from: number } | { kind: 'range'; from: number; to: number } }

/** The fee guide rows that map to this form (consentsForCatalog), as quick-fill amounts; tooth-scoped rows times the teeth. */
export async function feeChips(q: Q, t: Template, teeth: number): Promise<FeeChip[]> {
  const rows = (await q.query<{ code: string; name: string; category: string | null; price: string; price_max: string | null; tooth_scoped: boolean }>(
    `select code, name, category, default_price::text as price, price_max::text as price_max, tooth_scoped from procedure_catalog where active order by name`)).rows;
  const n = Math.max(1, teeth);
  return rows.filter((r) => consentsForCatalog(r.code, r.name, r.category)[0] === t.code && Number(r.price) > 0).slice(0, 4).map((r) => {
    const times = r.tooth_scoped ? n : 1;
    const from = Math.round(Number(r.price) * 100) * times;
    const to = r.price_max ? Math.round(Number(r.price_max) * 100) * times : null;
    return { label: `${r.name}${times > 1 ? ` × ${times}` : ''}`, money: to && to > from ? { kind: 'range' as const, from, to } : { kind: 'amount' as const, from } };
  });
}

/** Who explains a new form: the visit's dentist, else the person signed in, else the only one — a treating dentist here with a PRC licence. */
export function defaultDentist(dentists: readonly Dentist[], a: { visitDentist: string | null; staffId: string }): Dentist | null {
  const ok = dentists.filter((d) => d.prc);
  return ok.find((d) => d.id === a.visitDentist) ?? ok.find((d) => d.id === a.staffId) ?? (ok.length === 1 ? ok[0] : ok[0] ?? null);
}

/**
 * Step 1: which forms. New forms are made at the version in force (fields
 * proposed from the plan and the fee guide, the default dentist named);
 * unticked forms not signed are removed. Whitening is never for a patient
 * under 18. Only while preparing. Audit intake.consents.
 */
export async function saveChecklist(tx: Tx, a: {
  clinicId: string; staffId: string; intakeId: string; rev: number; gates: IntakeGates; codes: readonly string[];
  deskMinor: string | null; cameWith: string | null; label: string | null;
}): Promise<void> {
  await mayEdit(tx, a.clinicId, a.staffId);
  const i = await lockIntake(tx, a.intakeId, a.rev);
  if (i.status !== 'preparing') throw new Refused('Stop the forms on the other device first: they cannot be changed while the patient has them.');
  const desk = readDeskAnswers(i.target, a);
  await tx.query('update intake set desk_minor = $2, came_with = $3, label = $4 where id = $1', [i.id, desk.deskMinor, desk.cameWith, desk.label]);
  const patient = i.patient_id ? await patientOnFile(tx, i.patient_id) : null;
  if (i.target === 'existing' && !patient?.birth) throw new Refused('Add the patient’s birth date to their record first.');
  const minor = patient ? isMinor(patient.birth) : desk.deskMinor === 'yes' ? true : desk.deskMinor === 'no' ? false : null;
  const problems: string[] = [];
  const wanted = new Set<Code>();
  for (const c of a.codes) {
    if (!(CODES as readonly string[]).includes(c)) continue;
    const t = templateFor(a.gates, c as Code);
    if (!t) { problems.push('One of the forms is not offered here now. Choose again.'); continue; }
    if (t.minors === 'not_under_18' && minor === true) { problems.push(`${t.title.en}: not for under 18. The product label says so.`); continue; }
    wanted.add(t.code);
  }
  if (!wanted.size && i.target === 'existing') problems.push('Choose at least one form.');
  if (problems.length) throw new Refused(problems);

  const have = (await tx.query<{ id: string; code: string; signed: boolean; from_record: boolean }>(
    `select d.id, coalesce(v.code, 'general') as code, exists (select 1 from consent_signing s where s.document_id = d.id) as signed,
            ${FROM_RECORD} as from_record
       from consent_document d join consent_version v on v.id = d.version_id where d.intake_id = $1 and d.cancelled_at is null`, [i.id, i.created_at])).rows;
  for (const d of have) {
    if (wanted.has(d.code as Code)) continue;
    // A form that was on the record before these forms goes back to the record as it was; one made for them is removed.
    if (d.from_record) {
      await tx.query('update consent_document set intake_id = null where id = $1', [d.id]);
      await event(tx, a.clinicId, i.id, 'cancelled_doc', a.staffId, 'back to the record', d.id);
      continue;
    }
    if (d.signed) { problems.push('A form signed before is kept in these forms: it is here to be signed again.'); continue; }
    await tx.query(`update consent_document set cancelled_at = now(), cancelled_by = $2, cancel_why = 'removed' where id = $1`, [d.id, a.staffId]);
    await event(tx, a.clinicId, i.id, 'cancelled_doc', a.staffId, 'removed', d.id);
  }
  if (problems.length) throw new Refused(problems);
  const missing = [...wanted].filter((c) => !have.some((d) => d.code === c));
  if (missing.length) {
    const visit = i.appointment_id ? await visitOf(tx, i.appointment_id) : null;
    const sug = await suggestConsents(tx, { patientId: i.patient_id, visit, generalVersion: null });
    const dentists = await treatingDentists(tx, a.clinicId);
    const dentist = defaultDentist(dentists, { visitDentist: visit?.dentistId ?? null, staffId: a.staffId });
    for (const code of missing) {
      const t = templateFor(a.gates, code)!;
      const needsDentist = t.kind === 'document' && t.code !== 'photos';
      if (needsDentist && !dentist) {
        problems.push(`${t.title.en}: no dentist here has a PRC licence on file. Add it in Clinic settings → People, then choose the form again.`);
        continue;
      }
      const suggestions = (sug.byCode[code] ?? []).filter((s) => s.tick);
      const fields = await prefillFor(tx, t, { patientId: i.patient_id, suggestions });
      await insertWithRef(tx, newDocumentRef, async (ref) => (await tx.query<{ id: string }>(
        `insert into consent_document (clinic_id, ref, version_id, intake_id, patient_id, appointment_id, plan_item_id, fields, dentist_id, explained_in, sort, prepared_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) on conflict (clinic_id, ref) do nothing returning id`,
        [a.clinicId, ref, t.version, i.id, i.patient_id, i.appointment_id, suggestions[0]?.planItemId ?? null, JSON.stringify(fields),
          needsDentist ? dentist!.id : null, needsDentist ? 'en' : null, t.order, a.staffId])).rows[0]?.id ?? null);
    }
  }
  if (problems.length) throw new Refused(problems);
  await audit(tx, a.clinicId, a.staffId, 'intake.consents', 'intake', i.id);
}

/**
 * Step 2: the clinic's part of each form still open for it (not explained,
 * signed or printed), and who explains them in which language. Desk fields
 * are saved; dentist fields stay proposals until the named dentist explains
 * and confirms (consent-docs.ts, attestDocument). `raw(docId)` is what was
 * posted for one form. Audit intake.prepare.
 */
export async function saveClinicPart(tx: Tx, a: {
  clinicId: string; staffId: string; intakeId: string; rev: number;
  dentistId: string | null; explainedIn: string | null; explainedOther: string | null; raw: (docId: string) => RawPart;
}): Promise<void> {
  await mayEdit(tx, a.clinicId, a.staffId);
  const i = await lockIntake(tx, a.intakeId, a.rev);
  if (i.status !== 'preparing' && i.status !== 'out') throw new Refused('These forms were sent: the clinic’s part is fixed.');
  const it = (await loadIntake(tx, i.id))!;
  const problems: string[] = [];
  const open = it.docs.filter((d) => d.template && !d.attestation && !d.signing && !d.paperPrinted);
  const needsDentist = open.some((d) => d.template!.kind === 'document' && d.code !== 'photos');
  let dentist: Dentist | null = null;
  if (needsDentist) {
    const dentists = await treatingDentists(tx, a.clinicId);
    dentist = dentists.find((d) => d.id === a.dentistId) ?? null;
    if (!dentist) problems.push('Choose the dentist who explains the forms.');
    else if (!dentist.prc) problems.push(`${dentist.name} has no PRC licence on file. Add it in Clinic settings → People, or choose another dentist.`);
  }
  const lang = (['en', 'fil', 'other'] as const).find((x) => x === a.explainedIn) ?? null;
  const other = (a.explainedOther ?? '').replace(/\s+/g, ' ').trim().normalize('NFC') || null;
  if (needsDentist && !lang) problems.push('Choose the language the dentist plans to explain in.');
  if (lang === 'other' && !other) problems.push('Write the language.');
  if (other && other.length > 40) problems.push('Keep the language under 40 characters.');
  const minor = intakeMinor(it);
  const reads = open.map((d) => ({ d, r: readClinicPart(d.template!, a.raw(d.id), { minor, dentist: false }) }));
  for (const { d, r } of reads) {
    for (const [name, text] of Object.entries(r.errors)) {
      const label = name === '_form' ? '' : d.template!.clinicFields.find((f) => f.name === name)?.label;
      problems.push(`${d.template!.title.en}${label ? `, ${label.toLocaleLowerCase('en')}` : ''}: ${text}`);
    }
  }
  if (problems.length) throw new Refused(problems);
  for (const { d, r } of reads) {
    const procedure = d.template!.kind === 'document' && d.code !== 'photos';
    await tx.query(
      `update consent_document set fields = $2, dentist_id = $3, explained_in = $4, explained_other = $5 where id = $1`,
      [d.id, JSON.stringify(r.fields), procedure ? dentist!.id : d.dentistId, procedure ? lang : d.explainedIn, procedure && lang === 'other' ? other : null]);
  }
  await audit(tx, a.clinicId, a.staffId, 'intake.prepare', 'intake', i.id);
}

export interface Tablet { id: string; name: string; lastSeenAt: Date | null; busyWith: string | null }

/** This clinic's tablets, not removed, and which intake each is showing now (a live link seen in the last 20 minutes). */
export async function listTablets(q: Q): Promise<Tablet[]> {
  return (await q.query<Tablet>(
    `select t.id, t.name, t.last_seen_at as "lastSeenAt",
            (select i.ref from intake_link l join intake i on i.id = l.intake_id
              where l.tablet_id = t.id and l.retired_at is null and i.status = 'out'
                and coalesce(l.last_seen_at, l.claimed_at) > now() - interval '20 minutes' limit 1) as "busyWith"
       from clinic_tablet t where t.retired_at is null order by t.name, t.created_at`)).rows;
}

/** Why a hand-over was refused, as a word a page can carry in its address (?refused=): the sentence is LIVE_REFUSED's. */
export type LiveRefusal = 'sent' | 'page1' | 'phone' | 'words' | 'none' | 'minor' | 'tablet' | 'busy' | 'allowed' | 'stale' | 'wait';
export const LIVE_REFUSED: Record<LiveRefusal, string> = {
  sent: 'These forms were sent already.',
  page1: 'A new patient’s details open here when the clinic’s privacy notice covers them.',
  phone: 'The code for the patient’s own phone is not open here yet. Use a clinic tablet or this device.',
  words: 'The clinic has newer words for one of the forms. Renew it first.',
  none: 'Choose at least one form first.',
  minor: 'Answer “Under 18?” first.',
  tablet: 'That tablet is not ready. Open it on its “Ready for the next patient” screen, or choose another device.',
  busy: 'That tablet is showing another patient’s forms. Stop those first, or choose another device.',
  allowed: NOT_ALLOWED,
  stale: STALE,
  wait: 'Too many at once. Wait a moment and try again.',
};
const refuseLive = (code: LiveRefusal, text = LIVE_REFUSED[code]) => new Refused<{ code: LiveRefusal }>(text, { code });

/**
 * Step 4: give the forms to a device. A clinic tablet (registered, seen in
 * the last 2 minutes, not showing another patient's forms), this device
 * handed over (the link is made claimed with a new secret for this browser;
 * /auth/park/ then signs the desk out), or — phase 3 — their phone. The old
 * link retires ('replaced', or 'switched' for another device); every form
 * must be in force and new patients need page 1 open. Status out. Audit
 * intake.link, or intake.handover for this device.
 */
export async function goLive(tx: Tx, a: {
  clinicId: string; staffId: string; intakeId: string; rev: number; gates: IntakeGates; device: LinkDevice; tabletId?: string | null;
}): Promise<{ token: string; secret: string | null }> {
  await mayEdit(tx, a.clinicId, a.staffId);
  const i = await lockIntake(tx, a.intakeId, a.rev);
  if (i.status !== 'preparing' && i.status !== 'out') throw refuseLive('sent');
  if (i.target === 'new' && !a.gates.page1Open) throw refuseLive('page1');
  if (a.device === 'phone' && !a.gates.phoneOpen) throw refuseLive('phone');
  // A patient on file opens their phone's forms with their birth date: without one on record, no code could ever open.
  if (a.device === 'phone' && i.target === 'existing') {
    const b = (await tx.query<{ b: string | null }>('select birth_date::text as b from patient where id = $1', [i.patient_id])).rows[0]?.b ?? null;
    if (!b) throw refuseLive('phone', 'Add their birth date to their record first: they type it on their phone to open the forms.');
  }
  const docs = (await tx.query<{ n: string; stale: string }>(
    `select count(*) as n, count(*) filter (where not consent_in_force(version_id)) as stale from consent_document where intake_id = $1 and cancelled_at is null`, [i.id])).rows[0];
  if (Number(docs.stale) > 0) throw refuseLive('words');
  if (Number(docs.n) === 0 && i.target === 'existing') throw refuseLive('none');
  if (i.target === 'new' && !i.desk_minor) throw refuseLive('minor');
  let tablet: { id: string; name: string; last_seen_at: Date | null } | null = null;
  if (a.device === 'tablet') {
    tablet = (await tx.query<{ id: string; name: string; last_seen_at: Date | null }>(
      'select id, name, last_seen_at from clinic_tablet where id = $1 and retired_at is null for update', [isUuid(a.tabletId) ? a.tabletId : null])).rows[0] ?? null;
    if (!tablet) throw refuseLive('tablet', 'That tablet is not registered here any more. Choose another device.');
    if (!tablet.last_seen_at || Date.now() - new Date(tablet.last_seen_at).getTime() > TABLET_FRESH_MS) {
      throw refuseLive('tablet', `${tablet.name} has not been seen for a while. Open ${tablet.name} on its “Ready for the next patient” screen, then send again.`);
    }
    const other = (await tx.query<{ token: string; ref: string; fresh: boolean }>(
      `select l.token, i.ref, coalesce(l.last_seen_at, l.claimed_at) > now() - interval '20 minutes' as fresh
         from intake_link l join intake i on i.id = l.intake_id
        where l.tablet_id = $1 and l.retired_at is null and l.intake_id <> $2 and i.status = 'out' for update of l`, [tablet.id, i.id])).rows;
    for (const o of other) {
      if (o.fresh) throw refuseLive('busy', `${tablet.name} is showing another patient’s forms (${o.ref}). Stop those first, or choose another device.`);
      await tx.query(`update intake_link set retired_at = now(), retired_why = 'idle' where token = $1`, [o.token]);
    }
  }
  const old = (await tx.query<{ token: string; device: string; tablet_id: string | null }>(
    'select token, device, tablet_id from intake_link where intake_id = $1 and retired_at is null', [i.id])).rows[0];
  if (old) {
    const same = old.device === a.device && (old.tablet_id ?? null) === (tablet?.id ?? null);
    await tx.query('update intake_link set retired_at = now(), retired_why = $2 where token = $1', [old.token, same ? 'replaced' : 'switched']);
  }
  const secret = a.device === 'desk' ? newDeviceSecret() : null;
  let token = '';
  for (let n = 0; n < 12 && !token; n++) {
    const t = newLinkToken();
    const r = await tx.query(
      `insert into intake_link (token, clinic_id, intake_id, device, tablet_id, created_by, device_sha256)
       values ($1, $2, $3, $4, $5, $6, $7) on conflict (token) do nothing`,
      [t, a.clinicId, i.id, a.device, tablet?.id ?? null, a.staffId, secret ? secretHash(secret) : null]);
    if (r.rowCount) token = t;
  }
  if (!token) throw new Error('intake: no free link after 12 tries');
  if (i.status === 'preparing') await tx.query(`update intake set status = 'out' where id = $1`, [i.id]);
  const kind = a.device === 'desk' ? 'handover' : 'link';
  await event(tx, a.clinicId, i.id, kind, a.staffId, a.device === 'tablet' ? tablet!.name : a.device);
  await audit(tx, a.clinicId, a.staffId, a.device === 'desk' ? 'intake.handover' : 'intake.link', 'intake', i.id);
  return { token, secret };
}

/** Take the forms back from the device: the link retires ('stopped'), and the intake is preparing again. Saved pages stay. Audit intake.stop. */
export async function stopLink(tx: Tx, a: { clinicId: string; staffId: string; intakeId: string; rev: number }): Promise<void> {
  await mayEdit(tx, a.clinicId, a.staffId);
  const i = await lockIntake(tx, a.intakeId, a.rev);
  if (i.status !== 'out') throw new Refused('These forms are not out on a device.');
  await tx.query(`update intake_link set retired_at = now(), retired_why = 'stopped' where intake_id = $1 and retired_at is null`, [i.id]);
  await tx.query(`update intake set status = 'preparing' where id = $1`, [i.id]);
  await event(tx, a.clinicId, i.id, 'stopped', a.staffId);
  await audit(tx, a.clinicId, a.staffId, 'intake.stop', 'intake', i.id);
}

/**
 * A hand-over of this device is over (/auth/unlock/, or the next /auth/park/
 * on the same browser): the intake's live link on the desk's device retires
 * as stopped and the intake is preparing again, as Stop does. Saved pages
 * stay. Any staff member who signed in at this clinic may end it: it only
 * takes the forms back. True when a link was stopped. Audit intake.stop.
 */
export async function endHandover(tx: Tx, a: { clinicId: string; staffId: string; intakeId: string; why: 'unlocked' | 'handed over again' }): Promise<boolean> {
  if (!isUuid(a.intakeId)) return false;
  const i = (await tx.query<{ id: string; status: IntakeStatus }>('select id, status from intake where id = $1 and clinic_id = $2 for update', [a.intakeId, a.clinicId])).rows[0];
  if (!i) return false;
  const l = (await tx.query<{ token: string; device: LinkDevice }>(
    'select token, device from intake_link where intake_id = $1 and retired_at is null for update', [i.id])).rows[0];
  if (!l || l.device !== 'desk' || i.status !== 'out') return false;
  await tx.query(`update intake_link set retired_at = now(), retired_why = 'stopped' where token = $1`, [l.token]);
  await tx.query(`update intake set status = 'preparing', rev = rev + 1 where id = $1`, [i.id]);
  await event(tx, a.clinicId, i.id, 'stopped', a.staffId, a.why === 'unlocked' ? 'the device was unlocked' : 'the device was handed over again');
  await audit(tx, a.clinicId, a.staffId, 'intake.stop', 'intake', i.id);
  return true;
}

/** Stop and throw away an intake not sent: the link retires, forms that were on the record go back to it, the other forms nobody signed are removed. Audit intake.cancel. */
export async function cancelIntake(tx: Tx, a: { clinicId: string; staffId: string; intakeId: string; rev: number }): Promise<void> {
  await mayEdit(tx, a.clinicId, a.staffId);
  const i = await lockIntake(tx, a.intakeId, a.rev);
  if (i.status !== 'preparing' && i.status !== 'out') throw new Refused('These forms were sent: dismiss them instead, with a reason.');
  await tx.query(`update intake_link set retired_at = now(), retired_why = 'cancelled' where intake_id = $1 and retired_at is null`, [i.id]);
  // Forms that were on the record before go back to it as they were; only the forms made for these are removed.
  await tx.query(`update consent_document d set intake_id = null where d.intake_id = $1 and d.cancelled_at is null and ${FROM_RECORD}`, [i.id, i.created_at]);
  await tx.query(
    `update consent_document d set cancelled_at = now(), cancelled_by = $2, cancel_why = 'intake'
      where d.intake_id = $1 and d.cancelled_at is null and not exists (select 1 from consent_signing s where s.document_id = d.id)`, [i.id, a.staffId]);
  await tx.query(`update intake set status = 'cancelled', cancelled_at = now(), cancelled_by = $2, cancel_reason = 'stopped at the desk' where id = $1`, [i.id, a.staffId]);
  await event(tx, a.clinicId, i.id, 'cancelled', a.staffId);
  await audit(tx, a.clinicId, a.staffId, 'intake.cancel', 'intake', i.id);
}

export const DISMISS_WHY: readonly { value: string; label: string }[] = [
  { value: 'duplicate', label: 'Already on file' },
  { value: 'test', label: 'A test' },
  { value: 'other', label: 'Something else' },
];

/** A sent intake the desk will not add: cancelled with a reason, for the next purge. Audit intake.dismiss. */
export async function dismissIntake(tx: Tx, a: { clinicId: string; staffId: string; intakeId: string; rev: number; why: string | null; note: string | null }): Promise<void> {
  await mayEdit(tx, a.clinicId, a.staffId);
  const why = DISMISS_WHY.find((w) => w.value === a.why);
  const note = (a.note ?? '').replace(/\s+/g, ' ').trim().normalize('NFC');
  const problems: string[] = [];
  if (!why) problems.push('Say why these forms are dismissed.');
  if (why?.value === 'other' && !note) problems.push('Write a few words about why.');
  if (note.length > DISMISS_NOTE_MAX) problems.push(`Keep the note under ${DISMISS_NOTE_MAX} characters.`);
  if (problems.length) throw new Refused(problems);
  const i = await lockIntake(tx, a.intakeId, a.rev);
  if (i.status !== 'sent') throw new Refused(i.status === 'added' ? 'These forms were added already.' : 'Only sent forms are dismissed.');
  const reason = (note ? `${why!.label}: ${note}` : why!.label).slice(0, DISMISS_NOTE_MAX);
  await tx.query(`update intake set status = 'cancelled', cancelled_at = now(), cancelled_by = $2, cancel_reason = $3 where id = $1`, [i.id, a.staffId, reason]);
  await event(tx, a.clinicId, i.id, 'dismissed', a.staffId);
  await audit(tx, a.clinicId, a.staffId, 'intake.dismiss', 'intake', i.id);
}

/**
 * Forms whose words are no longer the ones in force: the old form is removed
 * ('renewed') and made again at the version in force, its fields copied when
 * the new words ask the same fields. It is explained and signed again. Audit
 * consent.renew.
 */
export async function renewDocuments(tx: Tx, a: { clinicId: string; staffId: string; intakeId: string; rev: number; gates: IntakeGates }): Promise<number> {
  await mayEdit(tx, a.clinicId, a.staffId);
  const i = await lockIntake(tx, a.intakeId, a.rev);
  if (i.status !== 'preparing' && i.status !== 'out') throw new Refused('These forms were sent already.');
  const stale = (await tx.query<{ id: string; version_id: string; code: string; fields: Fields; dentist_id: string | null; explained_in: string | null; explained_other: string | null; plan_item_id: string | null; signed: boolean }>(
    `select d.id, d.version_id, coalesce(v.code, 'general') as code, d.fields, d.dentist_id, d.explained_in, d.explained_other, d.plan_item_id,
            exists (select 1 from consent_signing s where s.document_id = d.id) as signed
       from consent_document d join consent_version v on v.id = d.version_id
      where d.intake_id = $1 and d.cancelled_at is null and not consent_in_force(d.version_id) for update of d`, [i.id])).rows;
  let n = 0;
  for (const d of stale) {
    const t = templateFor(a.gates, d.code as Code);
    const was = TEMPLATES[d.version_id];
    if (!t) throw new Refused('A form here has newer words this server does not offer yet. Remove it from the forms.');
    if (d.signed) throw new Refused(`${t.title.en} was signed before under the old words: prepare it again from the record.`);
    await tx.query(`update consent_document set cancelled_at = now(), cancelled_by = $2, cancel_why = 'renewed' where id = $1`, [d.id, a.staffId]);
    const sameFields = !!was && JSON.stringify(was.clinicFields.map((f) => [f.name, f.kind])) === JSON.stringify(t.clinicFields.map((f) => [f.name, f.kind]));
    await insertWithRef(tx, newDocumentRef, async (ref) => (await tx.query<{ id: string }>(
      `insert into consent_document (clinic_id, ref, version_id, intake_id, patient_id, appointment_id, plan_item_id, fields, dentist_id, explained_in, explained_other, sort, prepared_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) on conflict (clinic_id, ref) do nothing returning id`,
      [a.clinicId, ref, t.version, i.id, i.patient_id, i.appointment_id, d.plan_item_id, JSON.stringify(sameFields ? d.fields : {}),
        d.dentist_id, d.explained_in, d.explained_other, t.order, a.staffId])).rows[0]?.id ?? null);
    await event(tx, a.clinicId, i.id, 'renewed', a.staffId, t.version, d.id);
    await audit(tx, a.clinicId, a.staffId, 'consent.renew', 'consent_document', d.id);
    n++;
  }
  return n;
}

// ---------------------------------------------------------------------------
// Adding a sent intake to the records (Screen F, and at Send)
// ---------------------------------------------------------------------------
/** Page 1's answers as the add path reads them (patient-add.ts takes the forms' shape). */
function valuesOf(i: IntakeRow): PatientFormValues {
  const a = (i.answers ?? {}) as Record<string, unknown>;
  const s = (k: string) => (typeof a[k] === 'string' && (a[k] as string).trim() !== '' ? (a[k] as string) : null);
  return { ...(a as object), v: s('v') ?? i.form_version, first_name: s('first_name') ?? '', last_name: s('last_name') ?? '',
    middle_name: s('middle_name'), suffix: s('suffix') } as unknown as PatientFormValues;
}

const sourceOf = (i: IntakeRow): AnswerSource => ({ kind: 'intake', id: i.id, ref: i.ref, version: i.form_version, sentAt: i.sent_at ?? new Date() });

/** People on file who may be the person on a sent intake (likelyMatches), with the visit's own patient first when it was started from one. */
export async function intakeLookAlikes(q: Q, it: DeskIntake): Promise<(LikelyMatch & { visit?: true })[]> {
  const v = (it.answers ?? {}) as Record<string, any>;
  const found = await likelyMatches(q as Tx, { first_name: v.first_name ?? '', last_name: v.last_name ?? '', birth_date: v.birth_date ?? null, mobile: v.mobile ?? null });
  const out: (LikelyMatch & { visit?: true })[] = [...found];
  if (it.appointment?.patientId && !found.some((m) => m.id === it.appointment!.patientId)) {
    const p = await patientOnFile(q, it.appointment.patientId);
    if (p && !p.archived) out.unshift({ id: p.id, chartNo: p.chartNo, name: p.name, birth: p.birth, phone: p.phone, why: [], health: null, visit: true });
  } else if (it.appointment?.patientId) {
    const m = out.find((x) => x.id === it.appointment!.patientId);
    if (m) m.visit = true;
  }
  return out;
}

export type AddOutcome = { patientId: string; chartNo: string | null; as: 'new' | 'existing'; filled: string[]; kept: { label: string; onFile: string; onForm: string }[]; privacy: string };

/**
 * Add a sent intake: as a new patient (every look-alike must be in `seen`:
 * the desk saw them and chose new), or to a patient on file (only empty
 * details filled, never a name; the mobile and the email only when in `use`).
 * The health version, the privacy consent (unless nobody could agree), and
 * the forms go to the patient; their signings join the clinic's chain.
 * Audit intake.add (and patient.create or patient.update, health.update,
 * consent.intake).
 */
export async function addIntake(tx: Tx, a: {
  clinicId: string; staffId: string; intakeId: string; rev: number | null; as: 'new' | 'existing'; patientId?: string | null; seen?: readonly string[]; use?: readonly string[];
}): Promise<AddOutcome> {
  await mayEdit(tx, a.clinicId, a.staffId);
  await lockClinic(tx, a.clinicId);
  const i = await lockIntake(tx, a.intakeId, null);
  if (i.status === 'added') {
    const by = (await tx.query<{ full_name: string }>('select full_name from staff where id = $1', [i.decided_by])).rows[0]?.full_name ?? 'someone';
    const at = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' }).format(new Date(i.decided_at!)).toLowerCase();
    throw new Refused(`Already added by ${by} at ${at}.`);
  }
  if (i.status !== 'sent' || i.target !== 'new') throw new Refused('Only sent forms for a new patient are added here.');
  if (a.rev !== null) {
    const u = await tx.query('update intake set rev = rev + 1 where id = $1 and rev = $2', [i.id, a.rev]);
    if (!u.rowCount) throw new Refused(STALE);
  }
  const it = (await loadIntake(tx, i.id))!;
  const values = valuesOf(i);
  let patientId: string, chartNo: string | null = null, filled: string[] = [], kept: AddOutcome['kept'] = [], birthOnFile: string | null;
  if (a.as === 'new') {
    const alike = await intakeLookAlikes(tx, it);
    const seen = new Set(a.seen ?? []);
    const unseen = alike.filter((m) => !seen.has(m.id));
    if (unseen.length) throw new Refused(`Someone on file may be them: ${unseen.map((m) => m.name).join(', ')}. Check before adding as new.`);
    const made = await insertPatientFromAnswers(tx, { clinicId: a.clinicId, staffId: a.staffId, values });
    patientId = made.patientId; chartNo = made.chartNo; birthOnFile = values.birth_date ?? null;
    await writeHealthFromAnswers(tx, { clinicId: a.clinicId, staffId: a.staffId, patientId, values, source: sourceOf(i), merge: false });
  } else {
    const target = await patientOnFile(tx, a.patientId ?? '');
    if (!target || target.archived) throw new Refused('That patient is not on file here any more.');
    const fill = await fillPatientFromAnswers(tx, { clinicId: a.clinicId, staffId: a.staffId, patientId: target.id, values, use: a.use });
    if (!fill) throw new Refused('That patient is not on file here any more.');
    patientId = target.id; chartNo = target.chartNo; filled = fill.filled; kept = fill.kept; birthOnFile = fill.birthOnFile;
    await writeHealthFromAnswers(tx, {
      clinicId: a.clinicId, staffId: a.staffId, patientId, values, source: sourceOf(i), merge: true,
      birthChange: !target.birth && fill.fill.birth_date ? fill.fill.birth_date : null,
    });
    // Who signed was checked against page 1's birth date; the record's is the one that counts now (the same
    // rule as a signing: consent_signer_problem on the Manila day it was signed). A form the record's age
    // makes wrong is not put on the record: the desk checks the birth date first.
    const wrong = (await tx.query<{ minor: boolean | null; problem: string }>(
      `select years_on($3::date, (s.signed_at at time zone 'Asia/Manila')::date) < 18 as minor,
              consent_signer_problem(years_on($3::date, (s.signed_at at time zone 'Asia/Manila')::date) < 18, s.channel, s.signed_as, s.method,
                                     s.authority, s.authority_ground, s.authority_note, $2::uuid, $4::uuid) as problem
         from consent_signing s join consent_document d on d.id = s.document_id
        where d.intake_id = $1 and d.cancelled_at is null`, [i.id, patientId, birthOnFile, a.clinicId])).rows.filter((r) => r.problem);
    if (wrong.length) {
      throw new Refused(wrong[0].minor === null
        ? `Add ${target.firstName}’s birth date to their record first: who may sign depends on it.`
        : wrong[0].minor
          ? `${target.firstName}’s record makes them under 18, but the forms were signed as if they were not. Check the birth date on the record. If it is right, dismiss these forms and ask a parent or guardian to sign new ones.`
          : `${target.firstName}’s record makes them 18 or over, but the forms were signed for them as a minor. Check the birth date on the record. If it is right, dismiss these forms and ask ${target.firstName} to sign new ones.`);
    }
  }
  const privacy = await writePrivacyConsent(tx, {
    clinicId: a.clinicId, staffId: a.staffId, patientId, birthOnFile,
    intake: { id: i.id, privacyVersion: i.privacy_version, privacyAt: i.privacy_at, privacyAs: i.privacy_as as never, privacyByName: i.privacy_by_name },
  });
  // A visit that was another patient's (a walk-in record the desk chose not to use) is not this one's: cleared first.
  const keepVisit = !i.appointment_id || !!(await tx.query('select 1 from appointment where id = $1 and patient_id = $2', [i.appointment_id, patientId])).rowCount;
  if (!keepVisit) await tx.query('update consent_document set appointment_id = null where intake_id = $1 and appointment_id is not null', [i.id]);
  // The forms become the patient's: their signings join the chain (consent_document_chain, 039).
  await tx.query('update consent_document set patient_id = $2 where intake_id = $1 and patient_id is null and cancelled_at is null', [i.id, patientId]);
  await tx.query(
    `update intake set status = 'added', patient_id = $2, decided_by = $3, decided_at = now(), added_as = $4, appointment_id = $5 where id = $1`,
    [i.id, patientId, a.staffId, a.as, keepVisit ? i.appointment_id : null]);
  await event(tx, a.clinicId, i.id, 'added', a.staffId, a.as === 'new' ? 'as a new patient' : 'to a patient on file');
  await audit(tx, a.clinicId, a.staffId, 'intake.add', 'intake', i.id);
  return { patientId, chartNo, as: a.as, filled, kept, privacy };
}

/** An intake added to this patient: its page 1 answers, for the record (4.3). */
export interface AddedIntake { id: string; ref: string; addedAs: 'new' | 'existing'; sentAt: Date | null; values: PatientFormValues }

/**
 * The page 1 answers of an intake added to this patient (a new patient's
 * intake, added as new or to a patient on file), for the record page to compare
 * with the record and offer "Use" per detail — as the QR forms do. Null when
 * the intake is not this patient's, not added, or had no page 1 (an intake for
 * a patient on file asks none). Inside withClinic().
 */
export async function intakeAnswers(q: Q, intakeId: string, patientId: string): Promise<AddedIntake | null> {
  if (!isUuid(intakeId) || !isUuid(patientId)) return null;
  const i = (await q.query<IntakeRow & { added_as: 'new' | 'existing' | null }>(
    `select * from intake where id = $1 and patient_id = $2 and status = 'added' and target = 'new'`, [intakeId, patientId])).rows[0];
  if (!i || !i.answers || !i.added_as) return null;
  return { id: i.id, ref: i.ref, addedAs: i.added_as, sentAt: i.sent_at, values: valuesOf(i) };
}

/**
 * "Use <what page 1 says>" on the record after an intake was added to a
 * patient on file: one detail (a TAKEABLE column) written from the intake's
 * page 1, over what was on file. Never a name or the birth date. Audit
 * patient.update (useAnswerDetail, the QR forms' rule).
 */
export async function useIntakeDetail(tx: Tx, a: { clinicId: string; staffId: string; patientId: string; intakeId: string; field: string }):
  Promise<'saved' | 'same' | 'gone' | 'not-allowed'> {
  if (!(await canEditRecords(tx, a.staffId, a.clinicId))) return 'not-allowed';
  const i = await intakeAnswers(tx, a.intakeId, a.patientId);
  if (!i) return 'gone';
  return useAnswerDetail(tx, { clinicId: a.clinicId, staffId: a.staffId, patientId: a.patientId, values: i.values, field: a.field });
}

/**
 * Add at Send (the owner's answer of 29 Sep 2026): a new patient's record is
 * made when they press Send, as the person who made the link, unless someone
 * on file looks like them (the same name and birth date, or the same mobile)
 * or the intake was started from a visit — then it waits for the desk (Screen
 * F). Null when it waits; never throws for a look-alike.
 */
export async function addAtSend(tx: Tx, a: { clinicId: string; intakeId: string }): Promise<AddOutcome | null> {
  const i = (await tx.query<IntakeRow>('select * from intake where id = $1', [a.intakeId])).rows[0];
  if (!i || i.status !== 'sent' || i.target !== 'new') return null;
  const maker = (await tx.query<{ created_by: string }>(
    `select created_by from intake_link where intake_id = $1 order by created_at desc limit 1`, [i.id])).rows[0]?.created_by ?? i.created_by;
  if (!(await canEditRecords(tx, maker, a.clinicId))) return null;
  const it = (await loadIntake(tx, i.id))!;
  if ((await intakeLookAlikes(tx, it)).length) return null;
  return addIntake(tx, { clinicId: a.clinicId, staffId: maker, intakeId: i.id, rev: null, as: 'new', seen: [] });
}

// ---------------------------------------------------------------------------
// Clinic tablets (Clinic settings → Clinic tablets)
// ---------------------------------------------------------------------------
export const TABLET_NAME_MAX = 40;

/** Why "Make this device a clinic tablet" was refused, as a word /auth/tablet/ carries back to Settings (?tablet_refused=). */
export type TabletRefusal = 'name' | 'long' | 'taken' | 'allowed' | 'wait';
export const TABLET_REFUSED: Record<TabletRefusal, string> = {
  name: 'Give the tablet a name, like “Tablet 1” or “Front desk tablet”.',
  long: `Keep the name under ${TABLET_NAME_MAX} characters.`,
  taken: 'A tablet here has that name already. Choose another name.',
  allowed: 'Your account cannot change the clinic’s settings. Ask the owner.',
  wait: 'Too many at once. Wait a moment and try again.',
};
const refuseTablet = (code: TabletRefusal) => new Refused<{ code: TabletRefusal }>(TABLET_REFUSED[code], { code });

/** Make this browser a clinic tablet: a new secret, kept hashed. Needs settings.edit (/auth/tablet/ checks can(); the trigger nothing). Audit tablet.add. */
export async function registerTablet(tx: Tx, a: { clinicId: string; staffId: string; name: string }): Promise<{ id: string; secret: string }> {
  const name = a.name.replace(/\s+/g, ' ').trim().normalize('NFC');
  if (!name) throw refuseTablet('name');
  if (name.length > TABLET_NAME_MAX) throw refuseTablet('long');
  const taken = (await tx.query('select 1 from clinic_tablet where retired_at is null and lower(name) = lower($1)', [name])).rowCount;
  if (taken) throw refuseTablet('taken');
  const secret = newDeviceSecret();
  const id = (await tx.query<{ id: string }>(
    'insert into clinic_tablet (clinic_id, name, secret_sha256, created_by) values ($1, $2, $3, $4) returning id',
    [a.clinicId, name, secretHash(secret), a.staffId])).rows[0].id;
  await audit(tx, a.clinicId, a.staffId, 'tablet.add', 'clinic_tablet', id);
  return { id, secret };
}

/** Remove a tablet: it stops being one on its next poll, and its live link retires. Audit tablet.remove. */
export async function removeTablet(tx: Tx, a: { clinicId: string; staffId: string; tabletId: string }): Promise<string> {
  const t = (await tx.query<{ id: string; name: string }>(
    'select id, name from clinic_tablet where id = $1 and retired_at is null for update', [isUuid(a.tabletId) ? a.tabletId : null])).rows[0];
  if (!t) throw new Refused('That tablet was removed already.');
  await tx.query(`update intake_link set retired_at = now(), retired_why = 'stopped' where tablet_id = $1 and retired_at is null`, [t.id]);
  await tx.query('update clinic_tablet set retired_at = now(), retired_by = $2 where id = $1', [t.id, a.staffId]);
  await audit(tx, a.clinicId, a.staffId, 'tablet.remove', 'clinic_tablet', t.id);
  return t.name;
}

/** Rename a tablet. Audit tablet.rename. */
export async function renameTablet(tx: Tx, a: { clinicId: string; staffId: string; tabletId: string; name: string }): Promise<void> {
  const name = a.name.replace(/\s+/g, ' ').trim().normalize('NFC');
  if (!name) throw new Refused('Give the tablet a name.');
  if (name.length > TABLET_NAME_MAX) throw new Refused(`Keep the name under ${TABLET_NAME_MAX} characters.`);
  const t = (await tx.query<{ id: string }>('select id from clinic_tablet where id = $1 and retired_at is null for update', [isUuid(a.tabletId) ? a.tabletId : null])).rows[0];
  if (!t) throw new Refused('That tablet was removed.');
  const taken = (await tx.query('select 1 from clinic_tablet where retired_at is null and lower(name) = lower($1) and id <> $2', [name, t.id])).rowCount;
  if (taken) throw new Refused(`A tablet here is called “${name}” already.`);
  await tx.query('update clinic_tablet set name = $2 where id = $1', [t.id, name]);
  await audit(tx, a.clinicId, a.staffId, 'tablet.rename', 'clinic_tablet', t.id);
}

// ---------------------------------------------------------------------------
// The clinic's part as inputs (steps 2 and Explain and confirm)
// ---------------------------------------------------------------------------
/** A form's stored fields as the inputs post them (readClinicPart's names): what the page draws before anything is typed. */
export function rawFromFields(t: Template, fields: Fields): RawPart {
  const raw: Record<string, string | string[]> = {};
  const pesos = (c: number) => (c % 100 ? (c / 100).toFixed(2) : String(c / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  for (const f of t.clinicFields) {
    const v = fields[f.name];
    if (v === null || v === undefined) continue;
    switch (f.kind) {
      case 'teeth': raw[f.name] = (v as number[]).join(', '); break;
      case 'choice': if (typeof v === 'object' && v && 'other' in v) { raw[f.name] = 'other'; raw[`${f.name}_other`] = (v as { other: string }).other; } else raw[f.name] = String(v); break;
      case 'choices': raw[f.name] = (v as string[]).map(String); break;
      case 'range': raw[`${f.name}_from`] = String((v as { from: number }).from); raw[`${f.name}_to`] = String((v as { to: number }).to); break;
      case 'money': {
        const m = v as { kind: string; from?: number; to?: number; includes?: string };
        raw[`${f.name}_kind`] = m.kind;
        if (m.from !== undefined) raw[`${f.name}_from`] = pesos(m.from);
        if (m.to !== undefined) raw[`${f.name}_to`] = pesos(m.to);
        if (m.includes) raw[`${f.name}_includes`] = m.includes;
        break;
      }
      default: raw[f.name] = String(v);
    }
  }
  return raw;
}

/** What was posted for one form: every name under `<prefix>`, the prefix taken off (several values kept as a list). */
export function rawFromForm(form: FormData, prefix: string): RawPart {
  const raw: Record<string, string | string[]> = {};
  for (const [k, v] of form.entries()) {
    if (!k.startsWith(prefix) || typeof v !== 'string') continue;
    const name = k.slice(prefix.length);
    const had = raw[name];
    raw[name] = had === undefined ? v : Array.isArray(had) ? [...had, v] : [had, v];
  }
  return raw;
}
