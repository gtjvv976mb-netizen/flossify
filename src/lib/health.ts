// The patient's health record, and the privacy consent taken at the desk:
// what the patient record page (/c/<slug>/patients/<id>/) reads, checks and
// writes. The page owns the form; this file owns the rules.
//
// Rules kept:
// - medical_history is appended, never updated (schema.sql). A save is a new
//   version under the staff member who pressed Save (recorded_by, 021), so the
//   clinic can say what the patient told them on the day of treatment.
// - null and an empty list are different answers. null: nobody has asked yet.
//   An empty list: asked, and there is none ("None known"). The Today queue,
//   the schedule and the Patients list warn only on a non-empty list, so both
//   read as nothing to warn about there; this page says which one it is.
// - Every function runs inside the caller's withClinic() transaction, so
//   row-level security decides whether the patient exists. The patient row
//   is read FOR UPDATE first: a foreign key would accept another clinic's
//   patient id (foreign-key checks do not see RLS), and the lock makes two
//   saves on one record take turns.
// - A save names the version it started from (`base`). If someone saved in
//   between, nothing is written and the page shows what they saved.
// - A save names the birth date the page opened with (`birthWas`). The birth
//   date is changed only when this person changed it, and only if nobody else
//   changed it since; a page left open never puts back an old value.
// - A birth date change is a version too: the answers carried over unchanged,
//   plus {"birth_date": {"from", "to"}} in medical_history.answers, so every
//   value the record ever had, and who set it, stays in the history.
// - A desk consent is for the notice in force when it is saved, read through
//   current_consent_version() (012), never for an id the form made up.
// - A desk consent says who agreed (agreed_as, 021): the patient, or a parent
//   or guardian, named. Under 18 by the birth date on file, only a parent or
//   guardian can agree. With no birth date on file, the desk says which it is.

import type { Tx } from './db';

// ---------------------------------------------------------------------------
// The three lists and their quick picks. Picks are shortcuts for spelling,
// nothing more: anything can be typed. A typed value that matches a pick in
// any case is stored with the pick's spelling, so "penicillin" and
// "Penicillin" are one allergy.
// ---------------------------------------------------------------------------
export const LISTS = [
  {
    key: 'allergies', label: 'Allergies', one: 'allergy', none: 'None known',
    picks: ['Penicillin', 'Amoxicillin', 'Latex', 'Local anaesthetic', 'Ibuprofen', 'Aspirin', 'Sulfa drugs', 'Iodine'],
  },
  {
    key: 'conditions', label: 'Conditions', one: 'condition', none: 'None',
    picks: ['Hypertension', 'Diabetes', 'Pregnancy', 'Bleeding disorder', 'Heart condition', 'Asthma', 'Epilepsy', 'Hepatitis'],
  },
  {
    key: 'medications', label: 'Medicines taken now', one: 'medicine', none: 'None',
    picks: ['Blood thinner', 'Aspirin', 'Insulin', 'Metformin', 'Blood pressure maintenance'],
  },
] as const;

export type ListKey = (typeof LISTS)[number]['key'];

export const ITEM_MAX = 60;
export const ITEMS_MAX = 20;
export const NOTE_MAX = 500;
export const NAME_MAX = 120;

export interface HealthAnswers {
  allergies: string[] | null;
  conditions: string[] | null;
  medications: string[] | null;
  note: string | null;
}

export interface BirthChange { from: string | null; to: string | null }

export interface HealthVersion extends HealthAnswers {
  id: string;
  at: Date;
  /** The staff member's name, or null for a row nobody on the team typed (the development seed). */
  by: string | null;
  /** Set when this version changed the birth date on file. */
  birthChange: BirthChange | null;
}

// ---------------------------------------------------------------------------
// Dates. Manila's calendar, because that is the day the clinic is in.
// ---------------------------------------------------------------------------
const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Today in Manila as YYYY-MM-DD. */
export const manilaToday = (now = new Date()): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);

/** Whole years from birth to today, both YYYY-MM-DD. The day before a birthday is still the old age. */
export function ageOn(birth: string, today: string): number | null {
  const b = YMD.exec(birth), t = YMD.exec(today);
  if (!b || !t) return null;
  const [by, bm, bd] = [+b[1], +b[2], +b[3]];
  const [ty, tm, td] = [+t[1], +t[2], +t[3]];
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
}

export const ageText = (years: number): string => (years < 1 ? 'Under a year old' : `${years} year${years === 1 ? '' : 's'} old`);

// Built from en-US parts: the locale strings put the comma and the case
// elsewhere, and en-GB spells September "Sept" in current ICU data.
const parts = (d: Date) => Object.fromEntries(new Intl.DateTimeFormat('en-US', {
  weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila',
}).formatToParts(d).map((x) => [x.type, x.value]));

/** "Thu 24 Sep 2026, 9:12 am" in Manila. */
export function when(d: Date): string {
  const p = parts(d);
  return `${p.weekday} ${p.day} ${p.month} ${p.year}, ${p.hour}:${p.minute} ${String(p.dayPeriod).toLowerCase()}`;
}

/** "24 Sep 2026" in Manila. */
export function day(d: Date): string {
  const p = parts(d);
  return `${p.day} ${p.month} ${p.year}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A calendar date as people read it: "2014-06-21" → "21 Jun 2014". Null for anything else. */
export function dateText(ymd: string | null | undefined): string | null {
  const m = YMD.exec(ymd ?? '');
  return m ? `${+m[3]} ${MONTHS[+m[2] - 1]} ${m[1]}` : null;
}

/** Under 18 by this birth date on today's Manila calendar. False when there is no birth date. */
export const isMinor = (birth: string | null, today = manilaToday()): boolean => {
  const years = birth ? ageOn(birth, today) : null;
  return years !== null && years < 18;
};

// ---------------------------------------------------------------------------
// Reading the form
// ---------------------------------------------------------------------------
/** One line of plain text: control characters out, runs of space collapsed. */
export const oneLine = (s: unknown): string =>
  String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();

const lower = (s: string) => s.toLocaleLowerCase('en');

/** "mango" → "Mango". Anything typed with a capital somewhere ("NSAIDs", "iPhone") is left as typed. */
export const capitalise = (v: string): string => (v === lower(v) ? v.charAt(0).toLocaleUpperCase('en') + v.slice(1) : v);

/** Trimmed, de-duplicated in any case, spelled like the pick when it is one. Order kept. */
export function cleanList(raw: unknown[], picks: readonly string[] = []): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const r of raw) {
    const v = oneLine(r);
    if (!v || seen.has(lower(v))) continue;
    seen.add(lower(v));
    out.push(picks.find((p) => lower(p) === lower(v)) ?? capitalise(v));
  }
  return out;
}

/**
 * The health form, as posted. Per list: ticked chips (`allergies`), what is
 * still in the "add" box (`allergies_add`, commas split it, so nothing typed
 * is lost when Save is pressed before Add), and the none chip
 * (`allergies_none`). Plus `birth_date` (YYYY-MM-DD or empty) and `note`.
 * Returns the answers, the birth date, and every problem in one list.
 */
export function readHealthForm(form: FormData, today = manilaToday()): { answers: HealthAnswers; birth: string | null; problems: string[] } {
  const problems: string[] = [];
  const answers: HealthAnswers = { allergies: null, conditions: null, medications: null, note: null };

  for (const l of LISTS) {
    const typed = String(form.get(`${l.key}_add`) ?? '').split(/[,;\n]/);
    const list = cleanList([...form.getAll(l.key), ...typed], l.picks);
    const none = form.get(`${l.key}_none`) === '1';
    const long = list.find((v) => v.length > ITEM_MAX);
    if (long) problems.push(`${l.label}: keep each one under ${ITEM_MAX} characters (“${long.slice(0, 24)}…”).`);
    if (list.length > ITEMS_MAX) problems.push(`${l.label}: up to ${ITEMS_MAX}. Put the rest in the note.`);
    if (none && list.length) problems.push(`${l.label}: “${l.none}” is ticked, and so is ${list[0]}. Untick one.`);
    answers[l.key] = none ? [] : list.length ? list : null;
  }

  const note = oneLine(form.get('note'));
  if (note.length > NOTE_MAX) problems.push(`Keep the note under ${NOTE_MAX} characters; it has ${note.length}.`);
  answers.note = note || null;

  const raw = oneLine(form.get('birth_date'));
  let birth: string | null = null;
  if (raw) {
    const m = YMD.exec(raw);
    const real = m && (() => { const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])); return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3]; })();
    if (!real) problems.push('That birth date is not a real date. Pick it from the calendar, or type it as day, month, year.');
    else if (raw > today) problems.push('The birth date is after today. Check the year.');
    else if (raw < '1900-01-01') problems.push('The birth date is before 1900. Check the year.');
    else birth = raw;
  }
  return { answers, birth, problems };
}

// ---------------------------------------------------------------------------
// Comparing versions, for the history and for "did anything change"
// ---------------------------------------------------------------------------
const sameList = (a: string[] | null, b: string[] | null): boolean => {
  if (a === null || b === null) return a === b;
  const x = new Set(a.map(lower));
  return a.length === b.length && b.every((v) => x.has(lower(v)));
};

export const sameAnswers = (a: HealthAnswers | null, b: HealthAnswers): boolean =>
  LISTS.every((l) => sameList(a?.[l.key] ?? null, b[l.key])) && (a?.note ?? null) === b.note;

/** True when at least one question has an answer, "none" included. */
export const answered = (a: HealthAnswers | null): boolean =>
  !!a && (LISTS.some((l) => a[l.key] !== null) || !!a.note);

/** A list as a person would read it: "Penicillin, Latex", "none", or "not asked". */
export const listText = (v: string[] | null, none = 'none'): string => (v === null ? 'not asked' : v.length ? v.join(', ') : none);

/** What changed from one version to the next, in short phrases. [] means nothing did. */
export function changes(prev: HealthAnswers | null, next: HealthAnswers): string[] {
  const out: string[] = [];
  for (const l of LISTS) {
    const a = prev?.[l.key] ?? null, b = next[l.key];
    if (sameList(a, b)) continue;
    if (b === null) { out.push(`${l.label}: answer cleared`); continue; }
    if (b.length === 0) { out.push(`${l.label}: ${lower(l.none)}`); continue; }
    const had = new Set((a ?? []).map(lower)), has = new Set(b.map(lower));
    const added = b.filter((v) => !had.has(lower(v)));
    const removed = (a ?? []).filter((v) => !has.has(lower(v)));
    out.push(`${l.label}: ${[added.length && `added ${added.join(', ')}`, removed.length && `removed ${removed.join(', ')}`].filter(Boolean).join('; ')}`);
  }
  if ((prev?.note ?? null) !== next.note) out.push(next.note === null ? 'Note removed' : prev?.note ? 'Note changed' : 'Note added');
  return out;
}

/** "Birth date: 21 Jun 2014 → 1 Jan 2000", "Birth date added: 1 May 2017", "Birth date removed (was 1 May 2017)". */
export function birthChangeText(c: BirthChange): string {
  const from = dateText(c.from), to = dateText(c.to);
  if (!from) return `Birth date added: ${to ?? 'none'}`;
  if (!to) return `Birth date removed (was ${from})`;
  return `Birth date: ${from} → ${to}`;
}

/** What one version changed: the birth date first, then the answers. [] means nothing did. */
export const versionChanges = (prev: HealthAnswers | null, v: HealthVersion): string[] =>
  [...(v.birthChange ? [birthChangeText(v.birthChange)] : []), ...(prev ? changes(prev, v) : [])];

// ---------------------------------------------------------------------------
// The database. Every function takes the caller's withClinic() transaction.
// ---------------------------------------------------------------------------
type Row = {
  id: string; at: Date; by: string | null; allergies: string[] | null; conditions: string[] | null; medications: string[] | null; note: string | null;
  birth_change: { from?: unknown; to?: unknown } | null; total: number;
};
const ymdOrNull = (v: unknown): string | null => (typeof v === 'string' && YMD.test(v) ? v : null);

/** Newest first, up to `limit` versions, plus how many there are in all. */
export async function readHealth(tx: Tx, patientId: string, limit = 12): Promise<{ versions: HealthVersion[]; total: number; older: HealthVersion | null }> {
  // One extra row, so the oldest one shown can still say what it changed.
  const { rows } = await tx.query<Row>(
    `select h.id, h.answered_at as at, s.full_name as by, h.allergies, h.conditions, h.medications, h.note,
            h.answers -> 'birth_date' as birth_change, (count(*) over ())::int as total
       from medical_history h left join staff s on s.id = h.recorded_by
      where h.patient_id = $1
      order by h.answered_at desc, h.id desc
      limit $2`, [patientId, limit + 1]);
  const versions: HealthVersion[] = rows.map(({ total: _t, birth_change: b, ...v }) => ({
    ...v,
    birthChange: b && typeof b === 'object' ? { from: ymdOrNull(b.from), to: ymdOrNull(b.to) } : null,
  }));
  return { versions: versions.slice(0, limit), total: rows[0]?.total ?? 0, older: versions[limit] ?? null };
}

/**
 * May this person write this branch's records? staff_access.can_edit_records
 * for the branch: true for every role the team page adds today (dentists,
 * associates, secretaries, assistants, admins, the owner), and the one
 * switch that can take it away. Not a role list, so a new role does not
 * silently lose the desk's most-used form.
 */
export async function canEditRecords(tx: Tx, staffId: string, clinicId: string): Promise<boolean> {
  const { rows } = await tx.query<{ ok: boolean }>(
    'select can_edit_records as ok from staff_access where staff_id = $1 and clinic_id = $2', [staffId, clinicId]);
  return rows[0]?.ok === true;
}

export type SaveResult =
  | { kind: 'none' }
  /** Someone saved after this page opened. `birth` is the birth date on file now. */
  | { kind: 'conflict'; latest: HealthVersion | null; birth: string | null }
  | { kind: 'unchanged' }
  | { kind: 'saved'; answers: boolean; birth: boolean };

/**
 * Save the health form. Writes a new medical_history version when the
 * answers changed, when the birth date changed, or when neither did but
 * something is answered (a Save that says "checked with the patient, still
 * true"). A birth date change updates the patient row and is written into
 * the version's `answers` as {"birth_date": {"from", "to"}}, so the old value
 * is never lost. Audit rows: health.update for the answers (or the check),
 * patient.birth_date for the birth date.
 *
 * `base` is the version the page opened with and `birthWas` the birth date it
 * showed. If a newer version exists, or this person changed the birth date
 * and the one on file is no longer what they saw, nothing is written. A birth
 * date this person did not touch is left as it is on file, whatever the page
 * still shows.
 */
export async function saveHealth(tx: Tx, a: {
  clinicId: string; staffId: string; patientId: string; base: string; answers: HealthAnswers; birth: string | null; birthWas: string | null;
}): Promise<SaveResult> {
  const p = (await tx.query<{ birth: string | null }>(
    `select to_char(birth_date, 'YYYY-MM-DD') as birth from patient where id = $1 and archived_at is null for update`, [a.patientId])).rows[0];
  if (!p) return { kind: 'none' };
  const stored = p.birth ?? null;

  const latest = (await readHealth(tx, a.patientId, 1)).versions[0] ?? null;
  const birthEdited = a.birth !== a.birthWas;
  if ((latest?.id ?? 'none') !== a.base || (birthEdited && stored !== a.birthWas)) return { kind: 'conflict', latest, birth: stored };

  const birthChanged = birthEdited && a.birth !== stored;
  const answersChanged = !sameAnswers(latest, a.answers);
  const checked = !answersChanged && !birthChanged && answered(a.answers);
  if (!answersChanged && !birthChanged && !checked) return { kind: 'unchanged' };

  const audit = (action: string) => tx.query(
    `insert into audit_log (clinic_id, staff_id, action, entity, entity_id) values ($1, $2, $3, 'patient', $4)`,
    [a.clinicId, a.staffId, action, a.patientId]);

  await tx.query(
    `insert into medical_history (clinic_id, patient_id, answered_by, recorded_by, allergies, conditions, medications, note, answers)
     values ($1, $2, 'staff', $3, $4, $5, $6, $7, $8)`,
    [a.clinicId, a.patientId, a.staffId, a.answers.allergies, a.answers.conditions, a.answers.medications, a.answers.note,
      JSON.stringify(birthChanged ? { birth_date: { from: stored, to: a.birth } } : {})]);
  if (answersChanged || checked) await audit('health.update');
  if (birthChanged) {
    await tx.query('update patient set birth_date = $2, updated_at = now() where id = $1', [a.patientId, a.birth]);
    await audit('patient.birth_date');
  }
  return { kind: 'saved', answers: answersChanged || checked, birth: birthChanged };
}

export interface NoticeInForce { id: string; title: string; summary: string; effective: string }

/** The privacy notice in force (012's definer function), or null when none is yet. */
export async function noticeInForce(tx: Tx): Promise<NoticeInForce | null> {
  const { rows } = await tx.query<NoticeInForce>(
    `select v.id, v.title, v.summary, to_char(v.effective_from, 'FMDD FMMonth YYYY') as effective
       from current_consent_version() v where v.id is not null`);
  return rows[0] ?? null;
}

export type AgreedAs = 'patient' | 'guardian';

export interface ConsentRow {
  id: string; version_id: string; given_at: Date; channel: string; given_by_name: string | null; recorded_by_name: string | null;
  /** Who agreed: the patient, or a parent or guardian (021). Null on web consents and older rows. */
  agreed_as: AgreedAs | null;
}

export async function readConsents(tx: Tx, patientId: string): Promise<ConsentRow[]> {
  const { rows } = await tx.query(
    `select c.*, s.full_name as recorded_by_name
       from patient_consent c left join staff s on s.id = c.recorded_by
      where c.patient_id = $1 order by c.given_at desc`, [patientId]);
  return rows.map((r) => ({
    id: r.id, version_id: r.version_id, given_at: r.given_at, channel: r.channel, given_by_name: r.given_by_name,
    recorded_by_name: r.recorded_by_name, agreed_as: r.agreed_as === 'patient' || r.agreed_as === 'guardian' ? r.agreed_as : null,
  }));
}

/**
 * The consent that counts for the notice in force: a parent's or guardian's
 * if there is one (it is the one a minor needs), otherwise the newest.
 */
export function consentInForce(noticeId: string | null | undefined, consents: ConsentRow[]): ConsentRow | null {
  const mine = noticeId ? consents.filter((c) => c.version_id === noticeId) : [];
  return mine.find((c) => c.agreed_as === 'guardian') ?? mine[0] ?? null;
}

/**
 * A minor whose consent for the notice in force is not a parent's or
 * guardian's: taken as the patient's own (before the birth date showed a
 * child, or with none on file), or given online by whoever booked.
 */
export const guardianStillNeeded = (minor: boolean, inForce: ConsentRow | null): boolean =>
  minor && !!inForce && inForce.agreed_as !== 'guardian';

/** How an agreement was taken, in the words the desk uses. */
export const CONSENT_HOW: Record<string, string> = { web: 'online', desk: 'at the desk', sms: 'by text', paper: 'on paper' };

export type ConsentResult =
  | 'none' | 'no-notice' | 'changed' | 'already' | 'saved'
  /** No birth date on file, and the form did not say who is agreeing. */
  | 'who'
  /** Under 18 by the birth date on file, and the form said the patient agreed. */
  | 'minor'
  /** A parent or guardian is agreeing, and did not type their name. */
  | 'guardian-name';

/**
 * Record that the patient, or a parent or guardian, agreed at the desk to
 * the notice in force. `version` is the notice the screen showed; if another
 * came into force since, nothing is written. The age rule reads the birth
 * date on file inside this transaction, after the patient row is locked:
 * under 18, only a parent or guardian can agree, and they give their name;
 * with no birth date on file the form must say who is agreeing.
 *
 * One consent per notice, with one exception: a minor whose consent for it
 * is not a parent's or guardian's (taken as their own, or online) can have a
 * guardian's added. Anything else is 'already' and writes nothing.
 * No IP: the desk computer's address says nothing about the patient.
 */
export async function recordDeskConsent(tx: Tx, a: {
  clinicId: string; staffId: string; patientId: string; version: string; givenBy: string | null; agreedAs: AgreedAs | null;
}): Promise<ConsentResult> {
  const p = (await tx.query<{ birth: string | null }>(
    `select to_char(birth_date, 'YYYY-MM-DD') as birth from patient where id = $1 and archived_at is null for update`, [a.patientId])).rows[0];
  if (!p) return 'none';
  const notice = await noticeInForce(tx);
  if (!notice) return 'no-notice';
  if (notice.id !== a.version) return 'changed';

  if (!a.agreedAs) return 'who';
  if (isMinor(p.birth ?? null) && a.agreedAs !== 'guardian') return 'minor';
  if (a.agreedAs === 'guardian' && !a.givenBy) return 'guardian-name';

  const had = (await tx.query<{ agreed_as: string | null }>(
    'select agreed_as from patient_consent where patient_id = $1 and version_id = $2', [a.patientId, notice.id])).rows;
  const addsGuardian = a.agreedAs === 'guardian' && !had.some((r) => r.agreed_as === 'guardian');
  if (had.length && !addsGuardian) return 'already';

  await tx.query(
    `insert into patient_consent (clinic_id, patient_id, version_id, channel, given_by_name, recorded_by, agreed_as)
     values ($1, $2, $3, 'desk', $4, $5, $6)`,
    [a.clinicId, a.patientId, notice.id, a.givenBy, a.staffId, a.agreedAs]);
  await tx.query(
    `insert into audit_log (clinic_id, staff_id, action, entity, entity_id) values ($1, $2, 'consent.desk', 'patient', $3)`,
    [a.clinicId, a.staffId, a.patientId]);
  return 'saved';
}
