// The top bar's inbox: what is waiting on the desk, as three counts. Server
// only (the Clinic layout calls it on every workspace page).
//
//   failed   — texts to patients that failed in the last 7 days and were not
//              sent again (Messages → Failed shows the same rows). Sign-in
//              codes (reset, invite) are not counted: a code expires, so it is
//              never sent again; a new one comes from the sign-in page or
//              Clinic settings → Team.
//   replies  — texts patients sent in since this browser last opened Messages
//              (the fl_replies_seen cookie, per branch; at most 7 days back).
//   requests — web requests the desk has not given a time yet (source =
//              'request' and moved_at is null, the rule in CLAUDE.md), not
//              cancelled, for yesterday or later — the same window as the
//              Today page's web list.
//   forms    — patient forms sent from the QR code on the desk and not yet
//              added or dismissed (patient_form.status 'new', 028). Only for
//              someone who can add patients here (staff_access.
//              can_edit_records, the queue's own rule); null for anyone else,
//              and then the inbox leaves the row out. The sidebar's Patients
//              tab shows the same number.
//
// One transaction under withClinic(), so row-level security keeps every count
// to this branch. It never breaks the page: if it cannot be read, the inbox
// shows no number.
import { withClinic } from '../../lib/db';

export interface Inbox { failed: number; replies: number; requests: number; forms: number | null; total: number }

/** Messages sets this when it shows the replies; path-scoped to the branch. */
export const SEEN_COOKIE = 'fl_replies_seen';
export const WINDOW_DAYS = 7;

export function seenAt(raw: string | undefined): Date {
  const floor = Date.now() - WINDOW_DAYS * 86_400_000;
  const n = Number(raw);
  return new Date(Number.isFinite(n) && n > floor && n <= Date.now() + 60_000 ? n : floor);
}

/** staffId: who is looking, for the forms count (left out, null, when not given or not allowed). */
export async function inboxFor(clinicId: string, seen: Date, staffId?: string | null): Promise<Inbox | null> {
  try {
    const r = await withClinic(clinicId, async (tx) => (await tx.query(
      `select
         (select count(*) from message_log
           where channel = 'sms' and direction = 'out' and status = 'failed' and coalesce(kind, '') not in ('reset', 'invite')
             and created_at > now() - make_interval(days => $2))::int as failed,
         (select count(*) from message_log
           where channel = 'sms' and direction = 'in' and created_at > $1)::int as replies,
         (select count(*) from appointment
           where source = 'request' and moved_at is null
             and status not in ('cancelled', 'no_show', 'completed')
             and starts_at >= now() - interval '1 day')::int as requests,
         case when coalesce((select a.can_edit_records from staff_access a where a.staff_id = $3::uuid and a.clinic_id = $4::uuid), false)
              then (select count(*) from patient_form where status = 'new')::int end as forms`,
      [seen, WINDOW_DAYS, staffId ?? null, clinicId])).rows[0]);
    const forms: number | null = r.forms ?? null;
    return { failed: r.failed, replies: r.replies, requests: r.requests, forms, total: r.failed + r.replies + r.requests + (forms ?? 0) };
  } catch (e) {
    console.error('inbox: could not count', e);
    return null;
  }
}
