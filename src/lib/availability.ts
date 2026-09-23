// Clinic hours and open slots, computed in Manila time on the visitor's device.
//
// Two rules from the service map live here. Show only availability you can
// honour: a slot exists only inside the clinic's hours, on a day the chosen
// dentist is in, and not already taken. And say the truth about time: the
// status pill reads "closing soon" in the last hour and "opens tomorrow 9:00"
// when it is shut, in the clinic's own time zone, not the visitor's.
//
// There is no server in this prototype, so "taken" is a stable hash of the
// slot — the same slots are busy on every visit, which is what a real
// schedule would look like from outside.

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

export function statusFor(hours: Hours, now = manilaNow()): Status {
  const today = hours[now.day];
  if (today) {
    const [open, close] = today;
    if (now.mins >= open * 60 && now.mins < close * 60) {
      return close * 60 - now.mins <= 60
        ? { state: 'closing', text: `Closing soon · ${fmtHour(close)}`, open: true }
        : { state: 'open', text: `Open now · until ${fmtHour(close)}`, open: true };
    }
    if (now.mins < open * 60) return { state: 'closed', text: `Opens today ${fmtHour(open)}`, open: false };
  }
  for (let i = 1; i <= 7; i++) {
    const d = (now.day + i) % 7;
    const h = hours[d];
    if (h) return { state: 'closed', text: `Opens ${i === 1 ? 'tomorrow' : DAY[d]} ${fmtHour(h[0])}`, open: false };
  }
  return { state: 'appt', text: 'By appointment', open: false };
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
export function slotsFor(slug: string, hours: Hours, opts: { days?: number; dentistDays?: number[]; limit?: number; now?: Now; minutes?: number } = {}): Slot[] {
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
      if (taken(`${slug}|${d.ymd}|${m}`)) continue;
      out.push({ date: d.ymd, day: d.day, mins: m, label: fmtHour(m / 60), dayLabel });
      if (opts.limit && out.length >= opts.limit) return out;
    }
  }
  return out;
}

export const hoursRows = (hours: Hours) =>
  [1, 2, 3, 4, 5, 6, 0].map((d) => ({ day: d, name: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d], text: hours[d] ? `${fmtHour(hours[d]![0])} – ${fmtHour(hours[d]![1])}` : 'By appointment' }));
