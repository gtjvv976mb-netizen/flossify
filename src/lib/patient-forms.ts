// The patient forms, on the server: the clinic's forms link (the QR code on
// its desk), the patient's submit, and the desk's queue — "New patient
// forms" — where a form becomes a patient. The questions, the reading and
// checking of a post, and the labelled answers are patient-forms-def.ts,
// re-exported from here; pages on the server import this file.
//
// Pages:
//   /f/<key>/                          the public forms (lookupForms, parsePatientForm, submitForms)
//   /c/<slug>/patients/qr/             the poster (formsKey, newFormsKey; src/lib/qr.ts)
//   /c/<slug>/patients/forms/          the queue (listForms, countNewForms)
//   /c/<slug>/patients/forms/<id>/     one form (getForm, likelyMatches, addAsNewPatient, addToPatient, dismissForm, restoreForm)
//   the patient record                 "Patient forms" (patientForms, getForm)
//
// Rules kept:
// - The public side has no tenant. It reads and writes only through the
//   definer functions patient_forms_clinic(key) and patient_form_submit(key,
//   nonce, answers) (028): the clinic comes from the key, never from the page.
//   A retired key opens a "replaced" page and accepts nothing.
// - Throttled: per address and poster, per mobile, per poster, and links that
//   do not exist per address (LIMITS.forms in src/lib/throttle.ts; an IPv6
//   address counts by its /64). A real poster's link always opens: only links
//   that do not exist wait.
// - Closed on a production server until the privacy notice in force names
//   what the forms collect (FORMS_PRIVACY_VERSIONS): the patient agrees to
//   that notice, and consent to sensitive personal information must be
//   informed (Data Privacy Act, s. 13(a)).
// - A form is not a patient. It waits (status 'new') until someone who can
//   edit records at the branch (canEditRecords, as Add patient) adds it — as
//   a new patient or to one on file — or dismisses it. A form nobody added is
//   deleted 30 days after it was sent (retention_purge(), 028).
// - Every workspace function takes the caller's withClinic() transaction, so
//   row-level security decides what exists. Rows are locked before they are
//   changed (the form, the patient), and a new patient takes the clinic's lock
//   (lockClinic) like Add patient, for the chart number.
// - Adding a form to a patient on file fills only what is empty on the
//   record and never changes a name; what differs is returned for the page to
//   show ("kept"), and the desk can take one detail at a time from the form
//   (useFormDetail). A mobile or an email is never copied without the desk
//   ticking it (the person at the desk is checked first): /me/ finds visits
//   by mobile. Allergies, conditions and medicines already on file stay in the
//   new health version: something the patient did not tick is not evidence it
//   is gone. The version is dated when it is added (answered_at now), so it is
//   the current one; when the form was sent is in its answers (form.submitted_at).
// - Nothing here logs an answer, and nothing puts one in a URL.

import { randomBytes, randomInt } from 'node:crypto';
import { publicRead, withClinic, type Tx } from './db';
import { hit, LIMITS, waitText, ipBucket } from './throttle';
import { isProduction } from './env';
import { lockClinic, nextChartNos, nameKey } from './import';
import { canEditRecords, isMinor, type HealthAnswers } from './health';
import { prettyPhone } from './messages';
import {
  KEY_ALPHABET, KEY_LENGTH, MAX_POST_BYTES, PUBLIC_ORIGIN, TREATMENT_CONSENT, FIELDS, cleanKey, formsUrl, formsShort, formName, healthLists, hmoName,
  stepAnswers, answerText, type PatientFormValues, type SignedAs,
} from './patient-forms-def';

export * from './patient-forms-def';

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------
/** A new forms key: ten characters from KEY_ALPHABET, uniformly (crypto). About 49 bits. */
export function newKey(): string {
  let k = '';
  for (let i = 0; i < KEY_LENGTH; i++) k += KEY_ALPHABET[randomInt(KEY_ALPHABET.length)];
  return k;
}

/** The form's own token, for NONCE_FIELD: 24 URL-safe characters. A new one each time the empty form is drawn. */
export const newNonce = (): string => randomBytes(18).toString('base64url');

/**
 * The posted form, or null when the post is larger than `max` bytes (or not a
 * form). Reads the body with a cap instead of trusting Content-Length alone.
 */
export async function readCappedForm(request: Request, max = MAX_POST_BYTES): Promise<FormData | null> {
  const type = request.headers.get('content-type') ?? '';
  if (!/^(application\/x-www-form-urlencoded|multipart\/form-data)\b/i.test(type)) return null;
  const declared = Number(request.headers.get('content-length') ?? '');
  if (Number.isFinite(declared) && declared > max) return null;
  if (!request.body) return new FormData();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) { await reader.cancel().catch(() => {}); return null; }
    chunks.push(value);
  }
  try {
    return await new Response(Buffer.concat(chunks), { headers: { 'content-type': type } }).formData();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// The public side
// ---------------------------------------------------------------------------
/** What the public page shows of the clinic: its room (photoKeys, id for photoUrl), its name, where, how to call. */
export interface FormsClinic {
  id: string; name: string; slug: string; area: string | null; city: string | null; phone: string | null;
  photoKeys: string[];
  /** On Find a clinic: only then may the page link to /find/<slug>/. */
  listed: boolean;
  /** The group's Data Protection Officer, when named (Settings → Privacy). Null on a replaced key. */
  dpoName: string | null;
}

export interface ConsentInForce {
  /** The privacy notice in force (/privacy/). */
  privacy: { id: string; title: string; summary: string };
  /** The consent to examination and treatment in force, with its words (TREATMENT_CONSENT). */
  treatment: { id: string; title: string; points: readonly { head: string; body: string }[]; tick: string };
}

export type FormsDoor =
  /** The forms can be filled in. `key` is the clean key: post back to /f/<key>/. */
  | { status: 'open'; key: string; clinic: FormsClinic; consent: ConsentInForce }
  /** An old poster: "This QR code has been replaced. Ask the desk for the new one." Nothing to fill in. */
  | { status: 'replaced'; clinic: FormsClinic }
  /** The clinic's forms exist, but no consent wording is in force that this server has words for. Say "ask the desk". */
  | { status: 'unavailable'; clinic: FormsClinic }
  /** No such link (or the clinic is closed). A 404 page. */
  | { status: 'unknown' }
  /** Too many links that do not exist from this address (a real poster's link is never refused this way). */
  | { status: 'wait'; retryAfter: number; message: string };

/**
 * The privacy notice versions (consent_version kind 'privacy') that name what
 * the patient forms collect — the health and dental history, the home
 * address, the emergency contact and a parent's details, Facebook, the
 * PhilHealth PIN and HMO card — why, who sees it, and that a form nobody adds
 * is deleted after FORM_KEEP_DAYS days. privacy-2026-09 does not. On a
 * production server the forms open only while one of these is the notice in
 * force (lookupForms answers 'unavailable', submitForms 'closed'); on a
 * development machine they always open. Publishing one is one change: the new
 * consent_version row (a migration), /privacy/'s words and its hard-coded
 * version, and its id here, after the owner's lawyer has read it.
 */
export const FORMS_PRIVACY_VERSIONS: readonly string[] = [];

/** May the forms be filled in under this privacy notice? Always on a development machine. */
export const formsNoticeReady = (privacyVersion: string | null | undefined): boolean =>
  !isProduction() || (!!privacyVersion && FORMS_PRIVACY_VERSIONS.includes(privacyVersion));

type ClinicRow = {
  status: string; clinic_id: string; name: string; slug: string; area: string | null; city: string | null; phone: string | null; photo_keys: string[] | null;
  listed: boolean; dpo_name: string | null; privacy_version: string | null; privacy_title: string | null; privacy_summary: string | null;
  treatment_version: string | null; treatment_title: string | null;
};

const missKey = (ip: string) => `forms:miss:${ipBucket(ip)}`;

/**
 * What a forms link opens. `ip` is clientIp(Astro). A link that does not
 * exist counts against the address; past LIMITS.forms.miss such links answer
 * 'wait' for a while. A link that exists always opens, whatever else was
 * tried from the same address: a clinic's Wi-Fi and a carrier's shared
 * address (CGNAT) are many patients, and one of them must not lock out the
 * rest. Guessing is no way in anyway: a key is one of 31^10 (about 49 bits).
 */
export async function lookupForms(rawKey: unknown, ip: string): Promise<FormsDoor> {
  const key = cleanKey(rawKey);
  const row = key ? (await publicRead<ClinicRow>('select * from patient_forms_clinic($1)', [key]))[0] : undefined;
  if (!key || !row || row.status === 'unknown') {
    const miss = await hit(missKey(ip), ...LIMITS.forms.miss);
    if (!miss.allowed) return { status: 'wait', retryAfter: miss.retryAfter, message: `Too many tries from here. ${waitText(miss.retryAfter)}` };
    return { status: 'unknown' };
  }
  const clinic: FormsClinic = {
    id: row.clinic_id, name: row.name, slug: row.slug, area: row.area, city: row.city, phone: row.phone,
    photoKeys: row.photo_keys ?? [], listed: row.listed, dpoName: row.dpo_name,
  };
  if (row.status === 'replaced') return { status: 'replaced', clinic };
  const words = row.treatment_version ? TREATMENT_CONSENT[row.treatment_version] : undefined;
  if (!row.privacy_version || !row.privacy_title || !row.privacy_summary || !row.treatment_version || !words) return { status: 'unavailable', clinic };
  if (!formsNoticeReady(row.privacy_version)) return { status: 'unavailable', clinic };
  return {
    status: 'open', key, clinic,
    consent: {
      privacy: { id: row.privacy_version, title: row.privacy_title, summary: row.privacy_summary },
      treatment: { id: row.treatment_version, title: words.title, points: words.points, tick: words.tick },
    },
  };
}

export type SubmitResult =
  /**
   * Saved. Show the done screen with the ref: signed by the patient, "Thank you, <firstName>. Please
   * tell the desk your forms are in."; by a parent or guardian, "Thank you. Please tell the desk
   * <firstName>'s forms are in." (doneWords).
   */
  | { kind: 'saved'; ref: string; firstName: string; signedAs: SignedAs }
  /** This very form was already sent (a refresh, a second tap): the same done screen, the same ref, as it was stored. */
  | { kind: 'again'; ref: string; firstName: string; signedAs: SignedAs }
  /** The consent wording in force changed while they filled in: draw the form again on the consent step (lookupForms again). */
  | { kind: 'changed' }
  /**
   * The form's token was already used for other answers (a page brought back from the browser's
   * history and filled in again): nothing saved. Draw the form again with a new nonce (newNonce())
   * and the answers as typed, and ask for Send once more (SUBMIT_WORDS.resend).
   */
  | { kind: 'resend' }
  /** 'closed': the forms are not open on this server (formsNoticeReady). */
  | { kind: 'replaced' | 'unknown' | 'full' | 'invalid' | 'closed' }
  | { kind: 'wait'; message: string };

/** The done screen's two lines. A parent or guardian is thanked, and told whose forms to mention. */
export const doneWords = (firstName: string, signedAs: SignedAs): { title: string; lead: string } =>
  signedAs === 'guardian'
    ? { title: 'Thank you.', lead: `Please tell the desk ${firstName}’s forms are in.` }
    : { title: `Thank you, ${firstName}.`, lead: 'Please tell the desk your forms are in.' };

/** The sentence for each result that is not a done screen. */
export const SUBMIT_WORDS: Record<'changed' | 'resend' | 'replaced' | 'unknown' | 'full' | 'invalid' | 'closed', string> = {
  changed: 'The consent wording was updated while you were filling in. Read it again, and tick it again.',
  resend: 'This page was used to send forms before, so these answers were not sent yet. Check them, then press Send my forms once more.',
  closed: 'The forms are not open just now, so yours were not sent. Please ask the desk for a paper form.',
  replaced: 'This QR code has been replaced by a new one. Your answers were not sent: ask the desk for the new code.',
  unknown: 'This link does not open any clinic’s forms. Check it, or ask the desk.',
  full: 'The clinic has a lot of forms waiting just now, so yours was not sent. Please ask the desk for a paper form.',
  invalid: 'Something in the form did not look right, so it was not sent. Check it and send it again, or ask the desk for help.',
};

/**
 * Send a checked form (parsePatientForm's value) through the key. Counts one
 * hit per address, per mobile and per poster first. Never logs the answers.
 */
export async function submitForms(a: { key: string; nonce: string; value: PatientFormValues; ip: string }): Promise<SubmitResult> {
  if (!formsNoticeReady(a.value.privacy_version)) return { kind: 'closed' };
  // Per address and poster: one busy carrier address is not every clinic's limit.
  const byIp = await hit(`forms:ip:${a.key}:${ipBucket(a.ip)}`, ...LIMITS.forms.ip);
  if (!byIp.allowed) return { kind: 'wait', message: `Too many forms from this connection just now. ${waitText(byIp.retryAfter)} Or ask the desk for a paper form.` };
  const byPhone = await hit(`forms:p:${a.value.mobile}`, ...LIMITS.forms.phone);
  if (!byPhone.allowed) return { kind: 'wait', message: 'Too many forms for this mobile number today. Please ask the desk for help.' };
  const byKey = await hit(`forms:k:${a.key}`, ...LIMITS.forms.key);
  if (!byKey.allowed) return { kind: 'full' };
  const r = (await publicRead<{ status: string; ref: string | null; first_name: string | null; signed_as: string | null }>(
    'select status, ref, first_name, signed_as from patient_form_submit($1, $2, $3::jsonb)', [a.key, a.nonce, JSON.stringify(a.value)]))[0];
  switch (r?.status) {
    case 'saved': case 'again':
      return { kind: r.status, ref: r.ref!, firstName: r.first_name ?? a.value.first_name, signedAs: r.signed_as === 'guardian' ? 'guardian' : 'patient' };
    case 'resend': case 'changed': case 'replaced': case 'unknown': case 'full': return { kind: r.status };
    default: return { kind: 'invalid' };
  }
}

// ---------------------------------------------------------------------------
// The workspace: the key
// ---------------------------------------------------------------------------
export interface FormsKey {
  key: string;
  /** What the QR code holds: https://flossify.ph/f/<key>/ (or `origin`'s). */
  url: string;
  /** Printed under the code: flossify.ph/f/<key>. */
  short: string;
  createdAt: Date;
}

const keyOut = (key: string, createdAt: Date, origin?: string): FormsKey => ({
  key, url: formsUrl(key, origin ?? PUBLIC_ORIGIN), short: formsShort(key, new URL(origin ?? PUBLIC_ORIGIN).host), createdAt,
});

/**
 * The clinic's forms key, made the first time it is asked for. `origin`
 * (default https://flossify.ph) is only where the url points: pass
 * Astro.url.origin in development to scan the poster against this machine.
 */
export async function formsKey(tx: Tx, a: { clinicId: string; staffId: string; origin?: string }): Promise<FormsKey> {
  for (let i = 0; i < 6; i++) {
    const live = (await tx.query<{ key: string; created_at: Date }>(
      'select key, created_at from clinic_forms_key where clinic_id = $1 and retired_at is null', [a.clinicId])).rows[0];
    if (live) return keyOut(live.key, live.created_at, a.origin);
    // Nobody has one yet; a key taken elsewhere (vanishingly rare) or a colleague's at the same moment: look again.
    await tx.query(
      'insert into clinic_forms_key (key, clinic_id, created_by) values ($1, $2, $3) on conflict do nothing', [newKey(), a.clinicId, a.staffId]);
  }
  throw new Error('formsKey: could not make a key');
}

/**
 * "Make a new QR code": retire the clinic's key (old posters then say they
 * were replaced and accept nothing) and make another. Audit forms.key_new.
 * Null, and nothing changed, for someone who cannot edit records here
 * (canEditRecords: the permission Add patient asks).
 */
export async function newFormsKey(tx: Tx, a: { clinicId: string; staffId: string; origin?: string }): Promise<FormsKey | null> {
  if (!(await canEditRecords(tx, a.staffId, a.clinicId))) return null;
  await lockClinic(tx, a.clinicId);
  await tx.query('update clinic_forms_key set retired_at = now(), retired_by = $2 where clinic_id = $1 and retired_at is null', [a.clinicId, a.staffId]);
  for (let i = 0; i < 6; i++) {
    const made = (await tx.query<{ key: string; created_at: Date }>(
      'insert into clinic_forms_key (key, clinic_id, created_by) values ($1, $2, $3) on conflict do nothing returning key, created_at',
      [newKey(), a.clinicId, a.staffId])).rows[0];
    if (made) {
      await tx.query(`insert into audit_log (clinic_id, staff_id, action, entity, entity_id) values ($1, $2, 'forms.key_new', 'clinic', $1)`, [a.clinicId, a.staffId]);
      return keyOut(made.key, made.created_at, a.origin);
    }
  }
  throw new Error('newFormsKey: could not make a key');
}

// ---------------------------------------------------------------------------
// The workspace: the queue
// ---------------------------------------------------------------------------
export type FormStatus = 'new' | 'added' | 'dismissed';
export const FORM_STATUS_WORDS: Record<FormStatus, string> = { new: 'New', added: 'Added', dismissed: 'Dismissed' };
/** Days a form nobody added is kept (retention_purge(), 028). */
export const FORM_KEEP_DAYS = 30;

/** How many forms are waiting (status 'new'). Inside withClinic(). */
export async function countNewForms(tx: Tx): Promise<number> {
  return (await tx.query<{ n: number }>(`select count(*)::int as n from patient_form where status = 'new'`)).rows[0]?.n ?? 0;
}

/** The same count for a layout or tab: its own transaction, and never breaks the page (null when it cannot be read). */
export async function newFormsWaiting(clinicId: string): Promise<number | null> {
  try {
    return await withClinic(clinicId, countNewForms);
  } catch (e) {
    console.error('patient forms: could not count', (e as Error).message);
    return null;
  }
}

export interface FormRow {
  id: string; ref: string; status: FormStatus; submittedAt: Date;
  /** "Maria Clara Santos Jr." as the form has it. */
  name: string;
  birthDate: string;
  /** Whole years on the day it was sent. */
  age: number | null;
  minor: boolean;
  /** 0917 555 0142. */
  mobile: string;
  signedAs: SignedAs; signedByName: string;
  /** Patients on file who may be this person (likelyMatches), counted. */
  likely: number;
  /** When added: the patient, and the chart number. */
  patientId: string | null; patientName: string | null; chartNo: string | null;
  decidedAt: Date | null; decidedByName: string | null;
  /** When a form not added will be deleted. Null once added. */
  deleteOn: Date | null;
  /** Sent through a QR code the clinic has since replaced (a flood of junk is usually all this). */
  viaOldCode: boolean;
}

type Candidate = { id: string; chart_no: string; first_name: string; last_name: string; suffix: string | null; birth: string | null; phone: string | null };
const digits10 = (s: string | null) => (s ?? '').replace(/\D/g, '').slice(-10);

/** Candidates on file for several forms at once: the same last ten digits of a mobile, or the same birth date. */
async function candidates(tx: Tx, forms: { phone: string; birth: string }[]): Promise<Candidate[]> {
  if (!forms.length) return [];
  return (await tx.query<Candidate>(
    `select p.id, p.chart_no, p.first_name, p.last_name, p.suffix, to_char(p.birth_date, 'YYYY-MM-DD') as birth, p.phone
       from patient p
      where p.archived_at is null
        and (right(regexp_replace(coalesce(p.phone, ''), '\\D', '', 'g'), 10) = any($1::text[]) or p.birth_date = any($2::date[]))
      order by p.last_name, p.first_name
      limit 500`,
    [[...new Set(forms.map((f) => digits10(f.phone)))], [...new Set(forms.map((f) => f.birth))]])).rows;
}

type Why = 'mobile' | 'name-birth';
const score = (why: Why[]) => (why.includes('name-birth') ? 2 : 0) + (why.includes('mobile') ? 1 : 0);
const whyFor = (p: Candidate, f: { first: string; last: string; birth: string; phone: string }): Why[] => {
  const out: Why[] = [];
  if (p.phone && digits10(p.phone) === digits10(f.phone) && digits10(f.phone).length === 10) out.push('mobile');
  if (p.birth === f.birth && nameKey(p.first_name, p.last_name) === nameKey(f.first, f.last)) out.push('name-birth');
  return out;
};

/** The queue, newest first. `status` 'new' by default; 'all' for every form still kept. At most `limit` (100). */
export async function listForms(tx: Tx, opts: { status?: FormStatus | 'all'; limit?: number } = {}): Promise<FormRow[]> {
  const status = opts.status ?? 'new';
  const limit = Math.min(Math.max(1, opts.limit ?? 100), 200);
  const { rows } = await tx.query(
    `select f.id, f.ref, f.status, f.submitted_at, f.first_name, f.last_name, f.answers ->> 'middle_name' as middle_name, f.answers ->> 'suffix' as suffix,
            to_char(f.birth_date, 'YYYY-MM-DD') as birth, f.phone, f.signed_as, f.signed_by_name, f.patient_id, f.decided_at,
            extract(year from age((f.submitted_at at time zone 'Asia/Manila')::date, f.birth_date))::int as age,
            concat_ws(' ', p.first_name, p.last_name, p.suffix) as patient_name, p.chart_no, s.full_name as decided_by_name,
            k.retired_at is not null as via_old_code
       from patient_form f
       left join patient p on p.id = f.patient_id
       left join staff s on s.id = f.decided_by
       left join clinic_forms_key k on k.key = f.forms_key
      where ($1 = 'all' or f.status = $1)
      order by f.submitted_at desc
      limit $2`, [status, limit]);
  const cands = await candidates(tx, rows.map((r) => ({ phone: r.phone, birth: r.birth })));
  return rows.map((r) => ({
    id: r.id, ref: r.ref, status: r.status, submittedAt: r.submitted_at,
    name: formName({ first_name: r.first_name, middle_name: r.middle_name, last_name: r.last_name, suffix: r.suffix }),
    birthDate: r.birth, age: r.age, minor: r.age !== null && r.age < 18, mobile: prettyPhone(r.phone),
    signedAs: r.signed_as, signedByName: r.signed_by_name,
    likely: r.status === 'added' ? 0 : cands.filter((p) => whyFor(p, { first: r.first_name, last: r.last_name, birth: r.birth, phone: r.phone }).length).length,
    patientId: r.patient_id, patientName: r.patient_name || null, chartNo: r.chart_no ?? null,
    decidedAt: r.decided_at, decidedByName: r.decided_by_name ?? null,
    deleteOn: r.status === 'added' ? null : new Date(new Date(r.submitted_at).getTime() + FORM_KEEP_DAYS * 86_400_000),
    viaOldCode: !!r.via_old_code,
  }));
}

export interface FormRecord extends Omit<FormRow, 'likely' | 'viaOldCode'> {
  /** Every answer, typed. Label them with answerSections(values). */
  values: PatientFormValues;
  formVersion: string;
  privacyVersion: string; treatmentVersion: string;
  addedAs: 'new' | 'existing' | null;
}

/** One form, whatever its status. Null when it is not this clinic's, or was deleted. */
export async function getForm(tx: Tx, id: string): Promise<FormRecord | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;
  const r = (await tx.query(
    `select f.*, to_char(f.birth_date, 'YYYY-MM-DD') as birth,
            extract(year from age((f.submitted_at at time zone 'Asia/Manila')::date, f.birth_date))::int as age,
            concat_ws(' ', p.first_name, p.last_name, p.suffix) as patient_name, p.chart_no as patient_chart, s.full_name as decided_by_name
       from patient_form f left join patient p on p.id = f.patient_id left join staff s on s.id = f.decided_by
      where f.id = $1`, [id])).rows[0];
  if (!r) return null;
  const values = r.answers as PatientFormValues;
  return {
    id: r.id, ref: r.ref, status: r.status, submittedAt: r.submitted_at, name: formName(values), birthDate: r.birth, age: r.age,
    minor: r.age !== null && r.age < 18, mobile: prettyPhone(r.phone), signedAs: r.signed_as, signedByName: r.signed_by_name,
    patientId: r.patient_id, patientName: r.patient_name || null, chartNo: r.patient_chart ?? null,
    decidedAt: r.decided_at, decidedByName: r.decided_by_name ?? null,
    deleteOn: r.status === 'added' ? null : new Date(new Date(r.submitted_at).getTime() + FORM_KEEP_DAYS * 86_400_000),
    values, formVersion: r.form_version, privacyVersion: r.privacy_version, treatmentVersion: r.treatment_version, addedAs: r.added_as,
  };
}

export interface LikelyMatch {
  id: string; chartNo: string;
  /** "Maria Santos Jr." as on file. */
  name: string;
  birth: string | null;
  /** 0917 555 0142, or null. */
  phone: string | null;
  /** Why it may be them: the same mobile, and/or the same name and birth date. Families share a mobile: 'mobile' alone may be a relative. */
  why: Why[];
  /** The newest health answers on file (null: never asked), to compare with the form's. */
  health: HealthAnswers | null;
}

/**
 * Patients on file who may be the person on this form: the same mobile, or
 * the same name and birth date. The strongest first (both), at most five.
 */
export async function likelyMatches(tx: Tx, f: Pick<PatientFormValues, 'first_name' | 'last_name' | 'birth_date' | 'mobile'>): Promise<LikelyMatch[]> {
  const cands = await candidates(tx, [{ phone: f.mobile, birth: f.birth_date }]);
  const hits = cands
    .map((p) => ({ p, why: whyFor(p, { first: f.first_name, last: f.last_name, birth: f.birth_date, phone: f.mobile }) }))
    .filter((x) => x.why.length)
    // Both first, then the same name and birth date, then the same mobile (often a relative).
    .sort((a, b) => score(b.why) - score(a.why))
    .slice(0, 5);
  if (!hits.length) return [];
  const health = new Map((await tx.query<{ patient_id: string } & HealthAnswers>(
    `select distinct on (h.patient_id) h.patient_id, h.allergies, h.conditions, h.medications, h.note
       from medical_history h where h.patient_id = any($1::uuid[]) order by h.patient_id, h.answered_at desc, h.id desc`,
    [hits.map((x) => x.p.id)])).rows.map((r) => [r.patient_id, { allergies: r.allergies, conditions: r.conditions, medications: r.medications, note: r.note }]));
  return hits.map(({ p, why }) => ({
    id: p.id, chartNo: p.chart_no, name: [p.first_name, p.last_name, p.suffix].filter(Boolean).join(' '), birth: p.birth,
    phone: p.phone ? prettyPhone(p.phone) : null, why, health: health.get(p.id) ?? null,
  }));
}

// ---------------------------------------------------------------------------
// The workspace: adding a form to the records
// ---------------------------------------------------------------------------
type Locked = { id: string; ref: string; status: FormStatus; answers: PatientFormValues; submitted_at: Date; signed_by_name: string; signed_as: SignedAs; privacy_version: string; treatment_version: string };

/** The form, locked, while it can still be added (new, or dismissed and still kept). */
async function lockForm(tx: Tx, formId: string): Promise<Locked | null> {
  if (!/^[0-9a-f-]{36}$/i.test(formId)) return null;
  return (await tx.query<Locked>(
    `select id, ref, status, answers, submitted_at, signed_by_name, signed_as, privacy_version, treatment_version
       from patient_form where id = $1 and status in ('new', 'dismissed') for update`, [formId])).rows[0] ?? null;
}

const audit = (tx: Tx, clinicId: string, staffId: string, action: string, entity: string, id: string) =>
  tx.query('insert into audit_log (clinic_id, staff_id, action, entity, entity_id) values ($1, $2, $3, $4, $5)', [clinicId, staffId, action, entity, id]);

const manilaDay = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

/** What goes into the health version's `answers`: the rest of the form, and which form it was. */
function historyAnswers(f: Locked, birthChange: { from: string | null; to: string } | null): Record<string, unknown> {
  const v = f.answers;
  return {
    form: { id: f.id, ref: f.ref, version: v.v, submitted_at: f.submitted_at },
    health: stepAnswers(v, 'health'),
    teeth: stepAnswers(v, 'teeth'),
    cards: stepAnswers(v, 'cards'),
    emergency: { name: v.emergency_name, relation: v.emergency_relation, mobile: v.emergency_mobile },
    facebook: v.facebook, civil_status: v.civil_status,
    ...(birthChange ? { birth_date: birthChange } : {}),
  };
}

export type ConsentOutcome = 'saved' | 'already' | 'minor';

/**
 * The two consents from the form, as patient_consent rows (channel 'form',
 * given when the form was sent, by the name typed as its signature, as the
 * patient or a parent or guardian, recorded by the person adding it). One per
 * version per patient, as at the desk: 'already' when the patient has one
 * for that version, unless this one is a parent's or guardian's and theirs is
 * not. 'minor': the birth date on the record makes the patient under 18 on
 * the day it was signed and the patient signed: nothing is written.
 */
async function writeConsents(tx: Tx, a: { clinicId: string; staffId: string; patientId: string; f: Locked; birthOnFile: string | null }):
  Promise<{ privacy: ConsentOutcome; treatment: ConsentOutcome }> {
  const signedDay = manilaDay(new Date(a.f.submitted_at));
  if (a.f.signed_as === 'patient' && isMinor(a.birthOnFile, signedDay)) return { privacy: 'minor', treatment: 'minor' };
  const one = async (version: string): Promise<ConsentOutcome> => {
    const had = (await tx.query<{ agreed_as: string | null }>(
      'select agreed_as from patient_consent where patient_id = $1 and version_id = $2', [a.patientId, version])).rows;
    const addsGuardian = a.f.signed_as === 'guardian' && !had.some((r) => r.agreed_as === 'guardian');
    if (had.length && !addsGuardian) return 'already';
    await tx.query(
      `insert into patient_consent (clinic_id, patient_id, version_id, given_at, channel, given_by_name, recorded_by, agreed_as, form_id)
       values ($1, $2, $3, $4, 'form', $5, $6, $7, $8)`,
      [a.clinicId, a.patientId, version, a.f.submitted_at, a.f.signed_by_name, a.staffId, a.f.signed_as, a.f.id]);
    return 'saved';
  };
  const out = { privacy: await one(a.f.privacy_version), treatment: await one(a.f.treatment_version) };
  if (out.privacy === 'saved' || out.treatment === 'saved') await audit(tx, a.clinicId, a.staffId, 'consent.form', 'patient', a.patientId);
  return out;
}

export type AddNewResult =
  | { kind: 'added'; patientId: string; chartNo: string; consents: { privacy: ConsentOutcome; treatment: ConsentOutcome } }
  /** People on file who may be this person and were not on the page the desk saw: show them and ask again (pass their ids in `seen`). */
  | { kind: 'matches'; matches: LikelyMatch[] }
  /** Already added (by someone else just now), or deleted. Nothing written. */
  | { kind: 'gone' }
  | { kind: 'not-allowed' };

/**
 * "Add as a new patient". `seen` is the ids of the likely matches the page
 * showed: a match not among them stops the add and comes back to be shown.
 * Writes the patient (the next free P- chart number), a health version
 * answered by the patient (medical_history, answered_by 'patient', form_id,
 * answered_at = now, when it goes on the record; the sending time is in its
 * answers), the two consents, and marks the form added. Audit patient.create,
 * health.update, consent.form, forms.add.
 */
export async function addAsNewPatient(tx: Tx, a: { clinicId: string; staffId: string; formId: string; seen?: string[] }): Promise<AddNewResult> {
  if (!(await canEditRecords(tx, a.staffId, a.clinicId))) return { kind: 'not-allowed' };
  await lockClinic(tx, a.clinicId);
  const f = await lockForm(tx, a.formId);
  if (!f) return { kind: 'gone' };
  const v = f.answers;
  const matches = await likelyMatches(tx, v);
  const seen = new Set(a.seen ?? []);
  if (matches.some((m) => !seen.has(m.id))) return { kind: 'matches', matches };

  const chartNo = nextChartNos((await tx.query<{ chart_no: string }>('select chart_no from patient')).rows.map((r) => r.chart_no), 1)[0];
  const minorForm = v.guardian_name !== null;
  const patientId = (await tx.query<{ id: string }>(
    `insert into patient (clinic_id, chart_no, first_name, middle_name, last_name, suffix, birth_date, sex, phone, email, address_line, city, province, occupation,
                          guardian_name, guardian_relation, guardian_phone, hmo_name, hmo_member_no, emergency_name, emergency_relation, emergency_phone, created_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
     returning id`,
    [a.clinicId, chartNo, v.first_name, v.middle_name, v.last_name, v.suffix, v.birth_date, v.sex, v.mobile, v.email, v.address, v.city, v.province, v.occupation,
      minorForm ? v.guardian_name : null, minorForm ? v.guardian_relation : null, minorForm ? v.guardian_mobile : null,
      hmoName(v), v.hmo ? v.hmo_card_no : null, v.emergency_name, v.emergency_relation, v.emergency_mobile, a.staffId])).rows[0].id;
  await audit(tx, a.clinicId, a.staffId, 'patient.create', 'patient', patientId);

  const lists = healthLists(v);
  await tx.query(
    `insert into medical_history (clinic_id, patient_id, answered_at, answered_by, recorded_by, allergies, conditions, medications, note, answers, form_id)
     values ($1, $2, now(), 'patient', null, $3, $4, $5, null, $6, $7)`,
    [a.clinicId, patientId, lists.allergies, lists.conditions, lists.medications, JSON.stringify(historyAnswers(f, null)), f.id]);
  await audit(tx, a.clinicId, a.staffId, 'health.update', 'patient', patientId);

  const consents = await writeConsents(tx, { clinicId: a.clinicId, staffId: a.staffId, patientId, f, birthOnFile: v.birth_date });
  await tx.query(
    `update patient_form set status = 'added', patient_id = $2, added_as = 'new', decided_by = $3, decided_at = now() where id = $1`, [f.id, patientId, a.staffId]);
  await audit(tx, a.clinicId, a.staffId, 'forms.add', 'patient_form', f.id);
  return { kind: 'added', patientId, chartNo, consents };
}

/** A detail on the record that the form says differently: kept as it was on file. */
export interface KeptDetail { field: string; label: string; onFile: string; onForm: string }

export type AddToResult =
  | {
    kind: 'added'; patientId: string;
    /** Labels of what was empty on the record and is now filled from the form ("Email", "Occupation"). */
    filled: string[];
    /** What the record already had and the form says otherwise: kept as on file. Show them; the desk may take one (useFormDetail). */
    kept: KeptDetail[];
    /** A mobile or an email the record has none of and the desk did not tick (`use`): not written. Offered like `kept`. */
    proposed: KeptDetail[];
    /** On file and not ticked or written on the form: kept in the new health version, each list. */
    allergiesKept: string[];
    conditionsKept: string[];
    medicationsKept: string[];
    consents: { privacy: ConsentOutcome; treatment: ConsentOutcome };
  }
  | { kind: 'gone' }
  /** No such patient here (another clinic's, archived, or made up). */
  | { kind: 'no-patient' }
  | { kind: 'not-allowed' };

// The record's columns a form can fill, the form's value for each, and how to show it. `ask`: filled only
// when the desk ticks it, having checked the person at the desk (a mobile finds visits on /me/; an email
// gets receipts). `take: false`: never copied one at a time from the record page (a birth date changes
// through the health history, which records the change).
const FILLABLE: { col: string; label: string; from: (v: PatientFormValues) => string | null; show?: (s: string) => string; ask?: true; take?: false }[] = [
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

const sameText = (a: string, b: string) => a.normalize('NFKC').trim().toLocaleLowerCase('en') === b.normalize('NFKC').trim().toLocaleLowerCase('en');
const detailCols = () => FILLABLE.map((x) => x.col === 'birth_date' ? `to_char(birth_date, 'YYYY-MM-DD') as birth_date` : `${x.col}::text as ${x.col}`).join(', ');

/** What the form would do to the record, by the FILLABLE rule. `use`: the asked-for fields the desk ticked. */
function planFill(p: Record<string, string | null>, v: PatientFormValues, use: ReadonlySet<string>) {
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
 * What "Add to <patient>" would do with these answers, read without writing
 * (the same rule as addToPatient: FILLABLE): the labels it would fill (empty
 * on the record now), what the form says differently (kept as on file), and
 * the mobile or email it would put on an empty record only if the desk ticks
 * it (`proposed`). For the review page's confirmation, and for the record
 * after an add ("the form says otherwise: use it"). Null when the patient is
 * not found here. Inside withClinic().
 */
export async function compareWithRecord(tx: Tx, v: PatientFormValues, patientId: string): Promise<{ fills: string[]; differs: KeptDetail[]; proposed: KeptDetail[] } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(patientId)) return null;
  const p = (await tx.query<Record<string, string | null>>(
    `select id, ${detailCols()} from patient where id = $1 and archived_at is null`, [patientId])).rows[0];
  if (!p) return null;
  const { fills, differs, proposed } = planFill(p, v, new Set());
  return { fills, differs, proposed };
}

/** The fields the record page may take from an added form one at a time (useFormDetail): every FILLABLE but the birth date. */
export const TAKEABLE: ReadonlySet<string> = new Set(FILLABLE.filter((x) => x.take !== false).map((x) => x.col));

/**
 * "Add to <patient on file>". Fills what is empty on the record from the
 * form, never a name and never over what is there (what differs comes back
 * as `kept`); an empty mobile or email only when the desk ticked it (`use`:
 * 'phone', 'email'), otherwise it comes back as `proposed`. A birth date
 * filled in is written into the health version as {"birth_date": {"from":
 * null, "to": …}} (health.ts's rule). Writes a health version answered by the
 * patient, dated now so it is the current one — its allergies, conditions and
 * medicines are the form's plus those on the latest version on file (whoever
 * wrote it), its note the one on file — the two consents, and marks the form
 * added. Audit patient.update (when something was filled), health.update,
 * consent.form, forms.add.
 */
export async function addToPatient(tx: Tx, a: { clinicId: string; staffId: string; formId: string; patientId: string; use?: readonly string[] }): Promise<AddToResult> {
  if (!(await canEditRecords(tx, a.staffId, a.clinicId))) return { kind: 'not-allowed' };
  if (!/^[0-9a-f-]{36}$/i.test(a.patientId)) return { kind: 'no-patient' };
  await lockClinic(tx, a.clinicId);
  const f = await lockForm(tx, a.formId);
  if (!f) return { kind: 'gone' };
  // Row-level security: another clinic's patient is simply not found.
  const p = (await tx.query<Record<string, string | null>>(
    `select id, ${detailCols()} from patient where id = $1 and archived_at is null for update`, [a.patientId])).rows[0];
  if (!p) return { kind: 'no-patient' };
  const v = f.answers;

  const use = new Set((a.use ?? []).filter((c) => FILLABLE.some((x) => x.col === c && x.ask)));
  const { fill, fills: filled, differs: kept, proposed } = planFill(p, v, use);
  const cols = Object.keys(fill);
  if (cols.length) {
    await tx.query(
      `update patient set ${cols.map((c, i) => `${c} = $${i + 2}`).join(', ')}, updated_at = now() where id = $1`,
      [a.patientId, ...cols.map((c) => fill[c])]);
    await audit(tx, a.clinicId, a.staffId, 'patient.update', 'patient', a.patientId);
  }
  const birthOnFile = fill.birth_date ?? p.birth_date ?? null;

  // The latest version on file, whoever wrote it and whenever: what it lists stays unless the form lists it too.
  const latest = (await tx.query<HealthAnswers>(
    `select allergies, conditions, medications, note from medical_history where patient_id = $1 order by answered_at desc, id desc limit 1`, [a.patientId])).rows[0] ?? null;
  const lists = healthLists(v);
  const low = (s: string) => s.toLocaleLowerCase('en');
  const notIn = (had: string[] | null | undefined, now: string[]) => (had ?? []).filter((x) => !now.some((y) => low(y) === low(x)));
  const allergiesKept = notIn(latest?.allergies, lists.allergies);
  const conditionsKept = notIn(latest?.conditions, lists.conditions);
  const medicationsKept = notIn(latest?.medications, lists.medications);
  await tx.query(
    `insert into medical_history (clinic_id, patient_id, answered_at, answered_by, recorded_by, allergies, conditions, medications, note, answers, form_id)
     values ($1, $2, now(), 'patient', null, $3, $4, $5, $6, $7, $8)`,
    [a.clinicId, a.patientId, [...lists.allergies, ...allergiesKept], [...lists.conditions, ...conditionsKept], [...lists.medications, ...medicationsKept],
      latest?.note ?? null, JSON.stringify(historyAnswers(f, fill.birth_date ? { from: null, to: fill.birth_date } : null)), f.id]);
  await audit(tx, a.clinicId, a.staffId, 'health.update', 'patient', a.patientId);
  if (fill.birth_date) await audit(tx, a.clinicId, a.staffId, 'patient.birth_date', 'patient', a.patientId);

  const consents = await writeConsents(tx, { clinicId: a.clinicId, staffId: a.staffId, patientId: a.patientId, f, birthOnFile });
  await tx.query(
    `update patient_form set status = 'added', patient_id = $2, added_as = 'existing', decided_by = $3, decided_at = now() where id = $1`, [f.id, a.patientId, a.staffId]);
  await audit(tx, a.clinicId, a.staffId, 'forms.add', 'patient_form', f.id);
  return { kind: 'added', patientId: a.patientId, filled, kept, proposed, allergiesKept, conditionsKept, medicationsKept, consents };
}

/**
 * "Use <what the form says>" on the record after a form was added to it: one
 * detail (a TAKEABLE column) written from the form's stored answers, over
 * what was on file or into an empty field. Names are not among them, nor the
 * birth date. The form must be one added to this patient. 'same' when the
 * record already says it. Audit patient.update.
 */
export async function useFormDetail(tx: Tx, a: { clinicId: string; staffId: string; patientId: string; formId: string; field: string }):
  Promise<'saved' | 'same' | 'gone' | 'not-allowed'> {
  if (!(await canEditRecords(tx, a.staffId, a.clinicId))) return 'not-allowed';
  const x = FILLABLE.find((y) => y.col === a.field && TAKEABLE.has(y.col));
  if (!x || !/^[0-9a-f-]{36}$/i.test(a.patientId) || !/^[0-9a-f-]{36}$/i.test(a.formId)) return 'gone';
  const f = (await tx.query<{ answers: PatientFormValues }>(
    `select answers from patient_form where id = $1 and patient_id = $2 and status = 'added'`, [a.formId, a.patientId])).rows[0];
  const want = f ? x.from(f.answers) : null;
  if (!want) return 'gone';
  const p = (await tx.query<{ v: string | null }>(`select ${x.col}::text as v from patient where id = $1 and archived_at is null for update`, [a.patientId])).rows[0];
  if (!p) return 'gone';
  if (p.v !== null && p.v !== '' && sameText(p.v, want)) return 'same';
  await tx.query(`update patient set ${x.col} = $2, updated_at = now() where id = $1`, [a.patientId, want]);
  await audit(tx, a.clinicId, a.staffId, 'patient.update', 'patient', a.patientId);
  return 'saved';
}

/** "Dismiss": the form leaves the queue and is deleted 30 days after it was sent. 'gone' when it is not new. Audit forms.dismiss. */
export async function dismissForm(tx: Tx, a: { clinicId: string; staffId: string; formId: string }): Promise<'dismissed' | 'gone' | 'not-allowed'> {
  if (!(await canEditRecords(tx, a.staffId, a.clinicId))) return 'not-allowed';
  if (!/^[0-9a-f-]{36}$/i.test(a.formId)) return 'gone';
  const r = await tx.query(`update patient_form set status = 'dismissed', decided_by = $2, decided_at = now() where id = $1 and status = 'new'`, [a.formId, a.staffId]);
  if (!r.rowCount) return 'gone';
  await audit(tx, a.clinicId, a.staffId, 'forms.dismiss', 'patient_form', a.formId);
  return 'dismissed';
}

/**
 * "Dismiss selected" on the queue: every one of `formIds` that is still new
 * (at most 200 at once). Returns how many were dismissed. Audit forms.dismiss,
 * one row per form.
 */
export async function dismissForms(tx: Tx, a: { clinicId: string; staffId: string; formIds: readonly string[] }): Promise<number | 'not-allowed'> {
  if (!(await canEditRecords(tx, a.staffId, a.clinicId))) return 'not-allowed';
  const ids = [...new Set(a.formIds.filter((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)))].slice(0, 200);
  if (!ids.length) return 0;
  const done = (await tx.query<{ id: string }>(
    `update patient_form set status = 'dismissed', decided_by = $2, decided_at = now() where id = any($1::uuid[]) and status = 'new' returning id`,
    [ids, a.staffId])).rows;
  for (const r of done) await audit(tx, a.clinicId, a.staffId, 'forms.dismiss', 'patient_form', r.id);
  return done.length;
}

/** Undo a dismissal while the form is still kept: back to 'new'. Audit forms.restore. */
export async function restoreForm(tx: Tx, a: { clinicId: string; staffId: string; formId: string }): Promise<'restored' | 'gone' | 'not-allowed'> {
  if (!(await canEditRecords(tx, a.staffId, a.clinicId))) return 'not-allowed';
  if (!/^[0-9a-f-]{36}$/i.test(a.formId)) return 'gone';
  const r = await tx.query(`update patient_form set status = 'new', decided_by = null, decided_at = null where id = $1 and status = 'dismissed'`, [a.formId]);
  if (!r.rowCount) return 'gone';
  await audit(tx, a.clinicId, a.staffId, 'forms.restore', 'patient_form', a.formId);
  return 'restored';
}

// ---------------------------------------------------------------------------
// The patient record: "Patient forms"
// ---------------------------------------------------------------------------
/**
 * A consent the form was signed for, as the record has it now: 'form' (this
 * form wrote it), 'on-file' (the record already had one for that version,
 * from elsewhere), 'none' (nothing on file for that version: the record's
 * birth date made the patient under 18 and the patient signed it themself, so
 * nothing was written — a parent's or guardian's consent is needed).
 */
export type FormConsentState = 'form' | 'on-file' | 'none';

export interface PatientFormLine {
  id: string; ref: string; submittedAt: Date;
  signedByName: string; signedAs: SignedAs;
  addedAs: 'new' | 'existing'; addedAt: Date; addedByName: string | null;
  /** The consents on the record from this form (patient_consent.form_id): which versions, of which kind. */
  consents: { versionId: string; kind: 'privacy' | 'treatment'; title: string }[];
  /** The versions the form was signed for, whether or not a row was written (one may already have been on file). */
  privacyVersion: string; treatmentVersion: string;
  /** Each consent as the record has it now (FormConsentState). */
  consentState: { privacy: FormConsentState; treatment: FormConsentState };
}

/** The forms added to this patient, newest first. Open one with getForm(tx, id) for its answers. */
export async function patientForms(tx: Tx, patientId: string): Promise<PatientFormLine[]> {
  const { rows } = await tx.query(
    `select f.id, f.ref, f.submitted_at, f.signed_by_name, f.signed_as, f.added_as, f.decided_at, s.full_name as added_by_name,
            f.privacy_version, f.treatment_version,
            coalesce((select json_agg(json_build_object('versionId', c.version_id, 'kind', v.kind, 'title', v.title) order by v.kind)
                        from patient_consent c join consent_version v on v.id = c.version_id where c.form_id = f.id), '[]'::json) as consents,
            exists (select 1 from patient_consent c where c.patient_id = f.patient_id and c.version_id = f.privacy_version) as privacy_on_file,
            exists (select 1 from patient_consent c where c.patient_id = f.patient_id and c.version_id = f.treatment_version) as treatment_on_file
       from patient_form f left join staff s on s.id = f.decided_by
      where f.patient_id = $1 and f.status = 'added'
      order by f.submitted_at desc`, [patientId]);
  const state = (consents: { kind: string }[], kind: 'privacy' | 'treatment', onFile: boolean): FormConsentState =>
    consents.some((c) => c.kind === kind) ? 'form' : onFile ? 'on-file' : 'none';
  return rows.map((r) => ({
    id: r.id, ref: r.ref, submittedAt: r.submitted_at, signedByName: r.signed_by_name, signedAs: r.signed_as,
    addedAs: r.added_as, addedAt: r.decided_at, addedByName: r.added_by_name ?? null, consents: r.consents,
    privacyVersion: r.privacy_version, treatmentVersion: r.treatment_version,
    consentState: { privacy: state(r.consents, 'privacy', r.privacy_on_file), treatment: state(r.consents, 'treatment', r.treatment_on_file) },
  }));
}
