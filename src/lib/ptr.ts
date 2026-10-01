// The PTR (professional tax receipt): a dentist's number for the year, renewed by 31 January, printed on
// prescriptions and letters. One place for reading a post, the state on a day, and the words.
//
// No Node or database imports: a page's script may import it. Days are 'YYYY-MM-DD' in Manila
// (manilaToday() in src/lib/health.ts on the server).
//
//   - The paper carries a copy (prescription / clinical_letter .ptr_number, .ptr_year, 041), taken when it
//     is saved and never changed. A print compares the copy's year with the paper's own issue day; the
//     panels compare the signer's PTR on file with today, the day the paper will be issued.
//   - Amber means "needs attention" and never blocks: a missing PTR, one with no year, last year's from
//     1 February, a later year outside December. January (last year's, the renewal window) and December
//     (next year's, renewed early) are quiet.
//   - Two forms write staff.ptr_*: a person's page (Clinic settings → People → Edit details) and My page.
//     Both post what they were drawn with (ptr_seen, ptr_year_seen), so a form that did not touch the PTR
//     keeps what is on file now, and one that changes a PTR changed elsewhere since is refused (readPtr).

export interface PtrValue { number: string | null; year: number | null }
export type PtrState = 'ok' | 'none' | 'noyear' | 'renewing' | 'old' | 'ahead' | 'early';
/** What a PTR form draws: the number and year in the fields, and the same values again as "seen" (hidden). */
export interface PtrDrawn { ptr: string; ptrYear: string; ptrSeen: string; ptrYearSeen: string }
/** Where a record's PTR note sends someone to fix it: their own My page, or the person's page in Clinic settings. */
export interface PtrFix { self: boolean; href: string }

export const yearOf = (day: string) => Number(day.slice(0, 4));

/** As the receipt prints it: trimmed, runs of spaces made one, upper case. Dashes, dots and slashes stay. */
export const normPtr = (s: string) => s.trim().replace(/\s+/g, ' ').toUpperCase();
/** Letters, digits, spaces, dots, slashes and dashes, 4–24 long, at least four digits ("MLA-1234567", "8123456"). */
export const PTR_RE = /^[A-Z0-9][A-Z0-9 .\/-]{3,23}$/;
export const ptrNumberOk = (n: string) => PTR_RE.test(n) && (n.match(/\d/g)?.length ?? 0) >= 4;
/** The number field's maxlength. */
export const PTR_MAX = 24;

/** The years a PTR may be saved for on `today`: last year and this year, and next year from 1 December. */
export const ptrYears = (today: string) => {
  const y = yearOf(today);
  return today.slice(5, 7) === '12' ? [y - 1, y, y + 1] : [y - 1, y];
};
const yearsText = (ys: number[]) => `${ys.slice(0, -1).join(', ')} or ${ys[ys.length - 1]}`;
/** The year select's options: ptrYears plus any stored or typed year outside them (never changed silently). */
export const ptrYearOptions = (today: string, ...extra: (number | null)[]) =>
  [...new Set([...ptrYears(today), ...extra.filter((y): y is number => Number.isInteger(y))])].sort((a, b) => a - b);

/** What a form draws for a value on file. A number with no year leaves the year empty ("Choose the year…"),
 *  never filled in; nothing on file offers this year. */
export const ptrDrawn = (v: PtrValue, today: string): PtrDrawn => ({
  ptr: v.number ?? '', ptrYear: v.year ? String(v.year) : v.number ? '' : String(yearOf(today)),
  ptrSeen: v.number ?? '', ptrYearSeen: v.year ? String(v.year) : '',
});

const yearIn = (s: string): number | null => { const t = s.trim(); if (!t) return null; const n = Number(t); return Number.isInteger(n) ? n : NaN; };
const readPair = (n: FormDataEntryValue | null, y: FormDataEntryValue | null): PtrValue =>
  ({ number: normPtr(String(n ?? '')) || null, year: yearIn(String(y ?? '')) });
/** The same PTR: both empty (the year does not count then), or the same number and year. */
const same = (a: PtrValue, b: PtrValue) => (!a.number && !b.number) || (a.number === b.number && a.year === b.year);

export interface PtrRead {
  /** What the row holds after this post: the row's own value, untouched, unless `changed`. */
  value: PtrValue;
  /** What to draw again on a refusal. */
  typed: PtrDrawn;
  problem: string | null;
  /** The row changed after the form was drawn, and this post changes it again: what is on file now. Save nothing. */
  conflict: PtrValue | null;
  changed: boolean;
}

/**
 * The PTR fields of a post.
 * - No 'ptr' field: what is on file, unchanged.
 * - The posted value equals what is on file, or what the form was drawn with ('ptr_seen'): untouched. The row
 *   keeps its current value, whatever its format, including a change someone else made after the form was drawn.
 * - Otherwise, when the row still holds what the form was drawn with, the new value is checked and saved. An
 *   empty number takes the PTR off, and the year goes too.
 * - Otherwise both sides changed it: a conflict, nothing saved.
 */
export function readPtr(form: FormData, onFile: PtrValue, today: string): PtrRead {
  const drawn = ptrDrawn(onFile, today);
  const file: PtrValue = { number: onFile.number ? normPtr(onFile.number) || null : null, year: onFile.year };
  if (!form.has('ptr')) return { value: onFile, typed: drawn, problem: null, conflict: null, changed: false };
  const posted = readPair(form.get('ptr'), form.get('ptr_year'));
  const hasSeen = form.has('ptr_seen');
  const seen = hasSeen ? readPair(form.get('ptr_seen'), form.get('ptr_year_seen')) : file;
  const typed: PtrDrawn = {
    ptr: String(form.get('ptr') ?? '').trim(), ptrYear: String(form.get('ptr_year') ?? '').trim(),
    ptrSeen: hasSeen ? String(form.get('ptr_seen') ?? '') : drawn.ptrSeen,
    ptrYearSeen: hasSeen ? String(form.get('ptr_year_seen') ?? '') : drawn.ptrYearSeen,
  };
  const keep: PtrRead = { value: onFile, typed, problem: null, conflict: null, changed: false };
  if (same(posted, file) || same(posted, seen)) return keep;
  if (!same(seen, file)) return { ...keep, conflict: onFile };
  if (!posted.number) return { value: { number: null, year: null }, typed, problem: null, conflict: null, changed: true };
  const years = ptrYears(today);
  const problem = !ptrNumberOk(posted.number) ? 'Type the PTR number as it is on the receipt.'
    : posted.year === null || Number.isNaN(posted.year) ? 'Choose the year the PTR is for.'
    : !years.includes(posted.year) ? `A PTR saved today is for ${yearsText(years)}.`
    : null;
  return { value: posted, typed, problem, conflict: null, changed: true };
}

/** "7654321 for 2026", "7654321, with no year", "empty". */
const said = (v: PtrValue) => (v.number ? (v.year ? `${v.number} for ${v.year}` : `${v.number}, with no year`) : 'empty');
/** The refusal when both sides changed it. who: the person's name, or null for "Your". */
export const ptrConflictText = (who: string | null, now: PtrValue) => who
  ? `${who}’s PTR was changed while this was open: it is now ${said(now)}. Check it and save again.`
  : `Your PTR was changed while this page was open: it is now ${said(now)}. Check it and save again.`;

/** Where a PTR stands for a paper issued on `onDay`. January keeps last year's PTR good (the renewal window);
 *  December lets next year's through quietly (renewed early). */
export function ptrState(v: PtrValue, onDay: string): PtrState {
  if (!v.number) return 'none';
  if (!v.year) return 'noyear';
  const y = yearOf(onDay), m = onDay.slice(5, 7);
  if (v.year === y) return 'ok';
  if (v.year === y + 1 && m === '12') return 'ahead';
  if (v.year > y) return 'early';
  if (v.year === y - 1 && m === '01') return 'renewing';
  return 'old';
}
export const PTR_AMBER: readonly PtrState[] = ['none', 'noyear', 'old', 'early'];

/** "8123456 (2026)" as the paper prints it; "8123456" with no year; null with no number. */
export const ptrLine = (v: PtrValue) => (v.number ? (v.year ? `${v.number} (${v.year})` : v.number) : null);

/** The chip for My page and a person's page. Status is never colour alone: the words say it. */
export function ptrChip(s: PtrState, v: PtrValue): { label: string; tone: 'accent' | 'muted' | 'warn' } {
  switch (s) {
    case 'ok': return { label: `PTR for ${v.year}`, tone: 'accent' };
    case 'renewing': case 'ahead': return { label: `PTR for ${v.year}`, tone: 'muted' };
    case 'old': case 'early': return { label: `PTR for ${v.year}`, tone: 'warn' };
    case 'noyear': return { label: 'PTR year missing', tone: 'warn' };
    default: return { label: 'No PTR on file', tone: 'warn' };
  }
}

/** My page's words under the chip, "you"; null for ok. */
export function ptrMine(s: PtrState, v: PtrValue, today: string): string | null {
  const y = yearOf(today);
  switch (s) {
    case 'renewing': return `Fine until 31 January. Add your ${y} number once you renew.`;
    case 'old': return `PTRs are renewed by 31 January. Add your ${y} number: what you sign prints the one on file.`;
    case 'ahead': return 'What you sign before 1 January prints it too.';
    case 'early': return `What you sign in ${y} should carry your ${y} PTR. Add your ${y} number.`;
    case 'noyear': return 'Choose the year it is for and save.';
    case 'none': return 'What you sign prints a blank PTR line until you add it.';
    default: return null;
  }
}

/** The note under a panel's signer select; null for ok. who.self → "You have…", "Your PTR…". who.name is
 *  the name as the select shows it ("Dr. Ramon Cariño"). */
export function ptrWords(s: PtrState, v: PtrValue, onDay: string, who: { self: boolean; name: string }):
  { tone: 'warn' | 'quiet'; text: string } | null {
  const y = yearOf(onDay);
  const whose = who.self ? 'Your' : `${who.name}’s`;
  switch (s) {
    case 'none': return { tone: 'warn', text: `${who.self ? 'You have' : `${who.name} has`} no PTR number on file. It prints with a blank PTR line to write in by hand.` };
    case 'noyear': return { tone: 'warn', text: `${whose} PTR on file has no year.` };
    case 'old': return { tone: 'warn', text: `${whose} PTR on file is for ${v.year}. PTRs are renewed by 31 January: add the ${y} number, or write it in by hand.` };
    case 'early': return { tone: 'warn', text: `${whose} PTR on file is for ${v.year}: papers signed in ${y} should carry the ${y} PTR. Add the ${y} number, or write it in by hand.` };
    case 'renewing': return { tone: 'quiet', text: `${whose} PTR on file is for ${v.year}, which is fine until 31 January. Add the ${y} number once it is renewed.` };
    case 'ahead': return { tone: 'quiet', text: `${whose} PTR on file is for ${v.year}. Papers ${who.self ? 'you sign' : 'signed'} before 1 January print it too.` };
    default: return null;
  }
}

/** The amber saved callout's title; null outside PTR_AMBER. */
export function ptrSavedTitle(s: PtrState, v: PtrValue): string | null {
  switch (s) {
    case 'none': return 'Printed without a PTR number';
    case 'noyear': return 'Printed with a PTR that has no year';
    case 'old': case 'early': return `Printed with the ${v.year} PTR`;
    default: return null;
  }
}
/** The amber saved callout's words, after its title. */
export const PTR_SAVED_TEXT = 'Write it in by hand before signing. Papers written after the PTR is added carry it; this one keeps what it was saved with.';

/** The print bar's line, amber states only; the paper's own issue day, never today. */
export function ptrPrintNote(s: PtrState, v: PtrValue, onDay: string, noun: 'prescription' | 'letter'): string | null {
  const y = yearOf(onDay);
  switch (s) {
    case 'none': return `This ${noun} was saved without a PTR number. Write it in by hand before signing.`;
    case 'noyear': return `The PTR on this ${noun} has no year. Write the year in by hand before signing.`;
    case 'old': return `The PTR on this ${noun} is for ${v.year}, but it was written in ${y}: write the ${y} number in by hand if the dentist has renewed.`;
    case 'early': return `The PTR on this ${noun} is for ${v.year}, but it was written in ${y}: write the ${y} number in by hand.`;
    default: return null;
  }
}
