// The intake, the patient's side (039; the spec §2, §5.3–5.5): what
// /f/i/<token>/ and a clinic tablet's /f/t/ may read and do. There is no
// tenant: every call is one publicRead() of a security-definer function in
// 039, the clinic comes from the token, and the device is proven by the hash
// of its secret (a handed-over desk's or a phone's fl_idev, a clinic tablet's
// fl_ctab). The definers answer a status word and never raise with an answer
// in it; the page draws the word.
//
// Rules kept here:
// - Every public write checks the gates first (lookupIntake): page 1 only
//   where formsNoticeReady(); a phone's link only where the phone path is open
//   (phase 3); every page's words offered on this server (CONSENT_REVIEWED in
//   production) and the same words the database pinned (body_sha256).
// - Limits (LIMITS.intake): posts and pings per intake (intake:l:), public
//   posts per clinic and address (intake:ip:, pings not counted). A token that
//   does not exist counts forms:miss:<address>; a real, live link is never
//   refused by it.
// - A decision is drawn by the server (renderDocument) and frozen as its
//   snapshot here, never taken from the browser; the patient's name comes from
//   the view, never from the post.
// - Nothing here logs an answer, a signature, a snapshot, a token or a secret.

import { createHash } from 'node:crypto';
import type { AstroCookies } from 'astro';
import { publicRead, withClinic } from './db';
import { hit, ipBucket, waitText, LIMITS } from './throttle';
import { isProduction } from './env';
import { isMinor } from './health';
import { formsNoticeReady } from './patient-forms';
import { TEMPLATES, offered, readPatientPart, renderDocument, type Template, type Fields, type RawPart, type Rendered, type Decision, type PatientPart } from './consent-library';
import { libraryHash, snapshotText } from './consent-seal';
import { contextFor, clinicFace, type ClinicFace, type Attested } from './consent-docs';
import { readStrokes, type Strokes } from './visit-consent';
import { PHONE_PATH_BUILT, TOKEN_SHAPE, SECRET_SHAPE, addAtSend } from './intake';
import { DEVICE_COOKIE, TABLET_COOKIE, clearDeviceSecret } from './park';
import { readSession, clearSession, authEvent } from './auth';

/** The largest post a patient's page may send (a signature is the biggest part of it). */
export const INTAKE_POST_MAX = 192 * 1024;

const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

/** The device's proofs for a link, in the order to try them: the hash of its own secret (fl_idev, under /f/i/), then a clinic tablet's fl_ctab. */
export function deviceProofs(cookies: AstroCookies): { hash: string; tablet: boolean }[] {
  const out: { hash: string; tablet: boolean }[] = [];
  const own = cookies.get(DEVICE_COOKIE)?.value;
  if (own && SECRET_SHAPE.test(own)) out.push({ hash: sha(own), tablet: false });
  const tab = cookies.get(TABLET_COOKIE)?.value;
  if (tab && SECRET_SHAPE.test(tab)) out.push({ hash: sha(tab), tablet: true });
  return out;
}
/** The first of them. */
export const deviceProof = (cookies: AstroCookies) => deviceProofs(cookies)[0] ?? null;

/** A clinic tablet's own proof (fl_ctab), for /f/t/. */
export function tabletProof(cookies: AstroCookies): string | null {
  const tab = cookies.get(TABLET_COOKIE)?.value;
  return tab && SECRET_SHAPE.test(tab) ? sha(tab) : null;
}

/**
 * A clinic tablet never holds a staff session (the spec §1.7(a)): one made on
 * it after it became a tablet is ended wherever the tablet shows its proof —
 * /f/t/, its poll and the patient's pages — and logged (auth_event
 * tablet.signout, no patient). `device`: a hand-over secret on it goes too
 * (/f/t/ only: that cookie is not sent there, so it is expired blind).
 */
export async function endStaffOnTablet(cookies: AstroCookies, who: { ip: string | null; ua: string | null }, opts: { device?: boolean } = {}): Promise<void> {
  const s = readSession(cookies);
  if (s) {
    clearSession(cookies);
    await authEvent('tablet.signout', { staffId: s.staffId, ip: who.ip, ua: who.ua });
  }
  if (opts.device) clearDeviceSecret(cookies);
}

// ---------------------------------------------------------------------------
// What a token shows
// ---------------------------------------------------------------------------
export interface IntakeClinic { id: string; name: string; slug: string; area: string | null; city: string | null; phone: string | null; photoKeys: string[]; listed: boolean; dpoName: string | null }
export interface IntakePageView {
  id: string; ref: string; versionId: string; code: string; kind: 'treatment' | 'document'; sort: number; rev: number; fields: Fields;
  dentistName: string | null; dentistPrc: string | null; explainedIn: 'en' | 'fil' | 'other' | null; explainedOther: string | null; interpreter: string | null;
  inForce: boolean; signable: boolean; template: Template | null;
  attestation: { dentistName: string; dentistPrc: string; explainedIn: string; interpreter: string | null; assent: string | null; attestedAt: string } | null;
  page: { state: 'reading' | 'read' | 'question' | 'agreed' | 'refused' | 'later'; docRev: number; answers: Record<string, unknown> | null; signedByName: string | null;
    signedAs: string | null; method: string | null; relation: string | null; authority: string | null; openedAt: string | null; decidedAt: string | null; initials: string | null } | null;
}
export interface IntakeOpen {
  id: string; ref: string; target: 'new' | 'existing'; deskMinor: 'yes' | 'no' | 'unsure' | null; cameWith: string | null;
  answers: Record<string, unknown> | null; page1DoneAt: string | null; privacyAs: string | null;
}
export type IntakeStatus = 'welcome' | 'verify' | 'open' | 'unavailable' | 'expired' | 'idle' | 'taken' | 'replaced' | 'locked' | 'closed' | 'finished' | 'unknown' | 'wait';

export interface IntakeLook {
  status: IntakeStatus;
  clinic: IntakeClinic | null;
  parts?: number;
  target?: 'new' | 'existing';
  device?: 'phone' | 'tablet' | 'desk';
  intake?: IntakeOpen;
  privacy?: { id: string; title: string; summary: string } | null;
  patient?: { first_name: string; middle_name: string | null; last_name: string; suffix: string | null; birth_date: string | null; sex: string | null } | null;
  pages?: IntakePageView[];
  /** 'wait': the seconds until a try is allowed again. */
  retryAfter?: number;
  message?: string;
}

function clinicOf(c: Record<string, any> | undefined): IntakeClinic | null {
  if (!c) return null;
  return { id: c.id, name: c.name, slug: c.slug, area: c.area ?? null, city: c.city ?? null, phone: c.phone ?? null, photoKeys: c.photo_keys ?? [], listed: !!c.listed, dpoName: c.dpo_name ?? null };
}

/**
 * What this token opens for this device, gates applied. `unavailable` when
 * a phone's link while the phone path is closed, page 1 while its notice is
 * not listed, or any page's words not offered here or not the ones the
 * database pinned. `ip` counts a token that does not exist (forms:miss).
 */
export async function lookupIntake(token: string, device: string | null, ip: string): Promise<IntakeLook> {
  if (!TOKEN_SHAPE.test(token)) return missed(ip);
  const v = (await publicRead<{ v: Record<string, any> }>('select intake_view($1, $2) as v', [token, device])).at(0)?.v;
  if (!v || v.status === 'unknown') return missed(ip);
  const look: IntakeLook = { status: v.status, clinic: clinicOf(v.clinic), parts: v.parts, target: v.target };
  if (v.status !== 'open') {
    // Which device this link was for, when it was this device's own (for the words, and "For the clinic").
    if (device && v.status !== 'taken' && v.status !== 'welcome' && v.status !== 'verify') {
      const d = (await publicRead<{ d: string | null }>('select intake_device($1, $2) as d', [token, device])).at(0)?.d ?? null;
      if (d === 'phone' || d === 'tablet' || d === 'desk') look.device = d;
    }
    return look;
  }
  const pages: IntakePageView[] = (v.pages ?? []).map((p: Record<string, any>) => ({
    id: p.id, ref: p.ref, versionId: p.version_id, code: p.code, kind: p.kind, sort: p.sort, rev: p.rev, fields: p.fields ?? {}, dentistName: p.dentist_name,
    dentistPrc: p.dentist_prc, explainedIn: p.explained_in, explainedOther: p.explained_other, interpreter: p.interpreter, inForce: p.in_force, signable: p.signable,
    template: TEMPLATES[p.version_id] ?? null,
    attestation: p.attestation ? { dentistName: p.attestation.dentist_name, dentistPrc: p.attestation.dentist_prc, explainedIn: p.attestation.explained_in,
      interpreter: p.attestation.interpreter, assent: p.attestation.assent, attestedAt: p.attestation.attested_at } : null,
    page: p.page ? { state: p.page.state, docRev: p.page.doc_rev, answers: p.page.answers, signedByName: p.page.signed_by_name, signedAs: p.page.signed_as,
      method: p.page.method, relation: p.page.relation, authority: p.page.authority, openedAt: p.page.opened_at, decidedAt: p.page.decided_at, initials: p.page.initials } : null,
  }));
  const i = v.intake;
  Object.assign(look, {
    device: v.device, privacy: v.privacy, patient: v.patient, pages,
    intake: { id: i.id, ref: i.ref, target: i.target, deskMinor: i.desk_minor, cameWith: i.came_with, answers: i.answers, page1DoneAt: i.page1_done_at, privacyAs: i.privacy_as },
  });
  // The gates.
  const production = isProduction();
  if (look.device === 'phone' && !PHONE_PATH_BUILT) return { status: 'unavailable', clinic: look.clinic };
  if (look.target === 'new' && !formsNoticeReady(look.privacy?.id ?? null)) return { status: 'unavailable', clinic: look.clinic };
  if (pages.some((p) => !p.template || !offered(p.template, production))) return { status: 'unavailable', clinic: look.clinic };
  if (pages.length) {
    const pinned = await publicRead<{ id: string; body_sha256: string | null }>('select id, body_sha256 from consent_version where id = any($1::text[])', [pages.map((p) => p.versionId)]);
    if (pages.some((p) => pinned.find((r) => r.id === p.versionId)?.body_sha256 !== libraryHash(p.template!))) return { status: 'unavailable', clinic: look.clinic };
  }
  return look;
}

async function missed(ip: string): Promise<IntakeLook> {
  const r = await hit(`forms:miss:${ipBucket(ip)}`, ...LIMITS.forms.miss);
  if (!r.allowed) return { status: 'wait', clinic: null, retryAfter: r.retryAfter, message: `Too many links that do not open anything. ${waitText(r.retryAfter)}` };
  return { status: 'unknown', clinic: null };
}

/** The limits on a public post: the intake's own, and this address at this clinic. Pings count on the intake only. */
export async function postAllowed(a: { intakeId: string; clinicId: string; ip: string; ping?: boolean }): Promise<{ ok: true } | { ok: false; retryAfter: number }> {
  const byIntake = await hit(`intake:l:${a.intakeId}`, ...LIMITS.intake.link);
  if (!byIntake.allowed) return { ok: false, retryAfter: byIntake.retryAfter };
  if (a.ping) return { ok: true };
  const byIp = await hit(`intake:ip:${a.clinicId}:${ipBucket(a.ip)}`, ...LIMITS.intake.ip);
  return byIp.allowed ? { ok: true } : { ok: false, retryAfter: byIp.retryAfter };
}

// ---------------------------------------------------------------------------
// The patient, as the pages name them
// ---------------------------------------------------------------------------
const name4 = (a: { first_name?: unknown; middle_name?: unknown; last_name?: unknown; suffix?: unknown }) =>
  [a.first_name, a.middle_name, a.last_name, a.suffix].map((x) => (typeof x === 'string' ? x.trim() : '')).filter(Boolean).join(' ');

/** The patient's full name (the server's: the record's, or page 1's), their birth date, and whether they are a minor today. */
export function patientOf(look: IntakeLook): { name: string; firstName: string; birth: string | null; minor: boolean | null } {
  const src = look.patient ?? look.intake?.answers ?? {};
  const birth = typeof src.birth_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(src.birth_date) ? src.birth_date : null;
  const d = look.intake?.deskMinor;
  return {
    name: name4(src as never) || 'the patient',
    firstName: typeof src.first_name === 'string' && src.first_name.trim() ? src.first_name.trim() : 'there',
    birth,
    minor: birth ? isMinor(birth) : d === 'yes' ? true : d === 'no' ? false : null,
  };
}

const LANG = (p: IntakePageView) => (p.explainedIn === 'en' ? 'English' : p.explainedIn === 'fil' ? 'Filipino' : p.explainedIn === 'other' ? p.explainedOther : null);

/** The clinic as its forms print it (name, address, phone), read under its own tenant: the clinic comes from the token's view. */
export async function faceOf(look: IntakeLook): Promise<ClinicFace> {
  const c = look.clinic!;
  return withClinic(c.id, (tx) => clinicFace(tx, c.id));
}

/** One consent page drawn for the patient: the words, their facts, and (once decided) what they chose. */
export function renderPage(look: IntakeLook, p: IntakePageView, face: ClinicFace, extra: Partial<Pick<Parameters<typeof renderDocument>[2], 'answers' | 'initials' | 'decision' | 'signer' | 'read' | 'explainedIn' | 'unsigned'>> = {}): Rendered {
  const who = patientOf(look);
  const attested: Attested | null = p.attestation ? {
    at: new Date(p.attestation.attestedAt), lang: p.attestation.explainedIn, interpreter: p.attestation.interpreter, assent: p.attestation.assent,
    dentistName: p.attestation.dentistName, dentistPrc: p.attestation.dentistPrc,
  } : null;
  const ctx = contextFor(p.template!, {
    clinic: face, patientName: who.name, birth: who.birth, minor: who.minor, dentist: p.dentistName ? { name: p.dentistName, prc: p.dentistPrc } : null,
    attested, planned: LANG(p),
  });
  return renderDocument(p.template!, p.fields, { ...ctx, ...extra });
}

// ---------------------------------------------------------------------------
// The writes
// ---------------------------------------------------------------------------
/** Page 1, one screen (the definer checks it again). */
export async function savePage1(token: string, device: string, screen: string, answers: Record<string, unknown>): Promise<string> {
  return (await publicRead<{ r: string }>('select intake_save_page1($1, $2, $3, $4::jsonb) as r', [token, device, screen, JSON.stringify(answers)]))[0]?.r ?? 'invalid';
}

/** A page opened, a question, or read (a dentist's form not confirmed yet). */
export async function markPage(token: string, device: string, docId: string, rev: number, mark: 'opened' | 'question' | 'read'): Promise<string> {
  return (await publicRead<{ r: string }>('select intake_mark_page($1, $2, $3::uuid, $4, $5) as r', [token, device, docId, rev, mark]))[0]?.r ?? 'invalid';
}

export type Decided =
  | { status: 'saved' }
  | { status: 'errors'; errors: Record<string, string>; part: PatientPart; strokes: Strokes | null }
  | { status: string };

/**
 * A decision on a page (§5.4): the patient's part read and checked
 * (readPatientPart: the name held, never the one posted), the signature
 * (readStrokes; none only for a photos refusal, which carries no "By signing"
 * sentence), the page drawn by the server with every choice and frozen as its
 * snapshot, then intake_decide. "Decide later" is kept unsigned (a photos form
 * too, 043: a minor's parent may not be there).
 */
export async function decidePage(token: string, device: string, look: IntakeLook, p: IntakePageView, face: ClinicFace, raw: RawPart, strokesRaw: string): Promise<Decided> {
  if (!p.signable) return { status: 'not_ready' };
  const t = p.template!;
  const who = patientOf(look);
  if (who.minor === null) return { status: 'invalid' };
  const onDevice = look.device === 'phone' ? 'phone' : 'clinic';
  const part = readPatientPart(t, raw, { minor: who.minor, device: onDevice, patientName: who.name, fields: p.fields });
  const errors = { ...part.errors };
  const signing = part.decision === 'agreed' || part.decision === 'refused';
  const unsignedNo = t.refuseUnsigned && part.decision === 'refused';
  const strokes = signing && !unsignedNo ? readStrokes(strokesRaw) : null;
  if (signing && !unsignedNo && !strokes) errors.strokes = 'Sign in the box with your finger.';
  if (Object.keys(errors).length || !part.decision) return { status: 'errors', errors, part, strokes };
  if (part.decision === 'later') {
    return { status: (await publicRead<{ r: string }>('select intake_decide($1, $2, $3::uuid, $4, $5, null, null) as r', [token, device, p.id, p.rev, 'later']))[0]?.r ?? 'invalid' };
  }
  const signer = unsignedNo && !part.signer ? { name: who.name, as: 'patient' as const, method: 'sign' as const, relation: null, authority: null, ground: null, note: null } : part.signer!;
  const rendered = renderPage(look, p, face, {
    answers: part.answers, initials: part.initials, decision: part.decision, signer, read: part.read, explainedIn: part.explainedIn, unsigned: unsignedNo,
  });
  const snapshot = snapshotText(rendered, { document: p.id, ref: p.ref });
  const page = {
    signed_by_name: signer.name, signed_as: signer.as, method: signer.method, relation: signer.relation, authority: signer.authority,
    authority_ground: signer.ground, authority_note: signer.note, explained_in: part.explainedIn, read_by: part.read && !part.read.self ? part.read.by : null,
    initials: part.initials, answers: part.answers, strokes, over21: String(raw.signer_over21 ?? '') === '1',
  };
  return { status: (await publicRead<{ r: string }>('select intake_decide($1, $2, $3::uuid, $4, $5, $6::jsonb, $7) as r',
    [token, device, p.id, p.rev, part.decision as Decision, JSON.stringify(page), snapshot]))[0]?.r ?? 'invalid' };
}

/**
 * Send. When a new patient's intake is sent, the server adds it at once as
 * the person who made the link unless someone on file looks like them
 * (addAtSend, the owner's answer of 29 Sep 2026); otherwise it waits for the
 * desk. The patient is told only that their details are with the clinic.
 */
export async function sendIntake(token: string, device: string, nonce: string, clinicId: string, intakeId: string): Promise<{ status: string; added: boolean }> {
  const r = (await publicRead<{ r: string }>('select intake_send($1, $2, $3) as r', [token, device, nonce]))[0]?.r ?? 'invalid';
  let added = r === 'added';
  if (r === 'sent') {
    try {
      added = !!(await withClinic(clinicId, (tx) => addAtSend(tx, { clinicId, intakeId })));
    } catch (e) {
      // The forms are sent and safe; the desk adds them (Screen F). Never an answer in the log.
      console.error(`[intake] add at send failed for intake ${intakeId}: ${(e as { code?: string }).code ?? 'error'}`);
    }
  }
  return { status: r, added };
}

/**
 * Start, on the patient's own phone: the first phone to press it claims the
 * link with the hash of a secret made for that browser (fl_idev, set by the
 * page only when this answers open or verify). Answers the gate's next status
 * — open, or verify for a patient on file — or why not (taken, expired, …).
 */
export async function claimIntake(token: string, deviceHash: string): Promise<string> {
  return (await publicRead<{ r: string }>('select intake_claim($1, $2) as r', [token, deviceHash]))[0]?.r ?? 'unknown';
}

/**
 * A patient on file, on their phone: the birth date typed must be the
 * record's (intake_verify). Answers open, wrong, locked (three misses retire
 * the link), or the gate's status. The date never reaches a log.
 */
export async function verifyIntake(token: string, deviceHash: string, birth: string): Promise<string> {
  const b = /^\d{4}-\d{2}-\d{2}$/.test(birth) ? birth : '';
  return (await publicRead<{ r: string }>('select intake_verify($1, $2, $3) as r', [token, deviceHash, b]))[0]?.r ?? 'unknown';
}

/** Keep a link alive while the page is open. */
export async function pingIntake(token: string, device: string): Promise<string> {
  return (await publicRead<{ r: string }>('select intake_ping($1, $2) as r', [token, device]))[0]?.r ?? 'unknown';
}

/** A clinic tablet waiting on /f/t/: its live link, or ready (tablet_poll). */
export async function pollTablet(secretHash: string): Promise<{ status: 'ready' | 'link' | 'unknown'; token: string | null; tablet: string | null; clinic: { id: string; name: string; slug: string; photoKeys: string[] } | null }> {
  const v = (await publicRead<{ v: Record<string, any> }>('select tablet_poll($1) as v', [secretHash]))[0]?.v;
  if (!v || v.status === 'unknown') return { status: 'unknown', token: null, tablet: null, clinic: null };
  return { status: v.status, token: v.token ?? null, tablet: v.tablet ?? null, clinic: v.clinic ? { id: v.clinic.id, name: v.clinic.name, slug: v.clinic.slug, photoKeys: v.clinic.photo_keys ?? [] } : null };
}

/** The words each status shows the patient: plain, and never a detail of the record. */
export const INTAKE_WORDS: Record<Exclude<IntakeStatus, 'open'>, { title: string; lead: string; code: number }> = {
  welcome: { title: 'Your forms', lead: 'Press Start to begin.', code: 200 },
  verify: { title: 'Your forms', lead: 'Type the patient’s date of birth to begin.', code: 200 },
  unavailable: { title: 'These forms are not open just now', lead: 'Please ask the desk for a paper form.', code: 503 },
  expired: { title: 'This code has expired', lead: 'Please ask the desk for a new one.', code: 410 },
  idle: { title: 'This code has expired', lead: 'It closed after a while with nothing typed. Please ask the desk for a new one.', code: 410 },
  taken: { title: 'These forms are open on another device', lead: 'Please ask the desk.', code: 409 },
  replaced: { title: 'This code was replaced', lead: 'Please ask the desk for the new one.', code: 410 },
  locked: { title: 'Please ask the desk', lead: 'The date of birth did not match three times, so this code is locked.', code: 423 },
  closed: { title: 'These forms were stopped', lead: 'Please ask the desk.', code: 410 },
  finished: { title: 'These forms are finished', lead: 'Thank you. The clinic has them.', code: 200 },
  unknown: { title: 'This link doesn’t open any forms', lead: 'Please ask the desk.', code: 404 },
  wait: { title: 'Please wait a little', lead: 'Or ask the desk for a paper form.', code: 429 },
};

/** On a clinic tablet or the desk's device handed over, the patient never had a code: the device's own words. */
const CLINIC_DEVICE_WORDS: Partial<Record<Exclude<IntakeStatus, 'open'>, { title: string; lead: string }>> = {
  expired: { title: 'These forms closed', lead: 'Please hand the device back to the desk.' },
  idle: { title: 'These forms closed', lead: 'They closed after a while with nothing typed. Please hand the device back to the desk.' },
  replaced: { title: 'These forms moved to another device', lead: 'Please hand the device back to the desk.' },
  closed: { title: 'These forms were stopped', lead: 'Please hand the device back to the desk.' },
  taken: { title: 'These forms are open on another device', lead: 'Please hand the device back to the desk.' },
  finished: { title: 'These forms are finished', lead: 'Thank you. You can hand the device back to the desk.' },
};

/** The words for a status on this device: a phone's (the code it was given), or a clinic device's. */
export function intakeWords(status: Exclude<IntakeStatus, 'open'>, device: 'phone' | 'tablet' | 'desk' | null): { title: string; lead: string; code: number } {
  const base = INTAKE_WORDS[status];
  const own = device === 'tablet' || device === 'desk' ? CLINIC_DEVICE_WORDS[status] : undefined;
  return own ? { ...base, ...own } : base;
}
