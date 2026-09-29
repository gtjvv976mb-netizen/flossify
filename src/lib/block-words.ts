// Blocked time in words (040): the sentence the desk reads when a visit would sit in time the clinic is not
// open for booking, the calendar's labels, the Calls page's "why" pill and the line a save says. Pure: no Node
// and no database imports, so the server (/api/schedule's soft stop, src/lib/blocks.ts) and the browser (the
// calendar) say one thing.
//
// A range is one row of clinic_unavailable() (040), its times as ISO strings:
//   shut       before opening, after closing, a weekday with no hours    "The clinic opens at 9:00 am on Mondays."
//   lunch      the day's break                                          "Lunch is 12:00–1:00 pm."
//   hours      a dentist on a weekday they are not in, or outside their from/to
//                                                                       "Dr. Cariño is in from 1:00 pm on Mondays."
//   closed · leave · chair_out   a dated block someone added            "The clinic is closed Thu 2 Apr – Sun 5 Apr (Holy week)."
//
// Times are Manila's clock whatever the machine says (+08:00 all year, so a day is exactly 24 hours). A range
// from Manila midnight to Manila midnight is whole days and is written as days; any other range as times. The
// weekly kinds (shut, hours) are worded from their edges: [00:00, x) "opens at x" / "is in from x", [x, 24:00)
// "closes at x" / "is in until x", the whole day "closed on / not in on <weekday>s". A dated block already under
// way says when it ends ("until 3:00 pm"); one ahead says when it is ("2:00–5:00 pm on Fri 9 Oct").

export type BlockKind = 'closed' | 'leave' | 'chair_out';
export type RangeKind = BlockKind | 'lunch' | 'hours' | 'shut';
export interface RangeLike { kind: RangeKind; startsAt: string; endsAt: string; dentistName?: string | null; chair?: number | null; note?: string | null }

const DAY = 86_400_000, OFFSET = 8 * 3_600_000;
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAYS = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];
// Spelled out rather than asked of Intl: en-GB writes September "Sept" in current ICU data, and the desk reads "Sep".
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Manila's day (days since 1 Jan 1970 there) and the minute of that day. */
const local = (t: number) => { const l = t + OFFSET; const day = Math.floor(l / DAY); return { day, min: Math.floor((l - day * DAY) / 60_000) }; };
const dow = (day: number) => new Date(day * DAY).getUTCDay();
/** "Thu 2 Apr" */
const dayWords = (day: number) => { const d = new Date(day * DAY); return `${WD[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}`; };
const pad = (n: number) => String(n).padStart(2, '0');
/** 540 → "9:00 am", 720 → "12:00 pm", 780 → "1:00 pm". */
const hm = (min: number) => { const h = Math.floor(min / 60) % 24; return `${h % 12 || 12}:${pad(min % 60)} ${h >= 12 ? 'pm' : 'am'}`; };
/** "12:00–1:00 pm", "9:00 am–12:00 pm": the am or pm once when both ends share it. */
const span = (a: number, b: number) => { const x = hm(a), y = hm(b); return x.slice(-2) === y.slice(-2) ? `${x.slice(0, -3)}–${y}` : `${x}–${y}`; };

/** "Dr. Ramon Cariño" → "Dr. Cariño"; a name without the title is used whole. A suffix (Jr., III) stays with the
 *  surname. The rule of shortName in src/lib/schedule.ts and cal/model.ts, kept here so this file stays pure. */
function shortName(full: string | null | undefined): string {
  if (!full) return '';
  const w = full.trim().split(/\s+/);
  if (w.length < 3 || !/^dra?\.?$/i.test(w[0])) return full.trim();
  const tail = /^(jr\.?|sr\.?|ii|iii|iv)$/i.test(w[w.length - 1]) ? w.slice(-2) : w.slice(-1);
  return `${w[0].replace(/\.?$/, '.')} ${tail.join(' ')}`;
}
const whoOf = (r: RangeLike) => shortName(r.dentistName) || 'The dentist';
const noteOf = (r: RangeLike) => r.note?.replace(/\s+/g, ' ').trim() || '';

/** A weekly range (shut, lunch, hours) lies inside one Manila day: its weekday and its minutes, 1440 for midnight. */
function weekly(r: RangeLike) {
  const s = Date.parse(r.startsAt), e = Date.parse(r.endsAt);
  const a = local(s), d0 = a.day * DAY - OFFSET;
  return { dow: dow(a.day), from: a.min, to: Math.min(1440, Math.round((e - d0) / 60_000)) };
}

/**
 * When a dated range is, for a sentence: "Mon 5 Oct", "Thu 2 Apr – Sun 5 Apr" (whole days); "2:00–5:00 pm on
 * Fri 9 Oct", "on Fri 9 Oct from 2:00 pm", "on Fri 9 Oct until 3:00 pm", "Fri 9 Oct, 2:00 pm – Sat 10 Oct,
 * 11:00 am" (times ahead; "today" in place of today's date); and for one already under way, when it ends:
 * "until 3:00 pm" (today), "until Sat 10 Oct, 11:00 am", "until the end of Sat 10 Oct".
 */
export function whenWords(r: Pick<RangeLike, 'startsAt' | 'endsAt'>, now: Date | number = Date.now()): string {
  const s = Date.parse(r.startsAt), e = Date.parse(r.endsAt), t = +now;
  const a = local(s), b = local(e);
  const last = b.min === 0 ? b.day - 1 : b.day; // an end at midnight belongs to the day before
  if (a.min === 0 && b.min === 0) return last <= a.day ? dayWords(a.day) : `${dayWords(a.day)} – ${dayWords(last)}`;
  const today = local(t).day;
  if (s <= t) {
    if (b.min === 0) return last === today ? 'until midnight' : `until the end of ${dayWords(last)}`;
    return b.day === today ? `until ${hm(b.min)}` : `until ${dayWords(b.day)}, ${hm(b.min)}`;
  }
  if (a.day === last) {
    const day = a.day === today ? 'today' : `on ${dayWords(a.day)}`;
    if (a.min === 0) return `${day} until ${hm(b.min)}`;
    if (b.min === 0) return `${day} from ${hm(a.min)}`;
    return `${span(a.min, b.min)} ${day}`;
  }
  const from = a.min === 0 ? dayWords(a.day) : `${dayWords(a.day)}, ${hm(a.min)}`;
  const to = b.min === 0 ? dayWords(last) : `${dayWords(b.day)}, ${hm(b.min)}`;
  return `${from} – ${to}`;
}

/** When a range is on one day the calendar shows (ymd, Manila): "all day", "until 3:00 pm", "from 2:00 pm", "9:00 am–12:00 pm". */
function onDay(r: Pick<RangeLike, 'startsAt' | 'endsAt'>, ymd: string): string {
  const d0 = Date.parse(`${ymd}T00:00:00+08:00`), d1 = d0 + DAY;
  const s = Math.max(Date.parse(r.startsAt), d0), e = Math.min(Date.parse(r.endsAt), d1);
  if (s <= d0 && e >= d1) return 'all day';
  const a = Math.round((s - d0) / 60_000), b = Math.round((e - d0) / 60_000);
  if (a <= 0) return `until ${hm(b)}`;
  if (b >= 1440) return `from ${hm(a)}`;
  return span(a, b);
}

function sentence(r: RangeLike, now: number, withNote: boolean): string {
  const note = withNote && noteOf(r) ? ` (${noteOf(r)})` : '';
  switch (r.kind) {
    case 'lunch': { const w = weekly(r); return `Lunch is ${span(w.from, w.to)}.`; }
    case 'shut': {
      const w = weekly(r), days = WEEKDAYS[w.dow];
      if (w.from === 0 && w.to >= 1440) return `The clinic is closed on ${days}.`;
      if (w.from === 0) return `The clinic opens at ${hm(w.to)} on ${days}.`;
      if (w.to >= 1440) return `The clinic closes at ${hm(w.from)} on ${days}.`;
      return `The clinic is closed ${span(w.from, w.to)} on ${days}.`;
    }
    case 'hours': {
      const w = weekly(r), days = WEEKDAYS[w.dow], who = whoOf(r);
      if (w.from === 0 && w.to >= 1440) return `${who} is not in on ${days}.`;
      if (w.from === 0) return `${who} is in from ${hm(w.to)} on ${days}.`;
      if (w.to >= 1440) return `${who} is in until ${hm(w.from)} on ${days}.`;
      return `${who} is not in ${span(w.from, w.to)} on ${days}.`;
    }
    case 'closed': return `The clinic is closed ${whenWords(r, now)}${note}.`;
    case 'leave': return `${whoOf(r)} is away ${whenWords(r, now)}${note}.`;
    case 'chair_out': return `Chair ${r.chair ?? ''} is out of use ${whenWords(r, now)}${note}.`;
  }
}

/** The soft stop's sentence (spec p07 §1.4): "Lunch is 12:00–1:00 pm.", "Dr. Cariño is not in on Saturdays.",
 *  "The clinic is closed Thu 2 Apr – Sun 5 Apr (Holy week)." `now` decides whether a dated block is under way. */
export function blockSentence(r: RangeLike, now: Date | number = Date.now()): string {
  return sentence(r, +now, true);
}

/**
 * The calendar's words for a range. `chip`, on the hatch in the grid: "Lunch", "Closed" or "Closed · Holy week",
 * "Away", "Not in", "Out of use". `strip`, a pill above the grid: "Closed all day · Holy week", "Dr. Cariño away ·
 * 9:00 am–12:00 pm", "Chair 2 out of use · until 3:00 pm". Give `day` (the ymd on screen) for the strip, so the
 * range is worded for that day ("all day", "until …", "from …"); without it the range is worded whole.
 */
export function blockLabel(r: RangeLike, where: 'chip' | 'strip', o: { day?: string; now?: Date | number } = {}): string {
  const note = noteOf(r);
  if (where === 'chip') {
    switch (r.kind) {
      case 'lunch': return 'Lunch';
      case 'closed': return note ? `Closed · ${note}` : 'Closed';
      case 'shut': return 'Closed';
      case 'leave': return 'Away';
      case 'hours': return 'Not in';
      case 'chair_out': return 'Out of use';
    }
  }
  const when = o.day ? onDay(r, o.day) : r.kind === 'lunch' || r.kind === 'shut' || r.kind === 'hours'
    ? (() => { const w = weekly(r); return span(w.from, w.to); })()
    : whenWords(r, o.now ?? Date.now());
  switch (r.kind) {
    case 'closed': return `Closed ${when}${note ? ` · ${note}` : ''}`;
    case 'shut': return `Closed · ${when}`;
    case 'lunch': return `Lunch · ${when}`;
    case 'leave': return `${whoOf(r)} away · ${when}`;
    case 'hours': return `${whoOf(r)} not in · ${when}`;
    case 'chair_out': return `Chair ${r.chair ?? ''} out of use · ${when}`;
  }
}

/** Calls → In closed time, the pill that says why (spec p07 §1.5): "Lunch 12:00–1:00 pm", "Clinic closed · Holy
 *  week", "Dr. Cariño away", "Chair 2 out of use", "Outside opening hours", "Dr. Cariño not in then". */
export function whyWords(r: RangeLike): string {
  switch (r.kind) {
    case 'lunch': { const w = weekly(r); return `Lunch ${span(w.from, w.to)}`; }
    case 'closed': { const note = noteOf(r); return note ? `Clinic closed · ${note}` : 'Clinic closed'; }
    case 'leave': return `${whoOf(r)} away`;
    case 'chair_out': return `Chair ${r.chair ?? ''} out of use`;
    case 'shut': return 'Outside opening hours';
    case 'hours': return `${whoOf(r)} not in then`;
  }
}

/** The line after a block is saved: "Blocked: the clinic is closed Thu 2 Apr – Sun 5 Apr." (no note: the panel shows it). */
export function blockDone(r: RangeLike, now: Date | number = Date.now()): string {
  return `Blocked: ${sentence(r, +now, false).replace(/^The /, 'the ')}`;
}
