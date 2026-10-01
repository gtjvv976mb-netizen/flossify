// Clinic hours and open slots, computed in Manila time on the visitor's device.
//
// Two rules from the service map live here. Show only availability you can
// honour: a slot exists only inside the clinic's hours, on a day the chosen
// dentist is in, and not already taken. And say the truth about time: the
// status pill reads "closing soon" in the last hour and "opens tomorrow 9:00"
// when it is shut, in the clinic's own time zone, not the visitor's.
//
// With a database, `isTaken` is answered by the clinic's real appointments
// (see lib/directory-db.ts). Without one — the static build — "taken" is a
// stable hash of the slot, so the same slots are busy on every visit.

import type { Hours } from '../data/directory';

export const TZ = 'Asia/Manila';
const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export interface Now { day: number; mins: number; ymd: string }

/** The clinic's clock, regardless of where the visitor is. */
export function manilaNow(d = new Date()): Now {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, weekday: 'short', hour: 'numeric', minute: 'numeric', hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return {
    day: DAY.indexOf(get('weekday')),
    mins: (+get('hour') % 24) * 60 + +get('minute'),
    ymd: `${get('year')}-${get('month')}-${get('day')}`,
  };
}

export const fmtHour = (h: number) => {
  const whole = Math.floor(h), m = Math.round((h - whole) * 60);
  return `${whole % 12 || 12}${m ? ':' + String(m).padStart(2, '0') : ''} ${whole >= 12 ? 'pm' : 'am'}`;
};

export interface Status { state: 'open' | 'closing' | 'closed' | 'appt'; text: string; open: boolean }

/**
 * Time the clinic is not open on one Manila day, in minutes after midnight: a dated closure the clinic
 * added ('closed') or its lunch ('lunch'). One piece per day; a closure over several days is several
 * pieces (lib/directory-db.ts closuresFor, from public_blocked_ranges). Never a note or a reason.
 */
export interface DayClosure { ymd: string; from: number; to: number; kind: 'closed' | 'lunch' }

/** A day's open windows in minutes: [open, close] minus the cuts, in order, never touching. */
export function openIntervals(day: [number, number] | null, cuts: [number, number][]): [number, number][] {
  if (!day || !(day[1] > day[0])) return [];
  let out: [number, number][] = [[day[0], day[1]]];
  for (const [a, b] of cuts) {
    if (!(b > a)) continue;
    const next: [number, number][] = [];
    for (const [x, y] of out) {
      if (b <= x || a >= y) { next.push([x, y]); continue; }
      if (a > x) next.push([x, a]);
      if (b < y) next.push([b, y]);
    }
    out = next;
  }
  return out;
}

/** An epoch-ms range cut into Manila days (UTC+8 all year): the piece on each day, in minutes. */
export function dayPieces(s: number, e: number): { ymd: string; from: number; to: number }[] {
  const H8 = 8 * 3_600_000, D = 86_400_000, out: { ymd: string; from: number; to: number }[] = [];
  for (let d0 = Math.floor((s + H8) / D) * D - H8; d0 < e; d0 += D) {
    const a = Math.max(s, d0), b = Math.min(e, d0 + D);
    if (b > a) out.push({ ymd: new Date(d0 + H8).toISOString().slice(0, 10), from: Math.round((a - d0) / 60_000), to: Math.round((b - d0) / 60_000) });
  }
  return out;
}

/** "Thu 2 Apr" for a Manila date. */
export const dayLabel = (ymd: string) => addDays(ymd, 0).label;

/**
 * The status pill, on the clinic's clock. `closures` are the clinic's dated closures and lunch from
 * today on (closuresFor reads 31 days); with none, every string is the one this gave before blocked
 * time existed (checked against d07558b, every listing × every 15 minutes of a week). It looks 30
 * days ahead at most: a clinic with hours and nothing open in that span is "Closed for now". The next
 * opening is dated ("Opens Mon 13 Apr, 9 am") only when it is more than a week away, or exactly a week
 * because a closure moved it there; a clinic open one weekday still says "Opens Mon 9 am".
 */
export function statusFor(hours: Hours, now = manilaNow(), closures: DayClosure[] = []): Status {
  // Minutes as the old code compared them (hours × 60, unrounded); words from whole minutes.
  const span = (d: number): [number, number] | null => { const h = hours[d]; return h ? [h[0] * 60, h[1] * 60] : null; };
  const at = (m: number) => fmtHour(Math.round(m) / 60);
  const cutsOn = (ymd: string) => closures.filter((c) => c.ymd === ymd).map((c) => [c.from, c.to] as [number, number]);
  const closedIn = (ymd: string, a: number, b: number) => closures.some((c) => c.ymd === ymd && c.kind === 'closed' && c.from < b && c.to > a);

  const day = span(now.day);
  const today = openIntervals(day, cutsOn(now.ymd));
  const inNow = today.find(([a, b]) => now.mins >= a && now.mins < b);
  if (inNow) {
    const end = inNow[1], soon = end - now.mins <= 60;
    // What comes at `end`: the day's close, a closure, or lunch (a gap with only lunch in it).
    const resume = today.find(([a]) => a >= end)?.[0] ?? day![1];
    const lunch = end < day![1] && !closedIn(now.ymd, end, resume);
    if (lunch) return soon
      ? { state: 'closing', text: `Lunch soon · ${at(end)}`, open: true }
      : { state: 'open', text: `Open now · lunch at ${at(end)}`, open: true };
    return soon
      ? { state: 'closing', text: `Closing soon · ${at(end)}`, open: true }
      : { state: 'open', text: `Open now · until ${at(end)}`, open: true };
  }
  const later = today.find(([a]) => a > now.mins);
  if (later) {
    if (now.mins < day![0]) return { state: 'closed', text: `Opens today ${at(later[0])}`, open: false };
    if (closedIn(now.ymd, now.mins, later[0])) return { state: 'closed', text: `Closed now · opens ${at(later[0])}`, open: false };
    return { state: 'closed', text: `Lunch · back at ${at(later[0])}`, open: false };
  }

  // Not again today: the next day with open time, within 30 days.
  let weekly = 0;
  for (let i = 1; i <= 7 && !weekly; i++) if (hours[(now.day + i) % 7]) weekly = i;
  for (let i = 1; i <= 30; i++) {
    const d = addDays(now.ymd, i);
    const open = openIntervals(span(d.day), cutsOn(d.ymd));
    if (!open.length) continue;
    if (i > 7 || (i === 7 && weekly !== 7)) return { state: 'closed', text: `Opens ${d.label}, ${at(open[0][0])}`, open: false };
    const when = `${i === 1 ? 'tomorrow' : DAY[d.day]} ${at(open[0][0])}`;
    return { state: 'closed', text: day && !today.length ? `Closed today · opens ${when}` : `Opens ${when}`, open: false };
  }
  return Object.values(hours).some(Boolean)
    ? { state: 'closed', text: 'Closed for now', open: false }
    : { state: 'appt', text: 'By appointment', open: false };
}

// --- The public slot rule (040) -----------------------------------------------------------------------
//
// One rule decides what a patient is offered (openSlots) and what the booking re-checks inside its
// transaction (slotStillOpen), so an offer and a refusal never disagree. Ranges are in epoch ms.

/** A visit on the book: its dentist's public slug (null when none, or not listed here), and whether it has a dentist at all. */
export interface BusyRange { dentist: string | null; named: boolean; s: number; e: number }
/** Time not open: clinic-wide (no dentist, no chair), a listed dentist away or not in, or one chair out of use. */
export interface BlockedRange { dentist: string | null; chair: number | null; s: number; e: number }

/**
 * Whether [s, e) can be offered.
 * 1. Nothing clinic-wide (shut, lunch, closed) touches it.
 * 2. A chair in service is free: chairs, less those out of use then (only chairs 1..chairs count), less
 *    every visit then. On both paths: a named dentist still needs a chair.
 * 3. A named dentist is listed here and has nothing then, away or booked.
 * 4. No dentists listed at all: chairs only.
 * 5. The listed dentists who are in and free outnumber the visits booked then with no dentist, so each
 *    of those still has someone to see it after this one. A visit whose dentist is not listed here
 *    holds a chair (2) but no listed dentist.
 */
export function slotOpen(q: { s: number; e: number; dentist: string | null; chairs: number; dentists: string[]; busy: BusyRange[]; blocked: BlockedRange[] }): boolean {
  const hit = (r: { s: number; e: number }) => r.s < q.e && r.e > q.s;
  const blocked = q.blocked.filter(hit);
  if (blocked.some((r) => r.dentist === null && r.chair === null)) return false;
  const out = new Set(blocked.filter((r) => r.chair !== null && r.chair >= 1 && r.chair <= q.chairs).map((r) => r.chair));
  const over = q.busy.filter(hit);
  if (over.length >= q.chairs - out.size) return false;
  const taken = (slug: string) => blocked.some((r) => r.dentist === slug) || over.some((r) => r.dentist === slug);
  if (q.dentist !== null && (!q.dentists.includes(q.dentist) || taken(q.dentist))) return false;
  if (!q.dentists.length) return true;
  const free = q.dentists.filter((d) => !taken(d)).length;
  return free - over.filter((r) => !r.named).length > 0;
}

/** Deterministic "is this slot taken": the same answer for the same slot, every visit. */
function taken(key: string, load = 0.45) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 1000) / 1000 < load;
}

export interface Slot { date: string; day: number; mins: number; label: string; dayLabel: string }

/** Add n days to a YYYY-MM-DD string without touching time zones. */
function addDays(ymd: string, n: number) {
  const [y, m, d] = ymd.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return { ymd: t.toISOString().slice(0, 10), day: t.getUTCDay(), label: `${DAY[t.getUTCDay()]} ${t.getUTCDate()} ${t.toLocaleString('en', { month: 'short', timeZone: 'UTC' })}` };
}

/**
 * Open slots for a clinic, 30 minutes apart, for the next `days` days.
 * `dentistDays` limits to the weekdays a chosen dentist is in; omit for any dentist.
 * Slots less than 60 minutes from now are not offered — nobody can get there.
 */
export function slotsFor(slug: string, hours: Hours, opts: { days?: number; dentistDays?: number[]; limit?: number; now?: Now; minutes?: number; isTaken?: (ymd: string, startMin: number, endMin: number) => boolean } = {}): Slot[] {
  const now = opts.now ?? manilaNow();
  const out: Slot[] = [];
  const step = 30, need = Math.max(step, opts.minutes ?? step);
  for (let i = 0; i < (opts.days ?? 14); i++) {
    const d = addDays(now.ymd, i);
    const h = hours[d.day];
    if (!h) continue;
    if (opts.dentistDays && !opts.dentistDays.includes(d.day)) continue;
    const dayLabel = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.label;
    for (let m = h[0] * 60; m + need <= h[1] * 60; m += step) {
      if (i === 0 && m < now.mins + 60) continue;
      if (opts.isTaken ? opts.isTaken(d.ymd, m, m + need) : taken(`${slug}|${d.ymd}|${m}`)) continue;
      out.push({ date: d.ymd, day: d.day, mins: m, label: fmtHour(m / 60), dayLabel });
      if (opts.limit && out.length >= opts.limit) return out;
    }
  }
  return out;
}

export interface SlotWords { at: string; date: string; mins: number; label: string; dayLabel: string }
/**
 * A slot's words from its time as the booking links write it ("2026-09-24T09:30:00+08:00"), labelled the
 * way slotsFor labels one: "Today", "Tomorrow" or "Wed 24 Sep", and "9:30 am". Manila's date and clock,
 * whatever the device's zone. A past time is still given words (the page says it has passed).
 * Null for anything that is not a slot time.
 */
export function slotWords(iso: string, now: Now = manilaNow()): SlotWords | null {
  const m = /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):([0-5]\d):00\+08:00$/.exec(iso);
  if (!m) return null;
  const d = addDays(m[1], 0);
  if (d.ymd !== m[1]) return null;                       // 2026-02-31 rolls into March
  const utc = (ymd: string) => { const [y, mo, da] = ymd.split('-').map(Number); return Date.UTC(y, mo - 1, da); };
  const diff = Math.round((utc(m[1]) - utc(now.ymd)) / 86_400_000);
  const mins = +m[2] * 60 + +m[3];
  return { at: iso, date: d.ymd, mins, label: fmtHour(mins / 60), dayLabel: diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : d.label };
}

/** The week, Monday first: "9 am – 6 pm", with " · lunch 12 pm – 1 pm" on a day that has one (hours, as DbListing.lunch). */
export const hoursRows = (hours: Hours, lunch: Record<number, [number, number]> = {}) =>
  [1, 2, 3, 4, 5, 6, 0].map((d) => ({ day: d, name: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d], text: hours[d] ? `${fmtHour(hours[d]![0])} – ${fmtHour(hours[d]![1])}${lunch[d] ? ` · lunch ${fmtHour(lunch[d][0])} – ${fmtHour(lunch[d][1])}` : ''}` : 'By appointment' }));

/** "1–6 pm", "9 am–1 pm": a span of hours in the fewest words. */
export function spanText(a: number, b: number): string {
  const fa = fmtHour(a), fb = fmtHour(b);
  return fa.slice(-2) === fb.slice(-2) ? `${fa.slice(0, -3)}–${fb}` : `${fa}–${fb}`;
}

/** A dentist's days at a clinic, with their hours where they have them: "Tue 1–6 pm · Thu". Hours are in hours. */
export const dentistDaysText = (days: number[], hours: Record<number, [number, number]> = {}, sep = ' · ') =>
  days.map((n) => `${DAY[n]}${hours[n] ? ` ${spanText(hours[n][0], hours[n][1])}` : ''}`).join(sep);

/**
 * The clinic's dated closures as runs of days: whole days in a row as one run, a day closed for part of
 * its hours on its own with those parts (clipped to the hours). Lunch is the hours table's, not here; a
 * closure only outside the hours, or only on days the clinic is shut anyway, says nothing new and is left out.
 */
function closedRuns(closures: DayClosure[], hours: Hours) {
  const known = Object.values(hours).some(Boolean);
  const byDay = new Map<string, [number, number][]>();
  for (const c of closures) if (c.kind === 'closed') (byDay.get(c.ymd) ?? byDay.set(c.ymd, []).get(c.ymd)!).push([c.from, c.to]);
  const runs: { from: string; to: string; parts: [number, number][]; open: boolean }[] = [];
  for (const ymd of [...byDay.keys()].sort()) {
    const cuts = byDay.get(ymd)!, h = known ? hours[addDays(ymd, 0).day] : [0, 24] as [number, number];
    const day: [number, number] | null = h ? [h[0] * 60, h[1] * 60] : null;
    let parts: [number, number][] = [];
    if (day) {
      const left = openIntervals(day, cuts);
      let x = day[0];
      for (const [a, b] of left) { if (a > x) parts.push([x, a]); x = b; }
      if (x < day[1]) parts.push([x, day[1]]);
      if (!parts.length) continue;
      if (left.length) { runs.push({ from: ymd, to: ymd, parts, open: true }); continue; }
      parts = [];
    } else if (!cuts.some(([a, b]) => a <= 0 && b >= 1440)) continue;
    const prev = runs[runs.length - 1];
    if (prev && !prev.parts.length && addDays(prev.to, 1).ymd === ymd) { prev.to = ymd; prev.open ||= !!day; }
    else runs.push({ from: ymd, to: ymd, parts, open: !!day });
  }
  return runs.filter((r) => r.open);
}
const minText = (m: number) => fmtHour(Math.round(m) / 60);

/** The hours card's "Closed days ahead": "Thu 2 Apr – Sun 5 Apr: closed", "Fri 9 Oct: closed 2 pm – 5 pm". Never a note. */
export const closedDaysText = (closures: DayClosure[], hours: Hours): string[] =>
  closedRuns(closures, hours).map((r) => r.parts.length
    ? `${dayLabel(r.from)}: closed ${r.parts.map(([a, b]) => `${minText(a)} – ${minText(b)}`).join(', ')}`
    : `${dayLabel(r.from)}${r.to !== r.from ? ` – ${dayLabel(r.to)}` : ''}: closed`);

/** A request's "Closed on: Thu 2 Apr – Sun 5 Apr, Fri 9 Oct 2–5 pm.", or '' when nothing ahead is closed. */
export function closedOnText(closures: DayClosure[], hours: Hours): string {
  const runs = closedRuns(closures, hours);
  if (!runs.length) return '';
  return `Closed on: ${runs.map((r) => r.parts.length
    ? `${dayLabel(r.from)} ${r.parts.map(([a, b]) => spanText(Math.round(a) / 60, Math.round(b) / 60)).join(', ')}`
    : `${dayLabel(r.from)}${r.to !== r.from ? ` – ${dayLabel(r.to)}` : ''}`).join(', ')}.`;
}

/**
 * Booked by 8:30 pm Manila the day before, a visit's reminder goes out that
 * evening: the worker writes tomorrow's reminders every ten minutes
 * (sms_enqueue_reminders, 019) and holds them from 9 pm to 8 am. Later than
 * that, it waits for 8 am on the visit day, or, booked in the last minutes
 * before midnight, misses the pass altogether.
 */
const REMIND_BY_MIN = 20 * 60 + 30;
/**
 * Whether the day-before text will come for a visit booked now. Never for a
 * visit today; for one tomorrow only when booked before REMIND_BY_MIN; always
 * for a later day. Manila keeps one offset all year, so +24 h is tomorrow.
 */
export function willRemind(startsAt: Date, now = new Date()): boolean {
  const visit = manilaNow(startsAt).ymd, today = manilaNow(now), tomorrow = manilaNow(new Date(now.getTime() + 86_400_000)).ymd;
  return visit > tomorrow || (visit === tomorrow && today.mins < REMIND_BY_MIN);
}
