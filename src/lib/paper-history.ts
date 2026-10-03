// The dental history and the medical history as a clinic's printed patient information record asks them
// (3 Oct 2026, the owner: "a digital copy of the real form"). The questions, in the paper's order and words;
// the paper's conditions and allergies as the words the record already stores; the reader of the health form's
// extra fields; sameness and the changes in words for Earlier versions; and the words each box on the record
// shows. Pure: no Node or database imports, and nothing imported at all, so health.ts, the pages and their
// scripts may all import it. health.ts reads and writes; _record/PaperHistory.astro and PaperHistoryFields.astro
// draw.
//
// Rules kept:
// - medical_history stays the one versioned store. The three lists stay in their columns (the calendar, the
//   Patients list, the clearance letter and the head's chips read them); everything else on the paper is
//   medical_history.answers.paper, a flat object versioned by `v`, beside the forms' own `health` / `teeth`
//   and 021's `birth_date`. Every save is a new version that carries it, and every writer copies it forward.
// - null is "nobody has asked", as in health.ts. A yes/no is 'yes' | 'no' | null; a checklist is null, []
//   ("none of these") or its values. A box with nothing on file says so.
// - The paper's boxes are labels over the words already stored: "High blood pressure" is the stored
//   "Hypertension" (the patient forms and the desk have always written that), so old rows tick the right box
//   and backend-test's words still hold. A merged answer on the patient forms ("Sensitive to hot, cold or
//   sweet") is never spread over the paper's separate boxes: where the desk has no answer the box shows the
//   form's own words, marked as theirs.
// - A patient's own newer answer to the same question replaces the desk's older one (paperAfterOwn, when
//   forms or an intake are added to a record), so the record never shows the desk's old "No" over a newer
//   "Yes" on the forms.
// - Dates on the paper are partial: a year, a month and year, or a day (YYYY | YYYY-MM | YYYY-MM-DD), never
//   after today, not before 1900.

export const PAPER_VERSION = 'paper-2026-10';

export interface PaperChoice { value: string; label: string }

// ---------------------------------------------------------------------------
// The choices, in the paper's order and words (sentence case)
// ---------------------------------------------------------------------------
/** Dental history: the problems the patient has or had, as the paper lists them. */
export const PROBLEMS: readonly PaperChoice[] = [
  { value: 'bad_breath', label: 'Bad breath' },
  { value: 'bleeding_gums', label: 'Bleeding gums' },
  { value: 'jaw_clicking', label: 'Clicking or popping jaws' },
  { value: 'food_trap', label: 'Food collection between teeth' },
  { value: 'grinding', label: 'Grinding teeth' },
  { value: 'loose_or_broken', label: 'Loose teeth or broken fillings' },
  { value: 'perio_treatment', label: 'Periodontal treatment' },
  { value: 'sens_cold', label: 'Sensitivity to cold' },
  { value: 'sens_hot', label: 'Sensitivity to hot' },
  { value: 'sens_sweets', label: 'Sensitivity to sweets' },
  { value: 'sens_biting', label: 'Sensitivity when biting' },
  { value: 'sores', label: 'Sores or growths in the mouth' },
];

export const FLOSSING: readonly PaperChoice[] = [
  { value: 'daily', label: 'Every day' },
  { value: 'weekly', label: 'A few times a week' },
  { value: 'sometimes', label: 'Now and then' },
  { value: 'never', label: 'Never' },
];

export const BRUSHING: readonly PaperChoice[] = [
  { value: 'twice', label: 'Twice a day or more' },
  { value: 'once', label: 'Once a day' },
  { value: 'some_days', label: 'Not every day' },
  { value: 'rarely', label: 'Rarely' },
];

export const YES_NO: readonly PaperChoice[] = [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }];

/**
 * One box of the paper's lists: the paper's `label`, the `word` the record stores (the column's spelling, the
 * same the patient forms write), and other spellings a person may type (`also`), all matched in any case.
 * `also` holds only other spellings of the same thing (case, US or UK spelling, one or many, the paper's own
 * label), never a broader or narrower word: a word on file goes through this table on every save, so "Anesthetic"
 * must not come back "Local anaesthetic", nor "HIV" "HIV or AIDS". For the same reason a box's word is never
 * narrower than the paper's label: the paper's "Ulcer" is stored "Ulcer", and the forms' "Stomach ulcers" stays
 * its own word beside it.
 */
export interface ListWord { label: string; word: string; also?: readonly string[] }

/** Medical history: "Do you have or have you had any of the following?", the paper's 23, in its order. */
export const PAPER_CONDITIONS: readonly ListWord[] = [
  { label: 'Anemia', word: 'Anaemia', also: ['Anemia'] },
  { label: 'Arthritis/rheumatism', word: 'Arthritis or rheumatism', also: ['Arthritis/rheumatism'] },
  { label: 'Artificial heart valves', word: 'Artificial heart valves', also: ['Artificial heart valve'] },
  { label: 'Artificial joints', word: 'Joint replacement or implant', also: ['Artificial joints', 'Artificial joint', 'Joint replacement'] },
  { label: 'Asthma', word: 'Asthma' },
  { label: 'Blood disease', word: 'Blood disease' },
  { label: 'Cancer', word: 'Cancer or tumours', also: ['Cancer', 'Cancer or tumors'] },
  { label: 'Persistent cough', word: 'Persistent cough' },
  { label: 'Diabetes', word: 'Diabetes' },
  { label: 'Heart problems', word: 'Heart condition', also: ['Heart problems', 'Heart problem', 'Heart disease'] },
  { label: 'Hemophilia', word: 'Hemophilia', also: ['Haemophilia'] },
  { label: 'Hepatitis', word: 'Hepatitis' },
  { label: 'High blood pressure', word: 'Hypertension', also: ['High blood pressure'] },
  { label: 'HIV/AIDS', word: 'HIV or AIDS', also: ['HIV/AIDS'] },
  { label: 'Kidney disease', word: 'Kidney disease' },
  { label: 'Liver disease', word: 'Liver disease' },
  { label: 'Pacemaker', word: 'Pacemaker' },
  { label: 'Respiratory disease', word: 'Breathing problems', also: ['Respiratory disease'] },
  { label: 'Skin rash', word: 'Skin rash' },
  { label: 'Stroke', word: 'Stroke' },
  { label: 'Thyroid problems', word: 'Thyroid problem', also: ['Thyroid problems'] },
  { label: 'Tuberculosis', word: 'Tuberculosis (TB)', also: ['Tuberculosis', 'TB'] },
  { label: 'Ulcer', word: 'Ulcer', also: ['Ulcers'] },
];

/** The desk's own condition picks that the paper does not list: records have them and the desk still needs them. */
export const DESK_CONDITIONS: readonly ListWord[] = [
  { label: 'Bleeding disorder', word: 'Bleeding disorder' },
  { label: 'Epilepsy', word: 'Epilepsy' },
  { label: 'Pregnancy', word: 'Pregnancy' },
];

/** The paper asks pregnancy as its own question; the conditions list keeps "Pregnancy" as its alert (pregnancyTwin). */
export const PREGNANCY = 'Pregnancy';

/** "Are you allergic to drugs (penicillin), latex, metals, plastic, anesthetics, foods, materials or pollen?", then the desk's own. */
export const PAPER_ALLERGIES: readonly ListWord[] = [
  { label: 'Penicillin', word: 'Penicillin' },
  { label: 'Latex', word: 'Latex' },
  { label: 'Metals', word: 'Metals', also: ['Metal'] },
  { label: 'Plastic', word: 'Plastic', also: ['Plastics'] },
  { label: 'Local anaesthetic', word: 'Local anaesthetic', also: ['Local anesthetic'] },
  { label: 'Foods', word: 'Foods', also: ['Food'] },
  { label: 'Pollen', word: 'Pollen' },
];
const DESK_ALLERGIES: readonly ListWord[] = ['Amoxicillin', 'Ibuprofen', 'Aspirin', 'Sulfa drugs', 'Iodine'].map((w) => ({ label: w, word: w }));

const DESK_MEDICATIONS: readonly ListWord[] = ['Blood thinner', 'Aspirin', 'Insulin', 'Metformin', 'Blood pressure maintenance'].map((w) => ({ label: w, word: w }));

export type ListName = 'allergies' | 'conditions' | 'medications';

/** Each list's boxes in the order the desk's form draws them: the paper's first, then the desk's own. */
export const LIST_WORDS: Readonly<Record<ListName, readonly ListWord[]>> = {
  allergies: [...PAPER_ALLERGIES, ...DESK_ALLERGIES],
  conditions: [...PAPER_CONDITIONS, ...DESK_CONDITIONS],
  medications: DESK_MEDICATIONS,
};

/** The stored words of a list's quick picks, in order: what health.ts LISTS calls its picks. */
export const pickWords = (key: ListName): string[] => LIST_WORDS[key].map((w) => w.word);

const low = (s: string) => s.toLocaleLowerCase('en');

/** The stored word for what a person typed or ticked ("high blood pressure" → "Hypertension"), or null when it is not one of the list's boxes. */
export function canonicalWord(key: string, typed: string): string | null {
  const t = low(typed.trim());
  if (!t) return null;
  const hit = (LIST_WORDS[key as ListName] ?? []).find((w) => low(w.word) === t || low(w.label) === t || (w.also ?? []).some((a) => low(a) === t));
  return hit ? hit.word : null;
}

/** The words a box is drawn with for a stored word: the paper's label where it has one ("Hypertension" → "High blood pressure"), else the word. */
export function labelOf(key: string, word: string): string {
  const c = canonicalWord(key, word);
  return (c && (LIST_WORDS[key as ListName] ?? []).find((w) => w.word === c)?.label) || word;
}

// ---------------------------------------------------------------------------
// The answers the paper adds (medical_history.answers.paper)
// ---------------------------------------------------------------------------
export type YesNo = 'yes' | 'no';

export interface PaperAnswers {
  /** Dental history: the former dentist, where, their number. */
  dentist_name: string | null; dentist_place: string | null; dentist_phone: string | null;
  /** Partial dates (YYYY | YYYY-MM | YYYY-MM-DD). */
  last_care: string | null; last_xray: string | null;
  flossing: string | null; brushing: string | null;
  /** PROBLEMS values, in its order. [] is "none of these". */
  problems: string[] | null;
  /** Medical history: the physician, where, the last visit (a partial date). */
  physician_name: string | null; physician_place: string | null; physician_visit: string | null;
  transfusion: YesNo | null; transfusion_when: string | null;
  pregnant: YesNo | null; nursing: YesNo | null; pill: YesNo | null;
  illnesses: string | null;
}
export type PaperKey = keyof PaperAnswers;

/** A post of the health form's paper fields: a key left undefined was not on the form (the pregnancy questions are drawn only where they apply), so the saved answer stays. */
export type PaperAnswersIn = { [K in PaperKey]?: PaperAnswers[K] };

/** What the paper fields held as typed, by the form's field name: for drawing a post that came back. */
export type PaperTyped = Record<string, string | string[]>;

type Kind = 'text' | 'phone' | 'date' | 'choice' | 'yesno' | 'checks';

export interface PaperField {
  key: PaperKey;
  /** The form's field name. */
  name: string;
  part: 'dental' | 'medical';
  /** The paper's label, sentence case. */
  label: string;
  /** The same, standing alone (Earlier versions, a refusal): "Former dentist’s location". */
  long: string;
  /** What the box's button changes, after "Add the" or "Change the": "former dentist’s location". */
  say: string;
  kind: Kind;
  max?: number;
  choices?: readonly PaperChoice[];
  /** 'pregnancy': asked only of a patient who is not male, 12 or older (the patient forms' rule). */
  group?: 'pregnancy';
}

export const PAPER_FIELDS: readonly PaperField[] = [
  { key: 'dentist_name', name: 'ph_dentist_name', part: 'dental', label: 'Former dentist’s name', long: 'Former dentist', say: 'former dentist’s name', kind: 'text', max: 120 },
  { key: 'dentist_place', name: 'ph_dentist_place', part: 'dental', label: 'Location', long: 'Former dentist’s location', say: 'former dentist’s location', kind: 'text', max: 80 },
  { key: 'dentist_phone', name: 'ph_dentist_phone', part: 'dental', label: 'Contact number', long: 'Former dentist’s contact number', say: 'former dentist’s contact number', kind: 'phone', max: 20 },
  { key: 'last_care', name: 'ph_last_care', part: 'dental', label: 'Date of last dental care', long: 'Last dental care', say: 'date of last dental care', kind: 'date' },
  { key: 'last_xray', name: 'ph_last_xray', part: 'dental', label: 'Date of last dental X-ray', long: 'Last dental X-ray', say: 'date of last dental X-ray', kind: 'date' },
  { key: 'flossing', name: 'ph_flossing', part: 'dental', label: 'Flossing frequency', long: 'Flossing', say: 'flossing frequency', kind: 'choice', choices: FLOSSING },
  { key: 'brushing', name: 'ph_brushing', part: 'dental', label: 'Brushing frequency', long: 'Brushing', say: 'brushing frequency', kind: 'choice', choices: BRUSHING },
  { key: 'problems', name: 'ph_problems', part: 'dental', label: 'Problems they have or had', long: 'Dental problems', say: 'dental problems', kind: 'checks', choices: PROBLEMS },
  { key: 'physician_name', name: 'ph_physician_name', part: 'medical', label: 'Physician’s name', long: 'Physician', say: 'physician’s name', kind: 'text', max: 120 },
  { key: 'physician_place', name: 'ph_physician_place', part: 'medical', label: 'Location', long: 'Physician’s location', say: 'physician’s location', kind: 'text', max: 80 },
  { key: 'physician_visit', name: 'ph_physician_visit', part: 'medical', label: 'Date of last visit', long: 'Last visit to the physician', say: 'date of the last visit to the physician', kind: 'date' },
  { key: 'transfusion', name: 'ph_transfusion', part: 'medical', label: 'Blood transfusion', long: 'Blood transfusion', say: 'blood transfusion answer', kind: 'yesno', choices: YES_NO },
  { key: 'transfusion_when', name: 'ph_transfusion_when', part: 'medical', label: 'Approximate date', long: 'Date of the transfusion', say: 'date of the transfusion', kind: 'date' },
  { key: 'pregnant', name: 'ph_pregnant', part: 'medical', label: 'Pregnant', long: 'Pregnant', say: 'pregnancy answer', kind: 'yesno', choices: YES_NO, group: 'pregnancy' },
  { key: 'nursing', name: 'ph_nursing', part: 'medical', label: 'Nursing', long: 'Nursing', say: 'nursing answer', kind: 'yesno', choices: YES_NO, group: 'pregnancy' },
  { key: 'pill', name: 'ph_pill', part: 'medical', label: 'Taking birth control pills', long: 'Birth control pills', say: 'birth control pills answer', kind: 'yesno', choices: YES_NO, group: 'pregnancy' },
  { key: 'illnesses', name: 'ph_illnesses', part: 'medical', label: 'Other serious illnesses or operations', long: 'Other serious illnesses or operations', say: 'other serious illnesses or operations', kind: 'text', max: 300 },
];
export const FIELD: Readonly<Record<PaperKey, PaperField>> = Object.fromEntries(PAPER_FIELDS.map((f) => [f.key, f])) as Record<PaperKey, PaperField>;

/** The hidden fields the health form carries: the paper's fields are on it, and (separately) the pregnancy questions are. */
export const HAS_PAPER = 'has_paper';
export const HAS_PAPER_PREGNANCY = 'has_paper_pregnancy';
export const NONE_SUFFIX = '_none';

/** The patient forms' rule: the pregnancy questions are for a patient who is not male and is 12 or older (or whose age is not known). */
export const PREGNANCY_FROM_AGE = 12;
export const asksPregnancy = (sex: string | null | undefined, age: number | null): boolean => sex !== 'male' && (age === null || age >= PREGNANCY_FROM_AGE);

/** An answer is on file under this key: neither null, missing nor blank. */
const said = (o: Record<string, unknown> | null | undefined, k: string) => { const v = o?.[k]; return v !== null && v !== undefined && v !== ''; };
const listsPregnancy = (conditions: string[] | null | undefined) => (conditions ?? []).some((c) => low(c) === low(PREGNANCY));

/**
 * Whether the pregnancy questions are drawn: where they apply (`ask`, asksPregnancy), or wherever one is answered
 * — a saved answer, "Pregnancy" on the conditions list, or the patient's own words. One rule for the record's boxes
 * (paperBoxes) and the health form's questions (PaperHistoryFields), so a box's plus always lands on its question,
 * and an answer given before the sex or the birth date said otherwise can still be changed or cleared.
 */
export function showsPregnancy(ask: boolean, latest: { conditions: string[] | null; paper: PaperAnswers | null } | null, ownHealth: Record<string, unknown> | null): boolean {
  return ask || (['pregnant', 'nursing', 'pill'] as const).some((k) => latest?.paper?.[k] != null) || listsPregnancy(latest?.conditions)
    || ['pregnant', 'nursing', 'birth_control'].some((k) => said(ownHealth, k));
}

export const emptyPaper = (): PaperAnswers =>
  Object.fromEntries(PAPER_FIELDS.map((f) => [f.key, null])) as unknown as PaperAnswers;

// ---------------------------------------------------------------------------
// Partial dates
// ---------------------------------------------------------------------------
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const PARTIAL = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/;

/** "mar", "March", "Sept." → 3, 3, 9; null for anything else. */
function monthNo(w: string): number | null {
  const k = low(w).replace(/\.$/, '');
  if (k === 'sept') return 9;
  const i = MONTHS.findIndex((m) => low(m) === k || low(m).slice(0, 3) === k);
  return i < 0 ? null : i + 1;
}
const pad = (n: number) => String(n).padStart(2, '0');
const realDay = (y: number, m: number, d: number) => { const t = new Date(Date.UTC(y, m - 1, d)); return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d; };

/**
 * A date as a person writes it on the paper, to a partial date: "2024", "Mar 2024", "March 2024", "03/2024",
 * "12 Mar 2024", "Mar 12, 2024", or the stored forms (2024, 2024-03, 2024-03-12). A day written in numbers
 * alone (03/12/2024) is refused: it reads as March or December depending on who wrote it.
 * Returns the partial date, or a reason: 'form' (not a date this reads), 'future', 'old' (before 1900).
 */
export function readPartialDate(raw: string, today: string): { ok: string } | { bad: 'form' | 'future' | 'old' } {
  const t = raw.trim().replace(/\s+/g, ' ');
  let y: number, m: number | null = null, d: number | null = null, x: RegExpExecArray | null;
  if ((x = PARTIAL.exec(t))) { y = +x[1]; m = x[2] ? +x[2] : null; d = x[3] ? +x[3] : null; }
  else if ((x = /^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/.exec(t))) { y = +x[1]; m = +x[2]; d = x[3] ? +x[3] : null; }
  else if ((x = /^(\d{1,2})[/-](\d{4})$/.exec(t))) { y = +x[2]; m = +x[1]; }
  else if ((x = /^([A-Za-z.]+),? (\d{4})$/.exec(t))) { y = +x[2]; m = monthNo(x[1]); if (m === null) return { bad: 'form' }; }
  else if ((x = /^(\d{1,2}) ([A-Za-z.]+),? (\d{4})$/.exec(t))) { y = +x[3]; m = monthNo(x[2]); d = +x[1]; if (m === null) return { bad: 'form' }; }
  else if ((x = /^([A-Za-z.]+) (\d{1,2}),? (\d{4})$/.exec(t))) { y = +x[3]; m = monthNo(x[1]); d = +x[2]; if (m === null) return { bad: 'form' }; }
  else return { bad: 'form' };
  if (m !== null && (m < 1 || m > 12)) return { bad: 'form' };
  if (d !== null && (m === null || !realDay(y, m, d))) return { bad: 'form' };
  const out = m === null ? String(y) : d === null ? `${y}-${pad(m)}` : `${y}-${pad(m)}-${pad(d)}`;
  if (y < 1900) return { bad: 'old' };
  if (out > today.slice(0, out.length)) return { bad: 'future' };
  return { ok: out };
}

/** A partial date as people read it: "2024", "Mar 2024", "12 Mar 2024". Null for anything else. */
export function partialDateText(v: string | null | undefined): string | null {
  const x = PARTIAL.exec(v ?? '');
  if (!x) return null;
  const mon = x[2] ? MONTHS[+x[2] - 1]?.slice(0, 3) : null;
  if (x[2] && !mon) return null;
  return x[3] ? `${+x[3]} ${mon} ${x[1]}` : mon ? `${mon} ${x[1]}` : x[1];
}

/** The later of two partial dates, compared on what both say ("2024" against "2024-03-12" is the day). */
export function laterDate(a: string | null, b: string | null): string | null {
  if (!a || !b) return a ?? b;
  const n = Math.min(a.length, b.length);
  const x = a.slice(0, n), y = b.slice(0, n);
  return x === y ? (a.length >= b.length ? a : b) : x > y ? a : b;
}

// ---------------------------------------------------------------------------
// Reading the health form's paper fields
// ---------------------------------------------------------------------------
/** One line of plain text: control characters out, runs of space collapsed (health.ts's oneLine). */
const oneLine = (s: unknown): string =>
  String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();

const PHONE = /^[0-9+()\-./ ]+$/;

/** The words of a refused partial date. */
const dateProblem = (f: PaperField, bad: 'form' | 'future' | 'old') =>
  bad === 'future' ? `${f.long}: that is after today. Check the year.`
    : bad === 'old' ? `${f.long}: that is before 1900. Check the year.`
    : `${f.long}: write a year (2024), a month and year (Mar 2024) or a day (12 Mar 2024).`;

/**
 * The paper's fields as posted. Without `has_paper` the form is one drawn before they existed: `paper` is
 * undefined and the saved answers stay (044's rule for an older tab). The pregnancy questions are read only
 * when the form drew them (`has_paper_pregnancy`); otherwise they stay as saved. A transfusion date stands only
 * beside a Yes. A choice that is not on the list is no answer. Returns the answers, what was typed (to draw
 * the form again), and every problem.
 */
export function readPaperHistory(form: { get(name: string): unknown; getAll(name: string): unknown[] }, today: string): { paper: PaperAnswersIn | undefined; typed: PaperTyped; problems: string[] } {
  const typed: PaperTyped = {};
  const problems: string[] = [];
  if (oneLine(form.get(HAS_PAPER)) !== '1') return { paper: undefined, typed, problems };
  const asked = oneLine(form.get(HAS_PAPER_PREGNANCY)) === '1';
  const paper: PaperAnswersIn = {};
  for (const f of PAPER_FIELDS) {
    if (f.group === 'pregnancy' && !asked) continue;
    if (f.kind === 'checks') {
      const got = new Set(form.getAll(f.name).map((v) => oneLine(v)));
      const list = (f.choices ?? []).filter((c) => got.has(c.value)).map((c) => c.value);
      const none = oneLine(form.get(f.name + NONE_SUFFIX)) === '1';
      typed[f.name] = list;
      typed[f.name + NONE_SUFFIX] = none ? '1' : '';
      if (none && list.length) problems.push(`${f.long}: “None of these” is ticked, and so is ${labelFrom(f, list[0])}. Untick one.`);
      (paper as Record<string, unknown>)[f.key] = none ? [] : list.length ? list : null;
      continue;
    }
    const v = oneLine(form.get(f.name));
    typed[f.name] = v;
    let out: string | null = null;
    if (!v) out = null;
    else if (f.kind === 'choice' || f.kind === 'yesno') out = (f.choices ?? []).some((c) => c.value === v) ? v : null;
    else if (f.kind === 'date') {
      const r = readPartialDate(v, today);
      if ('ok' in r) out = r.ok; else problems.push(dateProblem(f, r.bad));
    } else if (f.max && v.length > f.max) problems.push(`${f.long}: keep it under ${f.max} characters; it has ${v.length}.`);
    else if (f.kind === 'phone') {
      const digits = v.replace(/\D/g, '').length;
      if (!PHONE.test(v) || digits < 7 || digits > 15) problems.push(`${f.long}: that does not read as a phone number. Write its digits, with the area code for a landline.`);
      else out = v;
    } else out = v;
    (paper as Record<string, unknown>)[f.key] = out;
  }
  if (paper.transfusion !== 'yes') paper.transfusion_when = null;
  return { paper, typed, problems };
}

const labelFrom = (f: PaperField, value: string) => (f.choices ?? []).find((c) => c.value === value)?.label ?? value;

/** The answers on file, as the form's fields hold them: what PaperHistoryFields draws when nothing came back from a post. */
export function paperTyped(p: PaperAnswers | null): PaperTyped {
  const out: PaperTyped = {};
  for (const f of PAPER_FIELDS) {
    const v = p?.[f.key] ?? null;
    if (f.kind === 'checks') { out[f.name] = (v as string[] | null) ?? []; out[f.name + NONE_SUFFIX] = Array.isArray(v) && v.length === 0 ? '1' : ''; }
    else if (f.kind === 'date') out[f.name] = partialDateText(v as string | null) ?? '';
    else out[f.name] = (v as string | null) ?? '';
  }
  return out;
}

// ---------------------------------------------------------------------------
// Stored, merged, compared
// ---------------------------------------------------------------------------
const isEmpty = (p: PaperAnswers) => PAPER_FIELDS.every((f) => p[f.key] === null);

/** What a save writes: the posted answers over the saved ones, key by key (a key the form did not carry stays as saved). Null when nothing is answered. */
export function mergePaper(saved: PaperAnswers | null, posted: PaperAnswersIn | undefined): PaperAnswers | null {
  if (posted === undefined) return saved;
  const out = emptyPaper() as unknown as Record<string, unknown>;
  for (const f of PAPER_FIELDS) out[f.key] = posted[f.key] !== undefined ? posted[f.key] : saved?.[f.key] ?? null;
  const p = out as unknown as PaperAnswers;
  if (p.transfusion !== 'yes') p.transfusion_when = null;
  return isEmpty(p) ? null : p;
}

/** The jsonb a version keeps under answers.paper: the version of the questions and every answered key. Null when nothing is answered. */
export function paperToStored(p: PaperAnswers | null): Record<string, unknown> | null {
  if (!p || isEmpty(p)) return null;
  const out: Record<string, unknown> = { v: PAPER_VERSION };
  for (const f of PAPER_FIELDS) if (p[f.key] !== null) out[f.key] = p[f.key];
  return out;
}

/** answers.paper as read from the database, checked key by key: anything not in the paper's shape is no answer. Null when nothing is answered. */
export function paperFromStored(raw: unknown): PaperAnswers | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const p = emptyPaper() as unknown as Record<string, unknown>;
  for (const f of PAPER_FIELDS) {
    const v = r[f.key];
    if (f.kind === 'checks') {
      if (Array.isArray(v)) { const has = new Set(v.map(String)); p[f.key] = (f.choices ?? []).filter((c) => has.has(c.value)).map((c) => c.value); }
    } else if (typeof v === 'string' && v) {
      if (f.kind === 'choice' || f.kind === 'yesno') p[f.key] = (f.choices ?? []).some((c) => c.value === v) ? v : null;
      else if (f.kind === 'date') p[f.key] = PARTIAL.test(v) ? v : null;
      else p[f.key] = v.slice(0, f.max ?? 300);
    }
  }
  const out = p as unknown as PaperAnswers;
  return isEmpty(out) ? null : out;
}

const sameValue = (a: unknown, b: unknown): boolean => {
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    const x = new Set(a);
    return a.length === b.length && b.every((v) => x.has(v));
  }
  return (a ?? null) === (b ?? null);
};

/** The same answers, key by key (a checklist in any order). Nothing answered on either side is the same. */
export const samePaper = (a: PaperAnswers | null, b: PaperAnswers | null): boolean =>
  PAPER_FIELDS.every((f) => sameValue(a?.[f.key] ?? null, b?.[f.key] ?? null));

/** One answer in words: "Mar 2024", "Twice a day or more", "Yes", "Bad breath, Grinding teeth", "None of these". */
export function paperValueText(f: PaperField, v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (f.kind === 'checks') return Array.isArray(v) ? (v.length ? v.map((x) => labelFrom(f, String(x))).join(', ') : 'None of these') : null;
  if (f.kind === 'date') return partialDateText(String(v));
  if (f.kind === 'choice' || f.kind === 'yesno') return labelFrom(f, String(v));
  return String(v);
}

/** What changed on the paper from one version to the next, in short phrases for Earlier versions. [] means nothing did. */
export function paperChanges(prev: PaperAnswers | null, next: PaperAnswers | null): string[] {
  const out: string[] = [];
  for (const f of PAPER_FIELDS) {
    const a = prev?.[f.key] ?? null, b = next?.[f.key] ?? null;
    if (sameValue(a, b)) continue;
    if (b === null) { out.push(`${f.long}: answer cleared`); continue; }
    if (f.kind === 'checks') {
      const had = (a as string[] | null) ?? [], has = b as string[];
      if (!has.length) { out.push(`${f.long}: none of these`); continue; }
      const added = has.filter((v) => !had.includes(v)), removed = had.filter((v) => !has.includes(v));
      out.push(`${f.long}: ${[added.length && `added ${added.map((v) => labelFrom(f, v)).join(', ')}`, removed.length && `removed ${removed.map((v) => labelFrom(f, v)).join(', ')}`].filter(Boolean).join('; ')}`);
    } else if (f.key === 'illnesses') out.push(a === null ? `${f.long} added` : `${f.long} changed`);
    else out.push(`${f.long}: ${paperValueText(f, b)}`);
  }
  return out;
}

/**
 * The paper's fields drawn again after a save conflict (someone saved the record after this page opened): from what
 * is on file now (`latest`), keeping only what this person changed from the version the page opened from (`base`).
 * So a second Save never puts an old answer back over a colleague's newer one. `clash`: the questions both changed,
 * to different answers, for the callout to name what is on file.
 */
export function rebasePaper(typed: PaperTyped, posted: PaperAnswersIn | undefined, base: PaperAnswers | null, latest: PaperAnswers | null): { typed: PaperTyped; clash: PaperKey[] } {
  const out = paperTyped(latest);
  const clash: PaperKey[] = [];
  for (const f of PAPER_FIELDS) {
    const mine = posted?.[f.key], was = base?.[f.key] ?? null, now = latest?.[f.key] ?? null;
    if (mine === undefined || sameValue(mine, was)) continue;
    for (const n of f.kind === 'checks' ? [f.name, f.name + NONE_SUFFIX] : [f.name]) if (typed[n] !== undefined) out[n] = typed[n];
    if (!sameValue(now, was) && !sameValue(now, mine)) clash.push(f.key);
  }
  return { typed: out, clash };
}

/**
 * The paper's answers once a patient's own answers (the patient forms' `health` and `teeth`, an intake's
 * `health`) are added to the record: the desk's older answer to a question the patient has now answered gives
 * way, so the record shows the newer one. The pregnancy questions, the last dental visit, and the former
 * dentist when the desk named one and the forms name a different one (case, dots and commas aside: "Dr Cruz" is
 * "Dr. Cruz"). A location or number the desk wrote with no name stays: the forms ask only for a name. Everything
 * else stays.
 */
export function paperAfterOwn(saved: PaperAnswers | null, health: Record<string, unknown> | null, teeth: Record<string, unknown> | null): PaperAnswers | null {
  if (!saved) return null;
  const p = { ...saved };
  const dentist = (s: unknown) => low(oneLine(String(s ?? '').replace(/[.,]/g, ' ')));
  if (said(health, 'pregnant')) p.pregnant = null;
  if (said(health, 'nursing')) p.nursing = null;
  if (said(health, 'birth_control')) p.pill = null;
  if (said(teeth, 'last_visit')) p.last_care = null;
  if (said(teeth, 'previous_dentist') && p.dentist_name && dentist(teeth!.previous_dentist) !== dentist(p.dentist_name)) {
    p.dentist_name = null; p.dentist_place = null; p.dentist_phone = null;
  }
  return isEmpty(p) ? null : p;
}

/**
 * The conditions list beside a pregnancy answer: "Pregnancy" is the list's alert for it (the calendar, the
 * Patients list and the head's chips read the list), so a Yes puts it on the list and a No takes it off. No
 * answer leaves the list as it is. saveHealth applies it only when the form asked (PaperHistoryFields draws no
 * Pregnancy chip beside the question); the patient forms keep their own rule (a Yes adds it, healthLists).
 */
export function pregnancyTwin(conditions: string[] | null, pregnant: YesNo | null): string[] | null {
  if (pregnant === null) return conditions;
  const has = (conditions ?? []).some((c) => low(c) === low(PREGNANCY));
  if (pregnant === 'yes') return has ? conditions : [...(conditions ?? []), PREGNANCY];
  return has ? (conditions ?? []).filter((c) => low(c) !== low(PREGNANCY)) : conditions;
}

// ---------------------------------------------------------------------------
// The record's boxes
// ---------------------------------------------------------------------------
/** Where a patient's own answers came from: the patient forms from the QR code (QR-…), or an intake's page 1 (IN-…). */
export interface OwnSource { kind: 'form' | 'intake'; ref: string | null }

/** The patient's own answers on file: the newest the patient forms or an intake's page 1 gave (health.ts readOwnWords). */
export interface OwnWords {
  /** answers.health of the newest version the patient answered that has one (the forms' or an intake's health step). */
  health: Record<string, unknown> | null;
  /** When those were sent. */
  healthAt: Date | string | null;
  /** Which forms they came from. */
  healthFrom?: OwnSource | null;
  /** answers.teeth of the newest version from the patient forms (an intake asks no teeth step). */
  teeth: Record<string, unknown> | null;
  teethAt: Date | string | null;
  teethFrom?: OwnSource | null;
}

export interface Box {
  key: string;
  /** The paper's label, sentence case. */
  label: string;
  /** Of the record's four columns. */
  span: 1 | 2 | 4;
  /** The answer in words, or null when nothing is on file (`empty` says how to put that). */
  text: string | null;
  /** A checklist box: the ticked boxes in the paper's words and order. */
  ticks?: string[];
  /** Also on file, not one of the paper's boxes ("Epilepsy"). */
  also?: string[];
  /** Words for nothing on file, where they are not the usual "Not on file": "Not asked yet". */
  empty?: string;
  /** Where the words came from when the desk has none: the patient forms or an intake's page 1 (`ref` its reference, `at` when sent). */
  from?: { what: 'form' | 'intake'; ref: string | null; at: Date | string | null };
  /** Drawn red: an allergy. */
  alert?: boolean;
  /** Keep the line breaks. */
  pre?: boolean;
  /** The health form's field that takes the caret; null: not changed on the health form. */
  field: string | null;
  /** The box's button, for a screen reader. */
  edit: string;
}

export interface BoxesIn {
  latest: { allergies: string[] | null; conditions: string[] | null; medications: string[] | null; note: string | null; paper: PaperAnswers | null } | null;
  own: OwnWords | null;
  /** The patient forms' own words for one of their answers (patient-forms-def's answerText over FIELDS[name]), or null. */
  ownText: (name: string, value: unknown) => string | null;
  /** Today's visit's reason, when there is a visit today. */
  reason: string | null;
  /** There is a visit today (its reason may still be blank). */
  visitToday: boolean;
  /** The pregnancy questions apply (asksPregnancy). Answered ones show whatever this says (showsPregnancy). */
  ask: boolean;
  /** The newest X-ray taken here (YYYY-MM-DD), or null. */
  xrayHere?: string | null;
}

const NOT_ASKED = 'Not asked yet';
const editWords = (has: boolean, f: PaperField) => `${has ? 'Change' : 'Add'} the ${f.say}`;

/** A list column as one line: "Penicillin, Latex", the list's word for none, or null (not asked). */
const listWords = (v: string[] | null, none: string) => (v === null ? null : v.length ? v.join(', ') : none);

/** A checklist list against the paper's boxes: the ticked boxes in the paper's order and words, and what else is on file. */
function checklist(key: ListName, on: string[], paper: readonly ListWord[], drop: string[] = []): { ticks: string[]; also: string[] } {
  const words = new Set(on.map((v) => canonicalWord(key, v) ?? v));
  const ticks = paper.filter((w) => words.has(w.word)).map((w) => w.label);
  const known = new Set(paper.map((w) => w.word));
  const skip = new Set(drop.map(low));
  const also = on.filter((v) => !known.has(canonicalWord(key, v) ?? v) && !skip.has(low(v))).map((v) => labelOf(key, v));
  return { ticks, also: [...new Set(also)] };
}

/** The Dental history's and the Medical history's boxes, in the paper's order, with the words each shows. */
export function paperBoxes(i: BoxesIn): { dental: Box[]; medical: Box[] } {
  const p = i.latest?.paper ?? null;
  const h = i.own?.health ?? null, t = i.own?.teeth ?? null;
  const fromHealth: Box['from'] = { what: i.own?.healthFrom?.kind ?? 'form', ref: i.own?.healthFrom?.ref ?? null, at: i.own?.healthAt ?? null };
  const fromTeeth: Box['from'] = { what: i.own?.teethFrom?.kind ?? 'form', ref: i.own?.teethFrom?.ref ?? null, at: i.own?.teethAt ?? null };
  const own = (o: Record<string, unknown> | null, name: string) => (o && o[name] !== null && o[name] !== undefined && o[name] !== '' ? i.ownText(name, o[name]) : null);

  const box = (key: PaperKey, span: 1 | 2 | 4, fallback?: { text: string | null; from: Box['from'] }): Box => {
    const f = FIELD[key];
    const text = paperValueText(f, p?.[key] ?? null);
    const b: Box = { key, label: f.label, span, text, field: f.name, edit: editWords(!!text, f), ...(f.kind === 'yesno' || f.kind === 'choice' || f.kind === 'checks' ? { empty: NOT_ASKED } : {}) };
    if (!text && fallback?.text) { b.text = fallback.text; b.from = fallback.from; }
    return b;
  };

  // --- Dental history
  const formReason = own(t, 'reason');
  const reason: Box = {
    key: 'reason', label: 'Reason for today’s visit', span: 4, text: i.reason || formReason, field: null, edit: '',
    empty: i.visitToday ? 'Not said' : 'No visit today',
    ...(!i.reason && formReason ? { from: fromTeeth } : {}),
  };
  const xray = box('last_xray', 1);
  const here = i.xrayHere ?? null;
  if (here && laterDate(p?.last_xray ?? null, here) === here && here !== p?.last_xray) xray.text = `${partialDateText(here)}, here`;
  const problems = box('problems', 4);
  if (Array.isArray(p?.problems) && p!.problems.length) { problems.ticks = PROBLEMS.filter((c) => p!.problems!.includes(c.value)).map((c) => c.label); problems.text = problems.ticks.join(', '); }
  else if (!p?.problems) {
    const concerns = [own(t, 'concerns'), own(t, 'concern_other')].filter(Boolean).join(', ');
    if (concerns) { problems.text = concerns; problems.from = fromTeeth; }
  }
  const dental = [
    reason,
    box('dentist_name', 2, { text: own(t, 'previous_dentist'), from: fromTeeth }),
    box('dentist_place', 1),
    box('dentist_phone', 1),
    box('last_care', 1, { text: own(t, 'last_visit'), from: fromTeeth }),
    xray,
    box('flossing', 1),
    box('brushing', 1),
    problems,
  ];

  // --- Medical history
  const care = h?.under_treatment === 'yes' ? `Under a doctor’s care now${own(h, 'treatment_detail') ? `, for ${own(h, 'treatment_detail')}` : ''}`
    : h?.under_treatment === 'no' ? 'Not under a doctor’s care now' : null;
  const transfusion = box('transfusion', 1);
  if (p?.transfusion === 'yes' && p.transfusion_when) transfusion.text = `Yes, about ${partialDateText(p.transfusion_when)}`;
  const conditions = i.latest?.conditions ?? null;
  const pregnancyListed = listsPregnancy(conditions);
  const showPregnancy = showsPregnancy(i.ask, i.latest, h);
  const pregnant = box('pregnant', 1, { text: own(h, 'pregnant'), from: fromHealth });
  if (!p?.pregnant && pregnancyListed && !pregnant.text) pregnant.text = 'Yes';
  transfusion.span = showPregnancy ? 1 : 4;

  const cond: Box = { key: 'conditions', label: 'Conditions they have or had', span: 4, text: null, field: 'conditions_add', edit: 'Add to conditions' };
  if (conditions === null) cond.empty = NOT_ASKED;
  else if (!conditions.length) cond.text = 'None';
  else {
    // "Pregnancy" on the list is the Pregnant box's Yes, where that box is drawn and says so; beside a No or a
    // "Not sure" it stays on the list, so the two are seen side by side.
    // A list that holds nothing else keeps it, so the box never says "None" for a list nobody asked beyond it.
    const dropped = checklist('conditions', conditions, PAPER_CONDITIONS, showPregnancy && pregnant.text === 'Yes' ? [PREGNANCY] : []);
    const c = dropped.ticks.length + dropped.also.length ? dropped : checklist('conditions', conditions, PAPER_CONDITIONS);
    cond.ticks = c.ticks; cond.also = c.also;
    cond.text = [...c.ticks, ...c.also].join(', ');
  }
  const illness = [own(h, 'illness_detail'), own(h, 'hospital_detail') && `In hospital: ${own(h, 'hospital_detail')}`].filter(Boolean).join('; ');
  const meds = i.latest?.medications ?? null, allergies = i.latest?.allergies ?? null, note = i.latest?.note ?? null;
  const medical: Box[] = [
    box('physician_name', 2, { text: care, from: fromHealth }),
    box('physician_place', 1),
    box('physician_visit', 1),
    transfusion,
    ...(showPregnancy ? [pregnant, box('nursing', 1, { text: own(h, 'nursing'), from: fromHealth }), box('pill', 1, { text: own(h, 'birth_control'), from: fromHealth })] : []),
    cond,
    box('illnesses', 4, { text: illness || null, from: fromHealth }),
    { key: 'medications', label: 'Current medications', span: 2, text: listWords(meds, 'None'), empty: NOT_ASKED, field: 'medications_add', edit: 'Add to current medications' },
    { key: 'allergies', label: 'Allergies', span: 2, text: listWords(allergies, 'None known'), empty: NOT_ASKED, alert: !!allergies?.length, field: 'allergies_add', edit: 'Add to allergies' },
    { key: 'note', label: 'Note for the dentist', span: 4, text: note, pre: true, field: 'note', edit: note ? 'Change the note for the dentist' : 'Add a note for the dentist' },
  ];
  return { dental, medical };
}
