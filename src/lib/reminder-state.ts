// The reminder text's state for a visit, in the desk's words: "Reminder sent 6:02 pm", "Reminder queued for
// 6:00 pm", "Reminder goes the day before", "No reminder: no mobile on file". Moved out of the Calls page
// (src/pages/c/[clinic]/calls/index.astro) as it was, so Calls, the Block time panel and Calls → In closed time
// say one thing (040).
import type { Tx } from './db';
import { manilaToday } from './health';
import { timeText, whenText } from './schedule';
import { normalizePhone, PH_MOBILE } from './messages';
import { willRemind } from './availability';

export type Reminder = { status: string; nextAt: Date; sentAt: Date | null };
type Tone = 'ok' | 'wait' | 'none';

/** The newest reminder row per visit (kind 'reminder', direction 'out'), as Calls reads it. */
export async function remindersFor(tx: Tx, ids: string[]): Promise<Map<string, Reminder>> {
  const reminders = new Map<string, Reminder>();
  if (!ids.length) return reminders;
  const { rows: ms } = await tx.query(
      `select distinct on (appointment_id) appointment_id, status, next_attempt_at, sent_at
         from message_log where kind = 'reminder' and direction = 'out' and appointment_id = any($1::uuid[])
        order by appointment_id, created_at desc`, [ids]);
  for (const m of ms) reminders.set(m.appointment_id, { status: m.status, nextAt: new Date(m.next_attempt_at), sentAt: m.sent_at ? new Date(m.sent_at) : null });
  return reminders;
}

/** A visit's reminder, in words: the line on the screen, its tone (the icon and tint), and the sheet's short form. */
export function reminderWords(v: { startsAt: Date; phone: string | null }, r: Reminder | undefined, now = new Date()): { text: string; tone: Tone; short: string } {
  const today = manilaToday(now);
  /** A time, or the day and time when it was another day. */
  const stamp = (d: Date) => (manilaToday(d) === today ? timeText(d) : whenText(d));
  const canText = (phone: string | null) => !!phone && PH_MOBILE.test(normalizePhone(phone));
  if (!canText(v.phone)) return { text: 'No reminder: no mobile on file', tone: 'none', short: 'none, no mobile' };
  if (!r) return willRemind(v.startsAt, now)
    ? { text: 'Reminder goes the day before', tone: 'wait', short: 'goes the day before' }
    : { text: 'No reminder: booked too late for one', tone: 'none', short: 'none, booked late' };
  if (r.status === 'sent' || r.status === 'delivered') { const at = stamp(r.sentAt ?? r.nextAt); return { text: `Reminder sent ${at}`, tone: 'ok', short: `sent ${at}` }; }
  if (r.status === 'queued' || r.status === 'sending') { const at = stamp(r.nextAt); return { text: `Reminder queued for ${at}`, tone: 'wait', short: `queued ${at}` }; }
  if (r.status === 'failed') return { text: 'Reminder could not be sent', tone: 'none', short: 'failed' };
  return { text: 'Reminder withdrawn', tone: 'none', short: 'withdrawn' };
}
