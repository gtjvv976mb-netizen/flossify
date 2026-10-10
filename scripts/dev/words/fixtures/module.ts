// The words check's fixture module (words.test.mjs): a .ts file's strings, with code that only looks like words.
// A Team in this comment is never read.
import { type Tone } from './tone';
export * from './the-book';

type Word = 'In chair' | 'No show';
interface Row { label: 'Completed'; tone: Tone }

export const STATUS: Record<string, string> = { in_lobby: 'In lobby', 'Booking ref': 'Arrived' };

/** Where it is from, and a SQL query that is not words. */
export function words(el: HTMLElement, kind: Word, n: number) {
  const q = `select a.id from appointment a where a.status = $1 and a.clinic_id = $2`;
  const where = 'r.balance > 0';
  const hook = el.closest('[data-strip-held]')?.getAttribute('data-recall');
  const key = `rec-recall-${n}`;
  console.error('The Team page is gone');
  el.setAttribute('aria-label', `Owes nothing · ${n}`);
  el.setAttribute('data-say', 'Rebook');
  const params = new URLSearchParams({ tab: 'Team' });
  const re = new RegExp('Messages');
  switch (kind) {
    case 'In chair': return 'Where it is from';
    default: return n === 1 ? 'One invoice' : `${n} invoices`;
  }
}

export const LINES = ['Book again', 'flex items-center gap-2', '/c/x/settings/team/', 'https://flossify.ph/team'];
