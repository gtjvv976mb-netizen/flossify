// The Dashboard calendar's model: what a card is, and the arithmetic of a
// clinic's day. Pure functions, no DOM and no database, so the server (the
// first paint's numbers, src/pages/c/[clinic]/index.astro) and the browser
// (board.ts, every redraw) run the same code and never disagree.
//
// A Card is the schedule's Appt (src/lib/schedule.ts: the one definition of a
// visit, read by /api/schedule) plus what the Dashboard shows on top of it:
// the service and its fee-guide price, who put it on the book and when, the
// patient's conditions and birth date. Those extras come from data.ts, on the
// page and on every /api/schedule answer.
//
// Times are Manila's calendar and clock whatever the machine says. Manila
// keeps +08:00 all year, so a day is exactly 24 hours and the offset exact.
import type { Appt } from '../../../lib/schedule';
import { statusOf } from '../status';

export const TZ = 'Asia/Manila';
export const DAY_MS = 86_400_000;

export type Price = { min: number; max: number | null; from: boolean; unit: string | null } | null;

export interface Extras {
  /** The fee-guide row: the one booked, or the one the visit's reason names. */
  catalogId: string | null;
  service: string | null;
  price: Price;
  createdAt: string | null;
  /** The staff member who put it on the book (desk bookings). */
  bookedBy: string | null;
  /** The person who booked online for someone else; null when the patient booked for themself. */
  bookedFor: string | null;
  movedAt: string | null;
  /** The HMO this visit was booked under (the website's booking form asks). */
  hmo: string | null;
  /** The patient's own HMO and member number, from their record (026). */
  patientHmo: string | null;
  conditions: string | null;
  birth: string | null;
  /** Brought in from old records with its day only (026): no time is shown for it anywhere. */
  dateOnly: boolean;
  /** The dentist as the old record names them, when they are not on the team (026). */
  dentistFree: string | null;
  /** The patient's last name as the record keeps it ("Dela Cruz"), null when there is none: a card that has
   *  no room for the whole name shows this, never the name's last word. */
  lastName: string | null;
}
export type Card = Appt & Extras;

export interface StaffDay { id: string; name: string; days: number[] }

/** A row of the Patients list (data.ts reads it; patients.ts shows it). */
export interface Pt {
  id: string; name: string; sort: string; chart: string; phone: string | null; birth: string | null;
  allergies: string[]; conditions: string[];
  next: string | null; nextId: string | null; last: string | null;
  today: boolean; isNew: boolean; dentists: string[]; hmo: string | null;
  /** Only for finance roles; null for everyone else (never read). */
  balance: number | null;
}
/** The order a Pt's fields travel in on the page: { keys, rows } rather than one object per patient. */
export const PT_KEYS = ['id', 'name', 'sort', 'chart', 'phone', 'birth', 'allergies', 'conditions', 'next', 'nextId', 'last', 'today', 'isNew', 'dentists', 'hmo', 'balance'] as const satisfies readonly (keyof Pt)[];
export type PackedPts = { keys: readonly string[]; rows: unknown[][] };
export const unpackPts = (p: PackedPts | Pt[]): Pt[] =>
  Array.isArray(p) ? p : p.rows.map((r) => Object.fromEntries(p.keys.map((k, i) => [k, r[i]])) as unknown as Pt);
export interface Service { id: string; code: string; name: string; minutes: number; price: Price }

// --- Manila dates -------------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, '0');
const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-US', { ...opts, timeZone: TZ });
const partsOf = (f: Intl.DateTimeFormat, d: Date | number) =>
  Object.fromEntries(f.formatToParts(d).map((p) => [p.type, p.value])) as Record<string, string>;
const F_YMD = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const F_CLOCK = fmt({ year: 'numeric', month: '2-digit', day: '2-digit', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' });
const F_WHEN = fmt({ weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const F_TIME = fmt({ hour: 'numeric', minute: '2-digit' });

export const YMD = /^\d{4}-\d{2}-\d{2}$/;
/** Midnight in Manila of a calendar date, as epoch ms. */
export const startMs = (ymd: string) => Date.parse(`${ymd}T00:00:00+08:00`);
export const ymdOf = (t: Date | number) => F_YMD.format(t);
export const addDays = (ymd: string, n: number) => ymdOf(startMs(ymd) + n * DAY_MS);
/** 0 = Sunday. The calendar date alone decides it; noon UTC of that date is a safe anchor. */
export const dowOf = (ymd: string) => new Date(`${ymd}T12:00:00Z`).getUTCDay();
export const mondayOf = (ymd: string) => addDays(ymd, -((dowOf(ymd) + 6) % 7));
/** A real calendar day, written YYYY-MM-DD (Date.parse alone takes 2026-02-31). */
export const realDay = (s: string) => YMD.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

const F_SHORT = new Intl.DateTimeFormat('en-US', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const F_LONG = new Intl.DateTimeFormat('en-US', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
/** "Fri 25 Sep" · "Friday 25 September" · "Fri 25". */
export function dayLabel(ymd: string, style: 'short' | 'long' | 'day' = 'short'): string {
  const p = partsOf(style === 'long' ? F_LONG : F_SHORT, new Date(`${ymd}T12:00:00Z`));
  return style === 'day' ? `${p.weekday} ${p.day}` : `${p.weekday} ${p.day} ${p.month}`;
}

/** "9:00 am" from minutes after midnight. */
export const hm = (min: number) => { const m = Math.round(min); const h = Math.floor(m / 60) % 24; return `${h % 12 || 12}:${pad(m % 60)} ${h >= 12 ? 'pm' : 'am'}`; };
/** "9:00–9:45 am", or "11:30 am–12:15 pm" across noon. */
export const span = (s: number, e: number) => { const a = hm(s), b = hm(e); return a.slice(-2) === b.slice(-2) ? `${a.slice(0, -3)}–${b}` : `${a}–${b}`; };
/** "09:30" for an <input type="time">. */
export const hhmm = (min: number) => `${pad(Math.floor(min / 60) % 24)}:${pad(Math.round(min) % 60)}`;
/** Manila date and minutes into it, for any instant. */
export function manila(iso: string | number): { ymd: string; min: number } {
  const p = partsOf(F_CLOCK, new Date(iso));
  return { ymd: `${p.year}-${p.month}-${p.day}`, min: (Number(p.hour) % 24) * 60 + Number(p.minute) };
}
/** "9:00 am" */
export const timeOf = (iso: string) => { const p = partsOf(F_TIME, new Date(iso)); return `${p.hour}:${p.minute} ${p.dayPeriod.toLowerCase()}`; };
/** "Fri 25 Sep, 9:00 am" */
export const whenOf = (iso: string) => { const p = partsOf(F_WHEN, new Date(iso)); return `${p.weekday} ${p.day} ${p.month}, ${p.hour}:${p.minute} ${p.dayPeriod.toLowerCase()}`; };
/** An instant from a Manila date and an <input type="time"> value. */
export const isoOf = (ymd: string, time: string) => new Date(`${ymd}T${time.slice(0, 5)}:00+08:00`).toISOString();
/** "Today, 3:00 pm" · "Tomorrow, 9:00 am" · "Fri 2 Oct, 9:00 am" — relative to Manila's today. */
export function nearWhen(iso: string, today: string): string {
  const d = manila(iso).ymd;
  if (d === today) return `Today, ${timeOf(iso)}`;
  if (d === addDays(today, 1)) return `Tomorrow, ${timeOf(iso)}`;
  if (d === addDays(today, -1)) return `Yesterday, ${timeOf(iso)}`;
  return whenOf(iso);
}
/** "12 Aug 2026" — for a last visit. */
export function dateText(iso: string): string {
  const p = partsOf(fmt({ day: 'numeric', month: 'short', year: 'numeric' }), new Date(iso));
  return `${p.day} ${p.month} ${p.year}`;
}
/** Whole years on Manila's calendar. */
export function ageOf(birth: string | null, today: string): number | null {
  if (!birth || !YMD.test(birth)) return null;
  const [by, bm, bd] = birth.split('-').map(Number), [ty, tm, td] = today.split('-').map(Number);
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
}

// --- the clinic's day ------------------------------------------------------------

/** clinic_hours keeps minutes from midnight; a value of 24 or less can only be an hour. */
export function hoursOf(hours: Record<number, [number, number] | null>, dow: number): [number, number] | null {
  const h = hours[dow];
  if (!h) return null;
  const min = (v: number) => (v <= 24 ? v * 60 : v);
  return [min(h[0]), min(h[1])];
}

export type Spanned = { s: number; e: number };
/** Where a visit sits on a day, in minutes after that day's midnight, clipped to the day. */
export const spanOn = (c: { startsAt: string; endsAt: string }, dayStart: number): Spanned => {
  const s = (Date.parse(c.startsAt) - dayStart) / 60_000, e = (Date.parse(c.endsAt) - dayStart) / 60_000;
  return { s: Math.max(0, s), e: Math.min(1440, Math.max(s + 5, e)) };
};

/** Overlapping visits in one column share its width, each in a lane, the way a paper day-book does it. */
export function lanes<T extends Spanned>(items: T[]): (T & { lane: number; lanes: number })[] {
  const sorted = [...items].sort((x, y) => x.s - y.s || x.e - y.e);
  const out: (T & { lane: number; lanes: number })[] = [];
  let cluster: (T & { lane: number; lanes: number })[] = [], ends: number[] = [], clusterEnd = -Infinity;
  const close = () => { for (const c of cluster) c.lanes = ends.length; cluster = []; ends = []; };
  for (const it of sorted) {
    if (it.s >= clusterEnd) close();
    let lane = ends.findIndex((e) => e <= it.s);
    if (lane === -1) { lane = ends.length; ends.push(it.e); } else ends[lane] = it.e;
    const placed = { ...it, lane, lanes: 1 };
    cluster.push(placed); out.push(placed);
    clusterEnd = Math.max(clusterEnd, it.e);
  }
  close();
  return out;
}

/** The rows a grid draws: the clinic's hours, widened to whole hours and to any visit outside them.
 *  A closed day still gets nine to five, so a visit can be placed on it. */
export function bounds(spans: Spanned[], open: [number, number] | null): [number, number] {
  let s = open ? open[0] : 9 * 60, e = open ? open[1] : 17 * 60;
  for (const x of spans) { s = Math.min(s, x.s); e = Math.max(e, x.e); }
  s = Math.max(0, Math.floor(s / 60) * 60); e = Math.min(1440, Math.ceil(e / 60) * 60);
  if (e <= s) e = Math.min(1440, s + 60);
  return [s, e];
}

export type Col = { key: string; label: string; sub: string | null };
/** A dentist's column on a day they do not work: "not in on Saturdays" when this branch's schedule has them on
 *  other days, "not on this branch's schedule" when it has them on none. */
const DAYS = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];
const offWord = (s: StaffDay | undefined, dow: number) => (s ? `not in on ${DAYS[dow]}` : 'not on this branch’s schedule');
/** Chair 1…n, then "No chair yet" when a visit has none; or the dentists in that day, then anyone with a
 *  visit that day anyway, then No dentist. A visit is never dropped for want of a column. With one dentist
 *  chosen, by dentist is that dentist's column alone. */
export function columns(by: 'chair' | 'dentist', list: Card[], chairs: number, staff: StaffDay[], dow: number, only = ''): Col[] {
  const cols: Col[] = [];
  if (by === 'chair') {
    for (let i = 1; i <= chairs; i++) cols.push({ key: String(i), label: `Chair ${i}`, sub: null });
    for (const a of list) if (a.chair !== null && a.chair > chairs && !cols.some((c) => c.key === String(a.chair))) cols.push({ key: String(a.chair), label: `Chair ${a.chair}`, sub: 'not in settings' });
    if (list.some((a) => a.chair === null)) cols.push({ key: '', label: 'No chair yet', sub: 'drag to a chair' });
    return cols;
  }
  if (only) {
    const s = staff.find((x) => x.id === only);
    const name = s?.name ?? list.find((a) => a.dentistId === only)?.dentistName ?? 'Dentist';
    return [{ key: only, label: name, sub: s && s.days.includes(dow) ? null : offWord(s, dow) }];
  }
  for (const s of staff) if (s.days.includes(dow)) cols.push({ key: s.id, label: s.name, sub: null });
  for (const a of list) if (a.dentistId && !cols.some((c) => c.key === a.dentistId)) cols.push({ key: a.dentistId, label: a.dentistName ?? 'Dentist', sub: offWord(staff.find((x) => x.id === a.dentistId), dow) });
  if (cols.length === 0 || list.some((a) => !a.dentistId)) cols.push({ key: '', label: 'No dentist', sub: null });
  return cols;
}
export const colOf = (by: 'chair' | 'dentist', a: Card) => (by === 'chair' ? (a.chair === null ? '' : String(a.chair)) : (a.dentistId ?? ''));

/** A visit that has left the book: it holds no chair, and nothing more happens to it. */
export const DONE = new Set(['completed', 'no_show', 'cancelled']);

/** The first half hour a chair is free from now (or from opening, on another day), lowest chair first. */
export function nextFree(list: Card[], open: [number, number] | null, dayStart: number, isToday: boolean, chairs: number, now = Date.now()): { chair: number; min: number } | null {
  if (!open) return null;
  const from = isToday ? Math.ceil((now - dayStart) / 60_000 / 15) * 15 : open[0];
  let best: { chair: number; min: number } | null = null;
  for (let c = 1; c <= chairs; c++) {
    const busy = list.filter((a) => a.chair === c && !DONE.has(a.status)).map((a) => [(Date.parse(a.startsAt) - dayStart) / 60_000, (Date.parse(a.endsAt) - dayStart) / 60_000] as const).sort((x, y) => x[0] - y[0]);
    let t = Math.max(open[0], from);
    for (let i = 0; i < busy.length; i++) { const [s, e] = busy[i]; if (s < t + 30 && e > t) { t = Math.ceil(e / 15) * 15; i = -1; } }
    if (t + 30 <= open[1] && (!best || t < best.min)) best = { chair: c, min: t };
  }
  return best;
}

// --- words ------------------------------------------------------------------------

/** "₱1,500" */
export const peso = (n: number) => `₱${Math.round(n).toLocaleString('en-PH')}`;
/** A balance: whole pesos, with the centavos only when there are any — "₱2,400", "₱1,075.50". The same on the
 *  Dashboard's lists and panels and the Patients tab's rows (its Row.astro), so one number reads one way. */
export const pesoBal = (n: number) => {
  const c = Math.round(Math.abs(n) * 100);
  const words = c % 100 ? (c / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : (c / 100).toLocaleString('en-PH');
  return `${n < 0 && c ? '-' : ''}₱${words}`;
};
/** The price on a card: "₱800", "₱1,500–2,500", "from ₱300". */
export function priceShort(p: Price): string {
  if (!p) return '';
  if (p.max === null && p.from) return `from ${peso(p.min)}`;
  if (p.max !== null && p.max !== p.min) return `${peso(p.min)}–${Math.round(p.max).toLocaleString('en-PH')}`;
  return peso(p.min);
}
/** The price in the panel: "₱2,000 – ₱4,500 per tooth". */
export function priceLong(p: Price): string {
  if (!p) return '';
  const core = p.max === null && p.from ? `from ${peso(p.min)}` : p.max !== null && p.max !== p.min ? `${peso(p.min)} – ${peso(p.max)}` : peso(p.min);
  return p.unit ? `${core} ${p.unit}` : core;
}

/** Where a visit came from, in the desk's words. Anything a future import writes reads as imported. */
export function sourceWord(source: string): string {
  if (source === 'staff') return 'Desk';
  if (source === 'web') return 'Web';
  if (source === 'request') return 'Web request';
  if (/^import/.test(source)) return 'Imported';
  return source;
}
/** A web request the desk has not given a time yet (CLAUDE.md: source = 'request' and moved_at is null). */
export const isRequest = (c: Pick<Card, 'source' | 'movedAt'>) => c.source === 'request' && !c.movedAt;
/** "Desk · Liza Santos" · "Web · booked by Ana Reyes" · "Web request" · "Imported · Liza Santos" (who brought it in). */
export function sourceLine(c: Card): string {
  const by = c.source === 'staff' || c.source === 'import' ? c.bookedBy : c.bookedFor ? `booked by ${c.bookedFor}` : null;
  return [sourceWord(c.source), by].filter(Boolean).join(' · ');
}
/** A Philippine mobile as the desk reads it aloud: "0917 555 0142". Anything else as it was written. */
export function prettyPhone(p: string | null): string {
  if (!p) return '';
  let d = p.replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('63')) d = `0${d.slice(2)}`;
  if (d.length === 10 && d.startsWith('9')) d = `0${d}`;
  return /^09\d{9}$/.test(d) ? `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}` : p;
}
/** "Dr. Ramon Cariño" → "Dr. Cariño"; anything else whole. */
export function shortName(full: string | null): string {
  if (!full) return '';
  const w = full.trim().split(/\s+/);
  if (w.length < 3 || !/^dra?\.?$/i.test(w[0])) return full.trim();
  const tail = /^(jr\.?|sr\.?|ii|iii|iv)$/i.test(w[w.length - 1]) ? w.slice(-2) : w.slice(-1);
  return `${w[0].replace(/\.?$/, '.')} ${tail.join(' ')}`;
}

// --- a visit's names ---------------------------------------------------------------

/** A status in the Dashboard's words: the shell's (components/ws/status.ts), except a finished visit is "Done",
 *  as the summary strip ("Done") and the visit panel's step ("Done") already say it. */
export const statusWord = (s: string) => (s === 'completed' ? 'Done' : statusOf(s).label);

/** The patient's surname for a narrow card: the record's last name ("Dela Cruz", never "Cruz"), else the whole name. */
export const surnameOf = (c: Pick<Card, 'patientName' | 'lastName'>) => c.lastName?.trim() || c.patientName;
/** The patient's name for a card with no room for all of it: "M. Dela Cruz". The whole name when there is no last name. */
export function shortPatient(c: Pick<Card, 'patientName' | 'lastName'>): string {
  const full = c.patientName.trim(), last = c.lastName?.trim();
  if (!last || !full.toLowerCase().endsWith(last.toLowerCase())) return full;
  const first = full.slice(0, full.length - last.length).trim();
  return first ? `${first[0].toUpperCase()}. ${last}` : last;
}
/** A tooth number as the chart writes it (FDI: 11–48 adult, 51–85 milk). */
const TOOTH = /^(?:[1-4][1-8]|[5-8][1-5])$/;
/** The teeth a visit's reason names after its words: "Restoration 26" → "tooth 26", "Extraction 36, 37" →
 *  "teeth 36, 37". Nothing when the numbers are not all tooth numbers ("Cleaning 2" is not a tooth). The same
 *  tail data.ts accepts after a service's name when it finds the fee-guide service a reason names. */
export function teethOf(reason: string | null | undefined): string {
  const m = /\s#?(\d[\d\s,&/#-]*)$/.exec((reason ?? '').trim());
  if (!m) return '';
  const nums = m[1].match(/\d+/g) ?? [];
  if (!nums.length || !nums.every((n) => TOOTH.test(n))) return '';
  const tail = m[1].replace(/#/g, '').replace(/[\s,&/-]+$/, '').replace(/\s*,\s*/g, ', ').trim();
  return `${nums.length > 1 ? 'teeth' : 'tooth'} ${tail}`;
}
/** What a visit is, by one name everywhere on the Dashboard (the card, the panel, the printed day): the
 *  fee-guide service with the teeth its reason names — "Filling · tooth 26" — or the reason as written when
 *  no service is recorded. */
export function whatOf(c: Pick<Card, 'service' | 'reason'>): string {
  if (!c.service) return c.reason?.trim() ?? '';
  const t = teethOf(c.reason);
  return t ? `${c.service} · ${t}` : c.service;
}
/** The reason as written, when it says more than the service and its teeth: the words the record and search use. */
export function reasonBeyond(c: Pick<Card, 'service' | 'reason'>): string | null {
  const r = c.reason?.trim();
  if (!r || !c.service) return null;
  const words = r.replace(/\s#?\d[\d\s,&/#-]*$/, '').trim().toLowerCase();
  return words === c.service.trim().toLowerCase() ? null : r;
}

// --- the summary strip ----------------------------------------------------------------

export interface Summary {
  booked: number; fromWeb: number; waiting: number; inChair: number; done: number; noShow: number;
  /** Fee-guide low end of today's visits that are still happening or done. */
  expected: number; priced: number; unpriced: number; ranged: number;
  /** A dentist's own share of today, when the page shows a dentist's view. */
  mine: number;
}
/** Today's numbers from today's visits (cancelled ones are never in the list). */
export function summarize(today: Card[], me = ''): Summary {
  const s: Summary = { booked: 0, fromWeb: 0, waiting: 0, inChair: 0, done: 0, noShow: 0, expected: 0, priced: 0, unpriced: 0, ranged: 0, mine: 0 };
  for (const c of today) {
    if (c.status === 'cancelled') continue;
    s.booked++;
    if (c.source !== 'staff') s.fromWeb++;
    if (me && c.dentistId === me) s.mine++;
    if (c.status === 'arrived' || c.status === 'in_lobby') s.waiting++;
    if (c.status === 'in_chair') s.inChair++;
    if (c.status === 'completed') s.done++;
    if (c.status === 'no_show') { s.noShow++; continue; }
    if (c.price) { s.expected += c.price.min; s.priced++; if (c.price.max === null ? c.price.from : c.price.max !== c.price.min) s.ranged++; }
    else s.unpriced++;
  }
  return s;
}
/** The words under each summary figure. The strip holds four numbers (the soft template): Booked today,
 *  Waiting, In the chair, and Done — or, for the people who may see money, Collected today, with the day's
 *  done and no-shows said under Booked today and what the fee guide expects said under Collected. */
export function summaryNotes(s: Summary, chairs: number, isDentist: boolean, money = false) {
  const n = (k: number, one: string, many = one + 's') => `${k} ${k === 1 ? one : many}`;
  const booked = s.booked === 0 ? 'nothing on the book yet'
    : money ? [isDentist && `${s.mine} with you`, s.done ? `${s.done} done` : !isDentist && 'none done yet', s.noShow && n(s.noShow, 'no-show')].filter(Boolean).join(' · ')
    : isDentist ? `${s.mine} with you` : s.fromWeb ? `${s.fromWeb} from the web` : 'all booked at the desk';
  return {
    booked,
    waiting: 'here, not seated yet',
    inChair: `of ${n(chairs, 'chair')}`,
    done: s.noShow ? n(s.noShow, 'no-show') : 'finished today',
    // The fee guide's low end of today's visits (a range counts at its low end; a visit with no price counts
    // nothing), so "at least" whenever either is in the sum.
    expected: s.booked === 0 ? 'nothing booked today' : s.priced === 0 ? 'no fee-guide prices today'
      : `${s.ranged || s.unpriced ? 'at least ' : ''}${peso(s.expected)} expected`,
  };
}
