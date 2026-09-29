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
// Types only: blocks.ts reads the database (pg), which must never reach the browser's bundle. block-words.ts is pure.
import type { BlockRange } from '../../../lib/blocks';
import type { RangeKind, RangeLike } from '../../../lib/block-words';
import { statusOf } from '../status';

export type { BlockRange } from '../../../lib/blocks';

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
  /** The fee-guide row's code (the aftercare sheet is chosen by it). */
  catalogCode: string | null;
  /** The fee guide's category (ortho, restore …), for the aftercare sheet (src/lib/aftercare.ts). */
  catalogCategory: string | null;
  // --- Before we start, and before they leave (036): what the desk and the chair need at the moment of decision.
  /** When the health history was last asked (the latest version), ISO; null when never. */
  healthAskedAt: string | null;
  /** A blood pressure taken on the visit's day. */
  bpOnDay: boolean;
  /** A consent signed on the tablet for this visit. */
  consentSigned: boolean;
  /** A lab case for the patient still at the lab (ordered or sent). */
  labPending: boolean;
  /** A request for medical clearance with no reply yet. */
  clearanceWaiting: boolean;
  /** Treatments done at this visit (or that day) with no statement line yet. */
  unbilled: number;
  /** The visit's own statement, when one was charged from it. */
  statement: { id: string; no: string; status: string } | null;
  /** The patient's open check-up, YYYY-MM-DD, or null. */
  recallDue: string | null;
  /** The patient's next visit after this one, ISO, or null. */
  nextVisitAt: string | null;
}
export type Card = Appt & Extras;

/** How long a patient has waited since arrival, in whole minutes; null unless they are here and not yet seated. */
export function waitMinutes(c: Pick<Card, 'status' | 'arrivedAt'>, now = Date.now()): number | null {
  if ((c.status !== 'arrived' && c.status !== 'in_lobby') || !c.arrivedAt) return null;
  return Math.max(0, Math.floor((now - Date.parse(c.arrivedAt)) / 60_000));
}
/** Past this many minutes on the bench the wait is said in amber (docs/clinic-operations.md: under 10 for a
 *  returning patient, under 5 for a new one; alert at 15). The words carry the minutes either way. */
export const WAIT_ALERT_MIN = 15;
/** A finished visit with nothing after it: no next visit on the book and no check-up set. */
export const noNextVisit = (c: Pick<Card, 'status' | 'nextVisitAt' | 'recallDue'>) => c.status === 'completed' && !c.nextVisitAt && !c.recallDue;

/** A dentist at this branch: their weekdays and, on the days that have them, their own hours (040): dow → [fromMin,
 *  toMin]; a day in `days` with no entry is the clinic's hours. */
export interface StaffDay { id: string; name: string; days: number[]; hours?: Record<number, [number, number]> }

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
export const DAYS = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];
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

/** Minutes a chair is kept free after each visit in the desk's SUGGESTED times. 0 until the owner sets a clinic
 *  turnover (docs/clinic-operations.md §1 suggests 8–12; the p07 verdict leaves it to the owner). On the quarter-hour
 *  grid a buffer of n leaves n to n+14 minutes. Suggestions only: findClash never refuses on it. */
export const TURNOVER_MIN = 0;

/** What stands in a start's way, in minutes after the day's midnight.
 *  chair:   a number = that chair; 'any' = a visit on no chair yet, which still needs one; 'all' = every chair
 *           (blocked time, 040); null = no chair (a dentist's own block).
 *  dentist: an id = that dentist; 'any' = an Any-dentist visit, which still needs one of the day's dentists;
 *           'all' = every dentist (blocked time); null = no dentist (a chair's own block).
 *  Visits (holdsOf) are only ever a number/id or 'any'; 'all' and null are for 040's rows. */
export interface Hold { s: number; e: number; chair: number | 'any' | 'all' | null; dentist: string | 'any' | 'all' | null }
export type Slotted = Pick<Card, 'id' | 'status' | 'chair' | 'dentistId' | 'startsAt' | 'endsAt'>;
/** The visits that still hold their time (findClash's HOLDS_SLOT: not completed, no-show or cancelled), less the one being moved. */
export function holdsOf(list: Slotted[], dayStart: number, excludeId?: string | null): Hold[] {
  return list.filter((a) => !DONE.has(a.status) && a.id !== excludeId).map((a) => ({
    s: (Date.parse(a.startsAt) - dayStart) / 60_000, e: (Date.parse(a.endsAt) - dayStart) / 60_000,
    chair: a.chair ?? 'any', dentist: a.dentistId ?? 'any',
  }));
}

export interface FreeAsk {
  open: [number, number] | null;
  /** Minutes after midnight to look from (the caller rounds it). */
  from: number;
  minutes: number;
  chairs: number;
  /** The dentist chosen; '' or absent = any dentist. */
  dentistId?: string;
  /** The dentists in that weekday (staff_schedule). With Any dentist a start needs one of them free; with `pool`, each
   *  overlapping Any-dentist visit takes one of them. Empty/absent = no dentist check. */
  anyOf?: string[];
  /** Count visits on no chair yet against the free chairs, and Any-dentist visits against the day's dentists
   *  (suggestions: true; nextFree: false, its old answer). */
  pool?: boolean;
  /** The chair the form holds: taken at a start when it is free there. */
  preferChair?: number | null;
  /** Minutes a chair is kept after each visit (0 = nextFree's rule). Blocked time is never padded. */
  turnover?: number;
  /** How many starts to return (default 1; Infinity = every free start that day). */
  limit?: number;
}
export interface FreeStart { min: number; chair: number }

/** The chair a visit of `a.minutes` could take at minute `t`, or null when the clinic could not honour it. */
export function freeAt(holds: Hold[], a: FreeAsk, t: number): number | null {
  if (!a.open || t < a.open[0] || t + a.minutes > a.open[1]) return null;
  const turn = a.turnover ?? 0, end = t + a.minutes;
  const on = (h: Hold, pad: number) => h.s < end + pad && h.e + pad > t;
  if (holds.some((h) => (h.chair === 'all' || h.dentist === 'all') && on(h, 0))) return null;
  const free: number[] = [];
  for (let c = 1; c <= a.chairs; c++) if (!holds.some((h) => h.chair === c && on(h, turn))) free.push(c);
  const unplaced = a.pool ? holds.filter((h) => h.chair === 'any' && on(h, turn)).length : 0;
  if (free.length - unplaced < 1) return null;
  const busy = (d: string) => holds.some((h) => h.dentist === d && on(h, 0));
  if (a.dentistId && busy(a.dentistId)) return null;
  const pool = a.anyOf ?? [];
  if (pool.length && (!a.dentistId || pool.includes(a.dentistId))) {
    const anyVisits = a.pool ? holds.filter((h) => h.dentist === 'any' && on(h, 0)).length : 0;
    if (pool.filter((d) => !busy(d)).length - anyVisits < 1) return null;
  }
  const want = a.preferChair ?? null;
  return want !== null && free.includes(want) ? want : free[0];
}

/** Free starts in time order: from `from`, then every quarter hour, while the visit still ends by closing. */
export function freeStarts(holds: Hold[], a: FreeAsk): FreeStart[] {
  if (!a.open) return [];
  const limit = a.limit ?? 1, out: FreeStart[] = [];
  for (let t = Math.max(a.open[0], a.from); t + a.minutes <= a.open[1] && out.length < limit; t = Math.floor(t / 15) * 15 + 15) {
    const chair = freeAt(holds, a, t);
    if (chair !== null) out.push({ min: t, chair });
  }
  return out;
}

/** How far apart the chips sit inside one free stretch: the length, at least an hour, and at least a quarter of what
 *  is left of the day rounded up to the half hour, so a light day shows its morning and its afternoon. */
export const chipGap = (minutes: number, from: number, close: number, limit: number) =>
  Math.ceil(Math.max(minutes, 60, Math.ceil((close - from) / limit / 30) * 30) / 15) * 15;

/** The day's chips, at most `limit`, in time order: `at` (the form's own time, when free), then the candidates after
 *  it, then the ones before it, earliest first. A candidate is the first start of every hole (starts 15 minutes
 *  apart), and inside a hole the next start at least `gap` after the last candidate. */
export function pickStarts(starts: FreeStart[], o: { at: FreeStart | null; limit: number; gap: number }): FreeStart[] {
  const cand: FreeStart[] = [];
  let prev = -Infinity, last = -Infinity;
  for (const s of starts) {
    if (s.min - prev > 15 || s.min >= last + o.gap) { cand.push(s); last = s.min; }
    prev = s.min;
  }
  const pick: FreeStart[] = o.at ? [o.at] : [];
  const pivot = o.at ? o.at.min : -Infinity;
  for (const s of [...cand.filter((c) => c.min > pivot), ...cand.filter((c) => c.min < pivot)]) {
    if (pick.length >= o.limit) break;
    pick.push(s);
  }
  return pick.sort((x, y) => x.min - y.min);
}

/** The first half hour a chair is free from now (or from opening, on another day), lowest chair first: the count
 *  line and the walk-in's chair (no pool, no turnover). It skips the day's blocked time (040): the clinic's closures
 *  and lunch, each chair's own time out of use, and — with `dentistId` — that dentist's time away or not in. With no
 *  blocks its answer is the one it always gave. */
export function nextFree(list: Card[], open: [number, number] | null, dayStart: number, isToday: boolean, chairs: number, now = Date.now(),
  blocks: Blocky[] = [], dentistId: string | null = null): { chair: number; min: number } | null {
  if (!open) return null;
  const from = isToday ? Math.ceil((now - dayStart) / 60_000 / 15) * 15 : open[0];
  return freeStarts([...holdsOf(list, dayStart), ...blockHolds(blocks, dayStart, { only: dentistId ?? '' })], { open, from, minutes: 30, chairs })[0] ?? null;
}

/** "Next free with Dr. Cariño": on each of the next days the dentist is in, the first free start at or after `at`
 *  (the form's clock time), else that day's first free start; at most `max` days. `extra(ymd)` adds holds that are
 *  not visits for that day: its blocked time (040), blockHolds(). */
export function freeDays(list: Slotted[], o: {
  after: string; today: string; nowMin: number; days: number; hours: Record<number, [number, number] | null>;
  dentist: StaffDay; staff: StaffDay[]; at: number | null; minutes: number; chairs: number;
  preferChair?: number | null; excludeId?: string | null; turnover: number; max: number;
  extra?: (ymd: string) => Hold[];
}): { ymd: string; min: number; chair: number }[] {
  const first = o.after >= o.today ? addDays(o.after, 1) : o.today;
  const out: { ymd: string; min: number; chair: number }[] = [];
  for (let i = 0; i < o.days && out.length < o.max; i++) {
    const ymd = addDays(first, i), dow = dowOf(ymd), open = hoursOf(o.hours, dow);
    if (!open || !o.dentist.days.includes(dow)) continue;
    const from = Math.ceil((ymd === o.today ? Math.max(open[0], o.nowMin) : open[0]) / 15) * 15;
    const holds = [...holdsOf(list, startMs(ymd), o.excludeId), ...(o.extra?.(ymd) ?? [])];
    const ask: FreeAsk = { open, from, minutes: o.minutes, chairs: o.chairs, dentistId: o.dentist.id, pool: true,
      anyOf: o.staff.filter((s) => s.days.includes(dow)).map((s) => s.id), preferChair: o.preferChair, turnover: o.turnover };
    const f = (o.at !== null && o.at > from ? freeStarts(holds, { ...ask, from: o.at })[0] : undefined) ?? freeStarts(holds, ask)[0];
    if (f) out.push({ ymd, ...f });
  }
  return out;
}

const DAY3 = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** A dentist's days in words, runs of three or more joined: "Mon–Sat", "Tue, Thu", "Mon, Wed, Fri". */
export function daysText(days: number[]): string {
  const d = [...new Set(days)].filter((x) => x >= 0 && x <= 6).sort((a, b) => a - b), out: string[] = [];
  for (let i = 0; i < d.length; ) {
    let j = i;
    while (j + 1 < d.length && d[j + 1] === d[j] + 1) j++;
    if (j - i >= 2) out.push(`${DAY3[d[i]]}–${DAY3[d[j]]}`); else for (let k = i; k <= j; k++) out.push(DAY3[d[k]]);
    i = j + 1;
  }
  return out.join(', ');
}

// --- blocked time (040) ------------------------------------------------------------------------
// A range of clinic_unavailable() as the page has it: /api/schedule's `blocks` (a BlockRange), or the weekly shut
// hours this file works out from the clinic's hours (shutRanges). The words are src/lib/block-words.ts's.

/** A range the calendar reads: a BlockRange, or a weekly shut range (no id, no dentist, no chair). */
export type Blocky = RangeLike & { id?: string | null; dentistId?: string | null };

/** Blocked time as holds (p24 × p07). The clinic's closures, lunch and shut hours hold every chair and dentist; a chair
 *  out of use holds that chair; a dentist away or not in holds that dentist, so freeAt's own rules for a chosen dentist
 *  and for Any dentist apply (the free times). With `only` (nextFree's rule, the count line and the walk-in) a
 *  dentist's time is left out, except the time of the dentist `only` names, which holds everything. */
export function blockHolds(blocks: Blocky[], dayStart: number, o: { only?: string } = {}): Hold[] {
  const out: Hold[] = [];
  for (const r of blocks) {
    const s = (Date.parse(r.startsAt) - dayStart) / 60_000, e = (Date.parse(r.endsAt) - dayStart) / 60_000;
    if (r.kind === 'closed' || r.kind === 'lunch' || r.kind === 'shut') out.push({ s, e, chair: 'all', dentist: 'all' });
    else if (r.kind === 'chair_out') { if (r.chair) out.push({ s, e, chair: r.chair, dentist: null }); }
    else if (r.dentistId) {
      if (o.only === undefined) out.push({ s, e, chair: null, dentist: r.dentistId });
      else if (o.only && r.dentistId === o.only) out.push({ s, e, chair: 'all', dentist: 'all' });
    }
  }
  return out;
}

/** The ranges that touch one Manila day. */
export function blocksOn<T extends { startsAt: string; endsAt: string }>(blocks: T[], ymd: string): T[] {
  const s = startMs(ymd), e = s + DAY_MS;
  return blocks.filter((b) => Date.parse(b.startsAt) < e && Date.parse(b.endsAt) > s);
}

/** The weekly shut hours of one day as ranges, as clinic_unavailable() writes them: before opening and after closing,
 *  or the whole day on a weekday with no hours. None for a clinic that has set no hours at all. */
export function shutRanges(hours: Record<number, [number, number] | null>, ymd: string): Blocky[] {
  if (![0, 1, 2, 3, 4, 5, 6].some((d) => hours[d])) return [];
  const s = startMs(ymd), open = hoursOf(hours, dowOf(ymd));
  const r = (a: number, b: number): Blocky => ({ kind: 'shut', startsAt: new Date(s + a * 60_000).toISOString(), endsAt: new Date(s + b * 60_000).toISOString(), dentistId: null, chair: null });
  if (!open) return [r(0, 1440)];
  const out: Blocky[] = [];
  if (open[0] > 0) out.push(r(0, open[0]));
  if (open[1] < 1440) out.push(r(open[1], 1440));
  return out;
}

/** findBlock's order when a visit sits in more than one range: the widest reason first. */
const PRIORITY: RangeKind[] = ['closed', 'shut', 'lunch', 'leave', 'hours', 'chair_out'];
/** The range a proposed visit would sit in, in its scope (the whole clinic, its dentist, its chair), by findBlock's
 *  priority then time; null when none. `blocks` are the loaded ranges of that day (null: not loaded; the weekly hours
 *  are always known). The server decides on save; this only says it first. */
export function blockAt(blocks: Blocky[] | null, hours: Record<number, [number, number] | null>,
  p: { ymd: string; startMin: number; endMin: number; chair: number | null; dentistId: string | null }): Blocky | null {
  const d0 = startMs(p.ymd), s = d0 + p.startMin * 60_000, e = d0 + p.endMin * 60_000;
  const all: Blocky[] = [...(blocks ?? [])];
  for (let d = p.ymd; startMs(d) < e; d = addDays(d, 1)) all.push(...shutRanges(hours, d));
  const hit = all.filter((r) => Date.parse(r.startsAt) < e && Date.parse(r.endsAt) > s
    && ((!r.dentistId && !r.chair) || (!!p.dentistId && r.dentistId === p.dentistId) || (p.chair !== null && r.chair === p.chair)));
  hit.sort((x, y) => PRIORITY.indexOf(x.kind) - PRIORITY.indexOf(y.kind) || Date.parse(x.startsAt) - Date.parse(y.startsAt));
  return hit[0] ?? null;
}

/** The clinic's closure that covers a whole day (its opening hours, or the whole day when it has none), or null. */
export function wholeDayClosed<T extends Blocky>(blocks: T[], hours: Record<number, [number, number] | null>, ymd: string): T | null {
  const d0 = startMs(ymd), open = hoursOf(hours, dowOf(ymd)) ?? [0, 1440];
  return blocks.find((r) => r.kind === 'closed' && !r.dentistId && !r.chair
    && Date.parse(r.startsAt) <= d0 + open[0] * 60_000 && Date.parse(r.endsAt) >= d0 + open[1] * 60_000) ?? null;
}
/** A dentist's time away that covers a whole day they are in (their hours, else the clinic's), or null. */
export function wholeDayAway<T extends Blocky>(blocks: T[], hours: Record<number, [number, number] | null>, ymd: string, dentist: StaffDay): T | null {
  const dow = dowOf(ymd), d0 = startMs(ymd);
  const own = dentist.hours?.[dow], open = own ? [own[0], own[1]] : (hoursOf(hours, dow) ?? [0, 1440]);
  return blocks.find((r) => r.kind === 'leave' && r.dentistId === dentist.id
    && Date.parse(r.startsAt) <= d0 + open[0] * 60_000 && Date.parse(r.endsAt) >= d0 + open[1] * 60_000) ?? null;
}

/** The day's lunch (minutes after midnight), or null. */
export function lunchOn(blocks: Blocky[], ymd: string): [number, number] | null {
  const d0 = startMs(ymd), r = blocks.find((b) => b.kind === 'lunch' && Date.parse(b.startsAt) >= d0 && Date.parse(b.startsAt) < d0 + DAY_MS);
  return r ? [Math.round((Date.parse(r.startsAt) - d0) / 60_000), Math.round((Date.parse(r.endsAt) - d0) / 60_000)] : null;
}

/** "12–1 pm", "11:30 am–12:30 pm", "9 am–12 pm": a short span for the count line and the printed day. */
export const spanShort = (s: number, e: number) => {
  const ap = (m: number) => (Math.floor(m / 60) % 24 >= 12 ? 'pm' : 'am');
  const f = (m: number) => { const h = Math.floor(m / 60) % 24; return `${h % 12 || 12}${m % 60 ? `:${pad(m % 60)}` : ''}`; };
  return ap(s) === ap(e) ? `${f(s)}–${f(e)} ${ap(e)}` : `${f(s)} ${ap(s)}–${f(e)} ${ap(e)}`;
};

/** A dentist's days and, where they have them, their hours: "Mon–Sat", "Tue 1–6 pm, Thu". Days with the same
 *  hours (or none) are joined as daysText joins them. */
export function daysHoursText(s: StaffDay): string {
  const groups = new Map<string, number[]>();
  for (const d of s.days) { const h = s.hours?.[d]; const k = h ? `${h[0]}-${h[1]}` : ''; groups.set(k, [...(groups.get(k) ?? []), d]); }
  return [...groups.entries()].sort((a, b) => Math.min(...a[1]) - Math.min(...b[1])).map(([k, days]) => {
    if (!k) return daysText(days);
    const [a, b] = k.split('-').map(Number);
    return `${daysText(days)} ${spanShort(a, b)}`;
  }).join(', ');
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
  /** The longest wait on the bench right now, in minutes, and whose it is. */
  waitMax: number; waitWho: string | null;
  /** Finished visits with no next visit on the book and no check-up set. */
  noNext: number;
}
/** Today's numbers from today's visits (cancelled ones are never in the list). */
export function summarize(today: Card[], me = '', now = Date.now()): Summary {
  const s: Summary = { booked: 0, fromWeb: 0, waiting: 0, inChair: 0, done: 0, noShow: 0, expected: 0, priced: 0, unpriced: 0, ranged: 0, mine: 0, waitMax: 0, waitWho: null, noNext: 0 };
  for (const c of today) {
    if (c.status === 'cancelled') continue;
    s.booked++;
    if (c.source !== 'staff') s.fromWeb++;
    if (me && c.dentistId === me) s.mine++;
    if (c.status === 'arrived' || c.status === 'in_lobby') {
      s.waiting++;
      const w = waitMinutes(c, now);
      if (w !== null && w >= s.waitMax) { s.waitMax = w; s.waitWho = c.patientName; }
    }
    if (c.status === 'in_chair') s.inChair++;
    if (c.status === 'completed') s.done++;
    if (noNextVisit(c)) s.noNext++;
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
  const noNext = s.noNext ? `${s.noNext} with no next visit` : '';
  const booked = s.booked === 0 ? 'nothing on the book yet'
    : money ? [isDentist && `${s.mine} with you`, s.done ? `${s.done} done` : !isDentist && 'none done yet', s.noShow && n(s.noShow, 'no-show'), noNext].filter(Boolean).join(' · ')
    : [isDentist ? `${s.mine} with you` : s.fromWeb ? `${s.fromWeb} from the web` : 'all booked at the desk', noNext].filter(Boolean).join(' · ');
  return {
    booked,
    // The longest wait on the bench, said in minutes; past WAIT_ALERT_MIN the tile turns amber and the words say so.
    waiting: s.waiting === 0 ? 'here, not seated yet'
      : s.waitMax >= WAIT_ALERT_MIN ? `longest ${s.waitMax} min${s.waitWho ? ` · ${s.waitWho}` : ''} · over ${WAIT_ALERT_MIN}`
      : s.waitMax > 0 ? `longest ${s.waitMax} min${s.waitWho ? ` · ${s.waitWho}` : ''}` : 'here, not seated yet',
    inChair: `of ${n(chairs, 'chair')}`,
    done: s.noShow ? n(s.noShow, 'no-show') : 'finished today',
    // The fee guide's low end of today's visits (a range counts at its low end; a visit with no price counts
    // nothing), so "at least" whenever either is in the sum.
    expected: s.booked === 0 ? 'nothing booked today' : s.priced === 0 ? 'no fee-guide prices today'
      : `${s.ranged || s.unpriced ? 'at least ' : ''}${peso(s.expected)} expected`,
  };
}
