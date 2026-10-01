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
//   closed   — visits in the next 14 days that sit in time the clinic is not open for booking (lunch, a
//              closed day, a dentist away or not in, a chair out of use, outside the hours) and that nobody
//              has kept there (appointment.blocked_ok_at null): Calls → In closed time's rule
//              (src/lib/blocks.ts, VISIT_AHEAD_SQL and IN_SCOPE_SQL against clinic_unavailable(), 040),
//              over two weeks. Only for someone who may change the schedule (schedule.edit); null otherwise.
//
// One transaction under withClinic(), so row-level security keeps every count
// to this branch. It never breaks the page: if it cannot be read, the inbox
// shows no number.
import { withClinic } from '../../lib/db';
import { IN_SCOPE_SQL, VISIT_AHEAD_SQL } from '../../lib/blocks';

export interface Inbox { failed: number; replies: number; requests: number; forms: number | null; closed: number | null; total: number }

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
         case when staff_can($3::uuid, $4::uuid, 'records.edit')
              then (select count(*) from patient_form where status = 'new')::int end as forms,
         case when staff_can($3::uuid, $4::uuid, 'schedule.edit')
              then (with u as materialized (select * from clinic_unavailable($4::uuid, now(), now() + interval '14 days'))
                    select count(*) from appointment a
                     where a.clinic_id = $4::uuid and a.blocked_ok_at is null and ${VISIT_AHEAD_SQL}
                       and a.starts_at < now() + interval '14 days'
                       and exists (select 1 from u where ${IN_SCOPE_SQL}))::int end as closed`,
      [seen, WINDOW_DAYS, staffId ?? null, clinicId])).rows[0]);
    const forms: number | null = r.forms ?? null;
    const closed: number | null = r.closed ?? null;
    return { failed: r.failed, replies: r.replies, requests: r.requests, forms, closed, total: r.failed + r.replies + r.requests + (forms ?? 0) + (closed ?? 0) };
  } catch (e) {
    console.error('inbox: could not count', e);
    return null;
  }
}
