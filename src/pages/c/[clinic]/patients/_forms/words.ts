// Small words the patient forms' workspace pages share: when a form was sent,
// who signed it, why a patient on file may be the same person, and the
// answers' headings as the desk reads them.
import type { LikelyMatch, SignedAs } from '../../../../../lib/patient-forms';

const parts = (d: Date) => Object.fromEntries(new Intl.DateTimeFormat('en-US', {
  weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila',
}).formatToParts(d).map((x) => [x.type, x.value]));
const ymd = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

/** "Today, 7:29 pm" · "Yesterday, 7:29 pm" · "Thu 24 Sep, 7:29 pm" · "Thu 24 Sep 2025, 7:29 pm" (Manila). */
export function sentText(d: Date, now = new Date()): string {
  const p = parts(d);
  const time = `${p.hour}:${p.minute} ${String(p.dayPeriod).toLowerCase()}`;
  const day = ymd(d);
  if (day === ymd(now)) return `Today, ${time}`;
  if (day === ymd(new Date(now.getTime() - 86_400_000))) return `Yesterday, ${time}`;
  const thisYear = parts(now).year === p.year;
  return `${p.weekday} ${p.day} ${p.month}${thisYear ? '' : ` ${p.year}`}, ${time}`;
}

/** "26 Oct" (Manila), with the year when it is not this one. */
export function shortDay(d: Date, now = new Date()): string {
  const p = parts(d);
  return `${p.day} ${p.month}${parts(now).year === p.year ? '' : ` ${p.year}`}`;
}

/** Who signed: "Maria Villanueva, parent or guardian" or "Andrea Villanueva, the patient". */
export const signedText = (name: string, as: SignedAs): string => `${name}, ${as === 'guardian' ? 'parent or guardian' : 'the patient'}`;

/** Why a patient on file may be this person, in words. */
export const WHY: Record<LikelyMatch['why'][number], string> = {
  mobile: 'Same mobile',
  'name-birth': 'Same name and birth date',
};

/**
 * The form's headings for the desk, who reads about someone else: the patient
 * saw "About you", "Your health"; the review page and the printout say "The
 * patient", "Health history". By step id, then by section id (STEPS in
 * src/lib/patient-forms-def.ts); anything not here keeps the form's words.
 */
export const DESK_STEP_TITLE: Record<string, string> = {
  about: 'The patient', health: 'Health history', teeth: 'Dental history', cards: 'PhilHealth and HMO', consent: 'Consent and signature',
};
export const DESK_SECTION_TITLE: Record<string, string> = {
  name: 'Name', you: 'Birth date and more', contact: 'Contact', numbers: 'Blood type, blood pressure, bleeding time',
  before: 'Dental visits before', privacy: 'Privacy',
};
