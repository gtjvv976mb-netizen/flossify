// The top bar's inbox: what is waiting, as counts. Server only (the Clinic
// layout calls it on every workspace page). The inbox draws a row only for a
// count above 0, and "Nothing waiting" when every count is 0 (plan 1.13); its
// foot links to Calls · Texts · Tasks for everyone.
//
//   failed   — texts to patients that failed in the last 7 days and were not
//              sent again (Texts → Failed shows the same rows). Sign-in
//              codes (reset, invite: a patient's My visits code is a reset
//              too) are never counted: a code expires, so it is never sent
//              again; a new one comes from the sign-in page or Clinic
//              settings → People. Everyone at the branch.
//   replies  — texts patients sent in since this browser last opened Texts
//              (the fl_replies_seen cookie, per branch; at most 7 days back).
//              Everyone. It follows the data: a reply that arrives always shows.
//   requests — web requests the desk has not given a time yet (source =
//              'request' and moved_at is null, the rule in CLAUDE.md), not
//              cancelled, for yesterday or later — the same window as the
//              Dashboard's web list. Everyone.
//   closed   — visits in the next 14 days that sit in time the clinic is not open for booking (lunch, a
//              closed day, a dentist away or not in, a chair out of use, outside the hours) and that nobody
//              has kept there (appointment.blocked_ok_at null): Calls → In closed time's rule
//              (src/lib/blocks.ts, VISIT_AHEAD_SQL and IN_SCOPE_SQL against clinic_unavailable(), 040),
//              over two weeks. Only for someone who may change the schedule (schedule.edit); null otherwise.
//   forms    — Forms to add (plan 1.12, src/lib/forms-to-add.ts): desk poster forms not added or
//              dismissed (patient_form status 'new', 028) and step-by-step forms sent and not added
//              (intake status 'sent', 039). Only a new patient's can wait: a patient on file's go on
//              their record at Send, and a new patient's wait when Send could not add them — someone on
//              file looks like them, the forms were started from a visit, or the person who handed them
//              over may no longer add patients (addAtSend). Only for someone who can add patients here
//              (staff_can records.edit, the SQL twin of canEditRecords, the list's own rule); null for
//              anyone else, and then the inbox leaves the row out. The sidebar's Patients tab shows the
//              same number.
//   tasks    — your own tasks (assignee) not done or taken back, due today or overdue on the Manila
//              calendar (the Tasks page's dueWords rule). Tasks hold no patient details.
//
// One statement in one transaction under withClinic(), so row-level security
// keeps every count to this branch. It never breaks the page: if it cannot be
// read, the inbox shows no number and says so.
import { withClinic } from '../../lib/db';
import { IN_SCOPE_SQL, VISIT_AHEAD_SQL } from '../../lib/blocks';

export interface Inbox { failed: number; replies: number; requests: number; forms: number | null; closed: number | null; tasks: number; total: number }

/** The Texts page sets this when it shows the replies; path-scoped to the branch. */
export const SEEN_COOKIE = 'fl_replies_seen';
export const WINDOW_DAYS = 7;

export function seenAt(raw: string | undefined): Date {
  const floor = Date.now() - WINDOW_DAYS * 86_400_000;
  const n = Number(raw);
  return new Date(Number.isFinite(n) && n > floor && n <= Date.now() + 60_000 ? n : floor);
}

/** staffId: who is looking — the forms and closed-time counts (null when not given or not allowed) and their own tasks (0 without). */
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
              then ((select count(*) from patient_form where status = 'new')
                    + (select count(*) from intake where status = 'sent'))::int end as forms,
         (select count(*) from clinic_task
           where assignee_id = $3::uuid and done_at is null and cancelled_at is null
             and due_on <= (now() at time zone 'Asia/Manila')::date)::int as tasks,
         case when staff_can($3::uuid, $4::uuid, 'schedule.edit')
              then (with u as materialized (select * from clinic_unavailable($4::uuid, now(), now() + interval '14 days'))
                    select count(*) from appointment a
                     where a.clinic_id = $4::uuid and a.blocked_ok_at is null and ${VISIT_AHEAD_SQL}
                       and a.starts_at < now() + interval '14 days'
                       and exists (select 1 from u where ${IN_SCOPE_SQL}))::int end as closed`,
      [seen, WINDOW_DAYS, staffId ?? null, clinicId])).rows[0]);
    const forms: number | null = r.forms ?? null;
    const closed: number | null = r.closed ?? null;
    return {
      failed: r.failed, replies: r.replies, requests: r.requests, forms, closed, tasks: r.tasks,
      total: r.failed + r.replies + r.requests + (forms ?? 0) + (closed ?? 0) + r.tasks,
    };
  } catch (e) {
    console.error('inbox: could not count', e);
    return null;
  }
}
