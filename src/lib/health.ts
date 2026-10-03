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
// - Consent signed on paper is recorded as what it was (026). A printed copy of
//   the notice in force, signed on a day it was in force: a patient_consent
//   row, channel 'paper', with that day (signed_on) — it counts like any
//   consent to that version, and the age rule is the one on the day it was
//   signed. The clinic's own paper form: a patient_paper_consent row, kept on
//   the record as a fact, never counted as consent to the notice.
// - The paper patient record's dental and medical history (3 Oct 2026,
//   src/lib/paper-history.ts): the three lists keep their columns, the paper's
//   other answers are answers.paper on the same version, and every writer here
//   (saveHealth, recheckHealth) carries them, as patient-add.ts and import.ts
//   do. A form drawn before them carries no `has_paper` and keeps what is saved.

import type { Tx } from './db';
import {
  pickWords, canonicalWord, labelOf, readPaperHistory, mergePaper, samePaper, paperToStored, paperFromStored, paperChanges, pregnancyTwin,
  type PaperAnswers, type PaperAnswersIn, type PaperTyped, type OwnWords,
} from './paper-history';

// ---------------------------------------------------------------------------
// The three lists and their quick picks. Picks are shortcuts for spelling,
// nothing more: anything can be typed. A typed value that matches a pick in
// any case is stored with the pick's spelling, so "penicillin" and
// "Penicillin" are one allergy. The picks are the paper record's boxes in the
// paper's order, then the desk's own (paper-history.ts LIST_WORDS): stored as
// the words the record has always used ("Hypertension"), drawn with the
// paper's ("High blood pressure"), and what the desk types is read through
// the same table ("high blood pressure" is stored "Hypertension").
// ---------------------------------------------------------------------------
export const LISTS = [
  { key: 'allergies', label: 'Allergies', one: 'allergy', none: 'None known', picks: pickWords('allergies') },
  { key: 'conditions', label: 'Conditions', one: 'condition', none: 'None', picks: pickWords('conditions') },
  { key: 'medications', label: 'Current medications', one: 'medication', none: 'None', picks: pickWords('medications') },
] as const;

export type ListKey = (typeof LISTS)[number]['key'];

export const ITEM_MAX = 60;
/** Every one of the paper's 23 conditions can be ticked, with room for more. */
export const ITEMS_MAX = 30;
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
  /** The paper record's other answers on this version (answers.paper, paper-history.ts), or null when none is answered. */
  paper: PaperAnswers | null;
  at: Date;
  /** The staff member's name, or null for a row nobody on the team typed (the development seed, the patient forms). */
  by: string | null;
  /** 'patient': the patient answered it themselves, on the patient forms (028); 'staff': typed at the clinic. */
  answeredBy: 'patient' | 'staff';
  /** The patient forms it came from (QR-7K2F), or null. The form itself: src/lib/patient-forms.ts. */
  formRef: string | null;
  /** The intake's page 1 it came from (IN-7K2F, 039), or null. The intake itself: src/lib/intake.ts. */
  intakeRef: string | null;
  /** When those forms (the QR forms or the intake) were sent — the version itself is dated when it was added to the record — or null. */
  formSentAt: Date | null;
  /** Set when this version changed the birth date on file. */
  birthChange: BirthChange | null;
}

// ---------------------------------------------------------------------------
// Dates. Manila's calendar, because that is the day the clinic is in.
// ---------------------------------------------------------------------------
const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

/**
 * Trimmed, de-duplicated in any case, spelled like the pick when it is one. Order kept. `canon`: another
 * spelling of a pick to its stored word ("High blood pressure" → "Hypertension"; paper-history.ts canonicalWord).
 */
export function cleanList(raw: unknown[], picks: readonly string[] = [], canon?: (v: string) => string | null): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const r of raw) {
    const t = oneLine(r);
    const v = (t && canon?.(t)) || t;
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
 * (`allergies_none`). Plus `birth_date` (YYYY-MM-DD or empty) and `note`, and
 * the paper record's other answers (`ph_*`, read only when the form carries
 * `has_paper`: paper-history.ts readPaperHistory; `paper` is undefined without it,
 * and the save keeps what is on file).
 * Returns the answers, the birth date, the paper's answers and what was typed
 * in them, and every problem in one list.
 */
export function readHealthForm(form: FormData, today = manilaToday()): {
  answers: HealthAnswers; birth: string | null; paper: PaperAnswersIn | undefined; paperTyped: PaperTyped; problems: string[];
} {
  const problems: string[] = [];
  const answers: HealthAnswers = { allergies: null, conditions: null, medications: null, note: null };

  for (const l of LISTS) {
    const typed = String(form.get(`${l.key}_add`) ?? '').split(/[,;\n]/);
    const list = cleanList([...form.getAll(l.key), ...typed], l.picks, (v) => canonicalWord(l.key, v));
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
  const paper = readPaperHistory(form, today);
  problems.push(...paper.problems);
  return { answers, birth, paper: paper.paper, paperTyped: paper.typed, problems };
}

// ---------------------------------------------------------------------------
// Comparing versions, for the history and for "did anything change"
// ---------------------------------------------------------------------------
/** A list word compared by what it means: another spelling of a pick is the pick ("High blood pressure" is "Hypertension"), in any case. */
const wordKey = (key: string, v: string) => lower(canonicalWord(key, v) ?? v);

/** The same list, word for word, spellings of one pick counting as one (the form posts a pick's own spelling). */
const sameList = (key: string, a: string[] | null, b: string[] | null): boolean => {
  if (a === null || b === null) return a === b;
  const x = new Set(a.map((v) => wordKey(key, v))), y = new Set(b.map((v) => wordKey(key, v)));
  return x.size === y.size && [...y].every((v) => x.has(v));
};

export const sameAnswers = (a: HealthAnswers | null, b: HealthAnswers): boolean =>
  LISTS.every((l) => sameList(l.key, a?.[l.key] ?? null, b[l.key])) && (a?.note ?? null) === b.note;

/** True when at least one question has an answer, "none" included; on a version, any of the paper record's answers too (saveHealth's rule). */
export const answered = (a: (HealthAnswers & { paper?: PaperAnswers | null }) | null): boolean =>
  !!a && (LISTS.some((l) => a[l.key] !== null) || !!a.note || !!a.paper);

/** A list as a person would read it: "Penicillin, Latex", "none", or "not asked". */
export const listText = (v: string[] | null, none = 'none'): string => (v === null ? 'not asked' : v.length ? v.join(', ') : none);

/** What changed from one version to the next, in short phrases. [] means nothing did. */
export function changes(prev: HealthAnswers | null, next: HealthAnswers): string[] {
  const out: string[] = [];
  for (const l of LISTS) {
    const a = prev?.[l.key] ?? null, b = next[l.key];
    if (sameList(l.key, a, b)) continue;
    if (b === null) { out.push(`${l.label}: answer cleared`); continue; }
    if (b.length === 0) { out.push(`${l.label}: ${lower(l.none)}`); continue; }
    // Another spelling of the same pick is neither added nor removed.
    const had = new Set((a ?? []).map((v) => wordKey(l.key, v))), has = new Set(b.map((v) => wordKey(l.key, v)));
    // In the paper's words where it has them ("High blood pressure" for the stored "Hypertension").
    const added = [...new Set(b.filter((v) => !had.has(wordKey(l.key, v))).map((v) => labelOf(l.key, v)))];
    const removed = [...new Set((a ?? []).filter((v) => !has.has(wordKey(l.key, v))).map((v) => labelOf(l.key, v)))];
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

/** What one version changed: the birth date first, then the answers, then the paper record's other answers. [] means nothing did. */
export const versionChanges = (prev: (HealthAnswers & { paper?: PaperAnswers | null }) | null, v: HealthVersion): string[] =>
  [...(v.birthChange ? [birthChangeText(v.birthChange)] : []), ...(prev ? [...changes(prev, v), ...paperChanges(prev.paper ?? null, v.paper)] : [])];

// ---------------------------------------------------------------------------
// The database. Every function takes the caller's withClinic() transaction.
// ---------------------------------------------------------------------------
type Row = {
  id: string; at: Date; by: string | null; allergies: string[] | null; conditions: string[] | null; medications: string[] | null; note: string | null;
  birth_change: { from?: unknown; to?: unknown } | null; total: number; answered_by: string; form_ref: string | null; intake_ref: string | null; form_sent_at: Date | null;
  paper: unknown;
};
const ymdOrNull = (v: unknown): string | null => (typeof v === 'string' && YMD.test(v) ? v : null);

/**
 * Newest first, up to `limit` versions, plus how many there are in all. With `withOwn` (the record's read, by
 * default whenever more than one version is asked for), also the patient's own answers on file (readOwnWords),
 * which the paper record's boxes show where the desk has none.
 */
export async function readHealth(tx: Tx, patientId: string, limit = 12, withOwn = limit > 1): Promise<{ versions: HealthVersion[]; total: number; older: HealthVersion | null; own: OwnWords | null }> {
  // One extra row, so the oldest one shown can still say what it changed.
  const { rows } = await tx.query<Row>(
    `select h.id, h.answered_at as at, s.full_name as by, h.allergies, h.conditions, h.medications, h.note,
            h.answers -> 'birth_date' as birth_change, (count(*) over ())::int as total, h.answered_by, f.ref as form_ref, i.ref as intake_ref,
            coalesce(f.submitted_at, i.sent_at) as form_sent_at, h.answers -> 'paper' as paper
       from medical_history h left join staff s on s.id = h.recorded_by left join patient_form f on f.id = h.form_id left join intake i on i.id = h.intake_id
      where h.patient_id = $1
      order by h.answered_at desc, h.id desc
      limit $2`, [patientId, limit + 1]);
  const versions: HealthVersion[] = rows.map(({ total: _t, birth_change: b, answered_by: ab, form_ref: fr, intake_ref: ir, form_sent_at: fs, paper, ...v }) => ({
    ...v,
    paper: paperFromStored(paper),
    birthChange: b && typeof b === 'object' ? { from: ymdOrNull(b.from), to: ymdOrNull(b.to) } : null,
    answeredBy: ab === 'patient' ? 'patient' : 'staff',
    formRef: fr ?? null,
    intakeRef: ir ?? null,
    formSentAt: fs ?? null,
  }));
  const own = withOwn && rows.length ? await readOwnWords(tx, patientId) : null;
  return { versions: versions.slice(0, limit), total: rows[0]?.total ?? 0, older: versions[limit] ?? null, own };
}

/**
 * The patient's own words on file: answers.health of the newest version the patient answered that has one (the
 * patient forms, or an intake's page 1), and answers.teeth of the newest that has one (the patient forms only),
 * each with when it was sent and which forms (QR-… or IN-…). Null when the patient never answered. Only the record
 * draws them.
 */
export async function readOwnWords(tx: Tx, patientId: string): Promise<OwnWords | null> {
  const part = (key: 'health' | 'teeth') => `(
    select jsonb_build_object('v', h.answers -> '${key}', 'at', coalesce(f.submitted_at, i.sent_at, h.answered_at),
                              'kind', case when h.intake_id is not null then 'intake' else 'form' end, 'ref', coalesce(f.ref, i.ref))
      from medical_history h left join patient_form f on f.id = h.form_id left join intake i on i.id = h.intake_id
     where h.patient_id = $1 and h.answered_by = 'patient' and jsonb_typeof(h.answers -> '${key}') = 'object'
     order by h.answered_at desc, h.id desc limit 1)`;
  type Part = { v: Record<string, unknown>; at: string; kind: 'form' | 'intake'; ref: string | null } | null;
  const r = (await tx.query<{ health: Part; teeth: Part }>(
    `select ${part('health')} as health, ${part('teeth')} as teeth`, [patientId])).rows[0];
  if (!r?.health && !r?.teeth) return null;
  const from = (x: Part) => (x ? { kind: x.kind === 'intake' ? 'intake' as const : 'form' as const, ref: x.ref ?? null } : null);
  return { health: r.health?.v ?? null, healthAt: r.health?.at ?? null, healthFrom: from(r.health), teeth: r.teeth?.v ?? null, teethAt: r.teeth?.at ?? null, teethFrom: from(r.teeth) };
}

/**
 * May this person write this branch's records? Their role's "records.edit"
 * (every default role has it), unless the branch's can_edit_records switch
 * takes it away: staff_can() in migration 030, the SQL twin of can() in
 * src/lib/can.ts. Read in the transaction that writes, so a role changed a
 * moment ago already counts.
 */
export async function canEditRecords(tx: Tx, staffId: string, clinicId: string): Promise<boolean> {
  const { rows } = await tx.query<{ ok: boolean }>(`select staff_can($1, $2, 'records.edit') as ok`, [staffId, clinicId]);
  return rows[0]?.ok === true;
}

export type SaveResult =
  | { kind: 'none' }
  /** Someone saved after this page opened. `birth` is the birth date on file now; `basePaper` the paper record's answers
   *  on the version the page opened from, so the page keeps only this person's own changes over what is on file (rebasePaper). */
  | { kind: 'conflict'; latest: HealthVersion | null; birth: string | null; basePaper: PaperAnswers | null }
  | { kind: 'unchanged' }
  | { kind: 'saved'; answers: boolean; birth: boolean };

/**
 * Save the health form. Writes a new medical_history version when the
 * answers changed, when the birth date changed, or when neither did but
 * something is answered (a Save that says "checked with the patient, still
 * true"). A birth date change updates the patient row and is written into
 * the version's `answers` as {"birth_date": {"from", "to"}}, so the old value
 * is never lost. The paper record's other answers go into the same `answers`
 * as "paper", posted over the saved ones (paper-history.ts mergePaper), and
 * count as answers here. Audit rows: health.update for the answers (or the
 * check), patient.birth_date for the birth date.
 *
 * `base` is the version the page opened with and `birthWas` the birth date it
 * showed. If a newer version exists, or this person changed the birth date
 * and the one on file is no longer what they saw, nothing is written. A birth
 * date this person did not touch is left as it is on file, whatever the page
 * still shows.
 */
export async function saveHealth(tx: Tx, a: {
  clinicId: string; staffId: string; patientId: string; base: string; answers: HealthAnswers; birth: string | null; birthWas: string | null;
  /** The paper record's other answers as posted (readHealthForm's `paper`). Undefined: the form did not carry them, and the saved ones stay. */
  paper?: PaperAnswersIn;
}): Promise<SaveResult> {
  const p = (await tx.query<{ birth: string | null }>(
    `select to_char(birth_date, 'YYYY-MM-DD') as birth from patient where id = $1 and archived_at is null for update`, [a.patientId])).rows[0];
  if (!p) return { kind: 'none' };
  const stored = p.birth ?? null;

  const latest = (await readHealth(tx, a.patientId, 1)).versions[0] ?? null;
  const birthEdited = a.birth !== a.birthWas;
  if ((latest?.id ?? 'none') !== a.base || (birthEdited && stored !== a.birthWas)) {
    const basePaper = UUID.test(a.base) ? paperFromStored((await tx.query<{ paper: unknown }>(
      `select answers -> 'paper' as paper from medical_history where id = $1 and patient_id = $2`, [a.base, a.patientId])).rows[0]?.paper ?? null) : null;
    return { kind: 'conflict', latest, birth: stored, basePaper };
  }

  const birthChanged = birthEdited && a.birth !== stored;
  // The paper's answers as posted over the saved ones (a question the form did not draw stays as saved), and,
  // when this form asked about pregnancy, "Pregnancy" on the conditions list beside the answer (the list is what the
  // alerts read; the form draws no Pregnancy chip beside the question). A form that did not ask keeps its list as posted.
  const paper = mergePaper(latest?.paper ?? null, a.paper);
  const answers: HealthAnswers = a.paper?.pregnant !== undefined ? { ...a.answers, conditions: pregnancyTwin(a.answers.conditions, a.paper.pregnant) } : a.answers;
  const answersChanged = !sameAnswers(latest, answers) || !samePaper(latest?.paper ?? null, paper);
  const checked = !answersChanged && !birthChanged && answered({ ...answers, paper });
  if (!answersChanged && !birthChanged && !checked) return { kind: 'unchanged' };

  const audit = (action: string) => tx.query(
    `insert into audit_log (clinic_id, staff_id, action, entity, entity_id) values ($1, $2, $3, 'patient', $4)`,
    [a.clinicId, a.staffId, action, a.patientId]);

  await tx.query(
    `insert into medical_history (clinic_id, patient_id, answered_by, recorded_by, allergies, conditions, medications, note, answers)
     values ($1, $2, 'staff', $3, $4, $5, $6, $7, $8)`,
    [a.clinicId, a.patientId, a.staffId, answers.allergies, answers.conditions, answers.medications, answers.note,
      JSON.stringify({ ...(birthChanged ? { birth_date: { from: stored, to: a.birth } } : {}), ...(paper ? { paper: paperToStored(paper) } : {}) })]);
  if (answersChanged || checked) await audit('health.update');
  if (birthChanged) {
    await tx.query('update patient set birth_date = $2, updated_at = now() where id = $1', [a.patientId, a.birth]);
    await audit('patient.birth_date');
  }
  return { kind: 'saved', answers: answersChanged || checked, birth: birthChanged };
}

/**
 * "No change since <date>": the desk asked the patient at this visit and the health history still holds
 * (036, the record's This visit strip). Writes a new version that copies the latest answers under the
 * person who asked — the same row a Save with nothing changed writes — so the history shows when it was
 * last checked, and a history over a year old stops being flagged. Nothing to copy (never asked) is
 * 'none'; a version already saved today is 'today', so a second press writes nothing.
 */
export async function recheckHealth(tx: Tx, a: { clinicId: string; staffId: string; patientId: string }): Promise<'none' | 'today' | 'saved'> {
  const here = (await tx.query('select 1 from patient where id = $1 and archived_at is null', [a.patientId])).rowCount;
  if (!here) return 'none';
  const latest = (await readHealth(tx, a.patientId, 1)).versions[0] ?? null;
  if (!latest || !answered(latest)) return 'none';
  if (manilaToday(new Date(latest.at)) === manilaToday()) return 'today';
  // The paper record's other answers are carried too: "no change" is no change to any of them.
  await tx.query(
    `insert into medical_history (clinic_id, patient_id, answered_by, recorded_by, allergies, conditions, medications, note, answers)
     values ($1, $2, 'staff', $3, $4, $5, $6, $7, $8)`,
    [a.clinicId, a.patientId, a.staffId, latest.allergies, latest.conditions, latest.medications, latest.note,
      JSON.stringify(latest.paper ? { paper: paperToStored(latest.paper) } : {})]);
  await tx.query(`insert into audit_log (clinic_id, staff_id, action, entity, entity_id) values ($1, $2, 'health.checked', 'patient', $3)`, [a.clinicId, a.staffId, a.patientId]);
  return 'saved';
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
  /** Signed on paper: the day on the paper (026). Null for every other channel. */
  signed_on: string | null;
}

/**
 * Consents to the privacy notice, newest first. A consent to examination and
 * treatment (consent_version.kind 'treatment', given on the patient forms,
 * 028) is not one of them: the patient forms list those (patientForms() in
 * src/lib/patient-forms.ts).
 */
export async function readConsents(tx: Tx, patientId: string): Promise<ConsentRow[]> {
  const { rows } = await tx.query(
    `select c.*, to_char(c.signed_on, 'YYYY-MM-DD') as signed_day, s.full_name as recorded_by_name
       from patient_consent c join consent_version v on v.id = c.version_id and v.kind = 'privacy'
       left join staff s on s.id = c.recorded_by
      where c.patient_id = $1 order by c.given_at desc`, [patientId]);
  return rows.map((r) => ({
    id: r.id, version_id: r.version_id, given_at: r.given_at, channel: r.channel, given_by_name: r.given_by_name,
    recorded_by_name: r.recorded_by_name, agreed_as: r.agreed_as === 'patient' || r.agreed_as === 'guardian' ? r.agreed_as : null,
    signed_on: r.signed_day ?? null,
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
export const CONSENT_HOW: Record<string, string> = { web: 'online', desk: 'at the desk', sms: 'by text', paper: 'on paper', form: 'on the patient forms' };

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

// ---------------------------------------------------------------------------
// Consent signed on paper
// ---------------------------------------------------------------------------
export type PaperWhat = 'notice' | 'clinic';

export interface PaperForm {
  id: string; signed_on: string; form_name: string; signed_by_name: string | null; agreed_as: AgreedAs | null;
  recorded_by_name: string | null; recorded_at: Date; imported: boolean;
}

/** The clinic's own paper consent forms on file (026), newest paper first. */
export async function readPaperForms(tx: Tx, patientId: string): Promise<PaperForm[]> {
  const { rows } = await tx.query(
    `select f.id, to_char(f.signed_on, 'YYYY-MM-DD') as signed_on, f.form_name, f.signed_by_name, f.agreed_as, f.recorded_at,
            f.import_id is not null as imported, s.full_name as recorded_by_name
       from patient_paper_consent f left join staff s on s.id = f.recorded_by
      where f.patient_id = $1 order by f.signed_on desc`, [patientId]);
  return rows.map((r) => ({ ...r, agreed_as: r.agreed_as === 'patient' || r.agreed_as === 'guardian' ? r.agreed_as : null }));
}

export interface PaperIn {
  what: PaperWhat | null;
  /** The notice the screen showed, for 'notice'. */
  version: string;
  signedOn: string;
  givenBy: string | null;
  agreedAs: AgreedAs | null;
}

/** The paper fields as posted (paper_*), and every problem with them. */
export function readPaperForm(form: FormData, today = manilaToday()): { paper: PaperIn; problems: string[] } {
  const problems: string[] = [];
  const whatRaw = String(form.get('paper_what') ?? '');
  const what: PaperWhat | null = whatRaw === 'notice' || whatRaw === 'clinic' ? whatRaw : null;
  const who = String(form.get('paper_agreed_as') ?? '');
  const agreedAs: AgreedAs | null = who === 'patient' || who === 'guardian' ? who : null;
  const givenBy = oneLine(form.get('paper_name')) || null;
  const signedOn = oneLine(form.get('paper_signed_on'));
  if (!what) problems.push('Say what was signed: a printed copy of the privacy notice, or the clinic’s own form.');
  if (!signedOn) problems.push('Write the date on the paper.');
  else if (!YMD.test(signedOn) || !(() => { const m = YMD.exec(signedOn)!; const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])); return d.getUTCDate() === +m[3] && d.getUTCMonth() === +m[2] - 1; })()) problems.push('The date on the paper is not a real date.');
  else if (signedOn > today) problems.push('The date on the paper is after today. Check it.');
  else if (signedOn < '1900-01-01') problems.push('The date on the paper is before 1900. Check the year.');
  if (givenBy && givenBy.length > NAME_MAX) problems.push(`Keep the name under ${NAME_MAX} characters.`);
  return { paper: { what, version: String(form.get('paper_version') ?? ''), signedOn, givenBy, agreedAs }, problems };
}

export type PaperResult =
  | 'none' | 'saved' | 'already'
  /** 'notice' asked, but no notice is in force, or another came into force since the page was drawn. */
  | 'no-notice' | 'changed'
  /** The paper is dated before the notice was in force: it cannot be consent to it. */
  | 'before'
  | 'who' | 'minor' | 'guardian-name';

/**
 * Record a consent signed on paper. 'notice': the notice in force, printed and
 * signed on `signedOn` — a patient_consent row (channel 'paper'), under the
 * desk's rules: who agreed, a parent or guardian (named) for a patient under
 * 18 on the day it was signed, one per notice unless a guardian's is added.
 * 'clinic': the clinic's own form — a patient_paper_consent row, one per day.
 * The patient row is locked first, like every write to a record.
 */
export async function recordPaperConsent(tx: Tx, a: { clinicId: string; staffId: string; patientId: string } & PaperIn): Promise<PaperResult> {
  const p = (await tx.query<{ birth: string | null }>(
    `select to_char(birth_date, 'YYYY-MM-DD') as birth from patient where id = $1 and archived_at is null for update`, [a.patientId])).rows[0];
  if (!p) return 'none';
  const audit = (action: string) => tx.query(
    `insert into audit_log (clinic_id, staff_id, action, entity, entity_id) values ($1, $2, $3, 'patient', $4)`, [a.clinicId, a.staffId, action, a.patientId]);
  if (a.what === 'clinic') {
    const r = await tx.query(
      `insert into patient_paper_consent (clinic_id, patient_id, signed_on, signed_by_name, agreed_as, recorded_by)
       values ($1, $2, $3, $4, $5, $6) on conflict (clinic_id, patient_id, signed_on) do nothing`,
      [a.clinicId, a.patientId, a.signedOn, a.givenBy, a.agreedAs, a.staffId]);
    if (!r.rowCount) return 'already';
    await audit('consent.paper_form');
    return 'saved';
  }
  const notice = await noticeInForce(tx);
  if (!notice) return 'no-notice';
  if (notice.id !== a.version) return 'changed';
  const eff = (await tx.query<{ d: string }>(`select effective_from::text as d from consent_version where id = $1`, [notice.id])).rows[0]?.d;
  if (eff && a.signedOn < eff) return 'before';
  if (!a.agreedAs) return 'who';
  if (isMinor(p.birth ?? null, a.signedOn) && a.agreedAs !== 'guardian') return 'minor';
  if (a.agreedAs === 'guardian' && !a.givenBy) return 'guardian-name';
  const had = (await tx.query<{ agreed_as: string | null }>(
    'select agreed_as from patient_consent where patient_id = $1 and version_id = $2', [a.patientId, notice.id])).rows;
  const addsGuardian = a.agreedAs === 'guardian' && !had.some((r) => r.agreed_as === 'guardian');
  if (had.length && !addsGuardian) return 'already';
  await tx.query(
    `insert into patient_consent (clinic_id, patient_id, version_id, channel, given_by_name, recorded_by, agreed_as, signed_on)
     values ($1, $2, $3, 'paper', $4, $5, $6, $7)`,
    [a.clinicId, a.patientId, notice.id, a.givenBy, a.staffId, a.agreedAs, a.signedOn]);
  await audit('consent.paper');
  return 'saved';
}

/** The sentence for each paper result the desk can act on. */
export const PAPER_WORDS: Record<Exclude<PaperResult, 'saved' | 'none'>, string> = {
  already: 'That paper is already on record, so it was not added again.',
  'no-notice': 'No privacy notice is in force, so a printed copy of it cannot have been signed. Record it as the clinic’s own form.',
  changed: 'The privacy notice changed while this page was open. Check which one the paper is, and record it again.',
  before: 'The paper is dated before this privacy notice was in force, so it cannot be consent to it. Record it as the clinic’s own form.',
  who: 'Say who signed: the patient, 18 or over, or a parent or guardian.',
  minor: 'The birth date on file makes the patient under 18 on the day it was signed, so a parent or guardian signs for them. Choose that, and write their name.',
  'guardian-name': 'A parent or guardian signed, so write their name as it is on the paper.',
};
