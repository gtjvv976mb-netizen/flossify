// The calendar file a patient saves after booking ("Add to calendar"), written as RFC 5545 asks, so the phone's
// calendar reads the same event the clinic holds: text escaped, long lines folded, an end time, a place.
// No Date for the wall time: the times are Manila's as the booking gave them, and a phone set to another zone
// must not shift them. No database, no DOM: the booking page's script and the test both import this.

/** A text value (SUMMARY, DESCRIPTION, LOCATION): backslash, comma and semicolon escaped, a line break as \n. */
export function icsText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/([,;])/g, '\\$1').replace(/\r\n|\r|\n/g, '\\n');
}

/** One content line folded at 75 octets (not characters: "—" is three), a continuation starting with a space.
 *  A character is never cut in two. */
export function icsFold(line: string): string {
  const enc = new TextEncoder();
  const out: string[] = [];
  let cur = '', bytes = 0, room = 75;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (bytes + n > room) { out.push(cur); cur = ''; bytes = 0; room = 74; } // the leading space is one of the 75
    cur += ch; bytes += n;
  }
  out.push(cur);
  return out.join('\r\n ');
}

/** A wall-clock stamp plus minutes, by the calendar alone: '20260924T233000' + 45 → '20260925T001500'. */
export function icsAddMinutes(stamp: string, minutes: number): string {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/.exec(stamp);
  if (!m) throw new Error('not a calendar stamp');
  // UTC is used only as a calendar with no daylight saving; no zone is read from the device.
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5] + minutes, +m[6]));
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${p(d.getUTCFullYear(), 4)}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
}

/** The day after a date: '20261231' → '20270101' (an all-day event ends on the next day, which is not part of it). */
export function icsNextDay(date: string): string {
  return icsAddMinutes(`${date}T000000`, 24 * 60).slice(0, 8);
}

export type IcsVisit = {
  /** The booking's reference: the event's id, so saving the file twice is one event. */
  ref: string;
  /** A booking: Manila wall time, '2026-09-24T09:00…' (anything after the minutes is ignored). A request, which
   *  has no time yet: its day, '2026-09-24…'. */
  start: string;
  /** How long the visit is booked for. Left out (a request), the event is the whole day. */
  minutes?: number;
  summary: string;
  description: string;
  /** The clinic's name and its own public address; never anything else. */
  location: string;
  /** When the file is written (UTC), for DTSTAMP. */
  now?: Date;
};

/** The whole file, CRLF between lines. */
export function icsVisit(v: IcsVisit): string {
  const timed = typeof v.minutes === 'number' && v.minutes > 0;
  const day = v.start.slice(0, 10).replace(/-/g, '');
  const when = timed
    ? (() => { const s = `${day}T${v.start.slice(11, 16).replace(':', '')}00`; return [`DTSTART;TZID=Asia/Manila:${s}`, `DTEND;TZID=Asia/Manila:${icsAddMinutes(s, v.minutes!)}`]; })()
    : [`DTSTART;VALUE=DATE:${day}`, `DTEND;VALUE=DATE:${icsNextDay(day)}`];
  const stamp = (v.now ?? new Date()).toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Flossify//Visit//EN', 'BEGIN:VEVENT',
    `UID:${icsText(v.ref)}@flossify`, `DTSTAMP:${stamp}`, ...when,
    `SUMMARY:${icsText(v.summary)}`, `DESCRIPTION:${icsText(v.description)}`, `LOCATION:${icsText(v.location)}`,
    'END:VEVENT', 'END:VCALENDAR'].map(icsFold).join('\r\n');
}
