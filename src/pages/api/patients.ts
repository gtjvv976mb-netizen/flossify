// GET /api/patients?clinic=<slug>&q=<text> — who is this? The schedule's
// patient picker types here and gets up to eight matches.
//
// Returns { patients: [{ id, name, chartNo, phone, lastVisit }] }. A match is
// on the first name, the last name, the two together, the chart number, or
// the digits of the phone when the query has three or more of them. Fewer
// than two characters is an empty list, not a search. The session must be
// able to open the clinic (canOpen), and the query runs inside withClinic()
// so row-level security keeps it to this clinic's patients. Rate limited with
// the schedule's own key: a person typing never meets it; a script does.
export const prerender = false;

import type { APIRoute } from 'astro';
import { readSession, canOpen } from '../../lib/auth';
import { withClinic } from '../../lib/db';
import { hit, waitText, LIMITS } from '../../lib/throttle';

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
const LIMIT = 8;
/** Backslash, percent and underscore mean something to LIKE; the person typed them as letters. */
const like = (s: string) => '%' + s.replace(/[\\%_]/g, (c) => '\\' + c) + '%';

type Row = { id: string; name: string; chart_no: string; phone: string | null; last_visit: Date | null };

export const GET: APIRoute = async ({ url, cookies }) => {
  const session = readSession(cookies);
  if (!session) return json({ error: 'Sign in to look up patients.' }, 401);
  const clinic = await canOpen(session, url.searchParams.get('clinic') ?? '');
  if (!clinic) return json({ error: 'This account cannot open that clinic.' }, 403);

  const rate = await hit('schedule:s:' + session.staffId, ...LIMITS.schedule.staff);
  if (!rate.allowed) return json({ error: 'Too many lookups at once. ' + waitText(rate.retryAfter) }, 429);

  const q = (url.searchParams.get('q') ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
  if (q.length < 2) return json({ patients: [] });
  const digits = q.replace(/\D/g, '');
  const byPhone = digits.length >= 3;

  const rows = await withClinic(clinic.id, async (tx) => (await tx.query<Row>(
    `select p.id, concat_ws(' ', p.first_name, nullif(p.last_name, '—')) as name, p.chart_no, p.phone,
            (select max(a.starts_at) from appointment a where a.patient_id = p.id and a.status = 'completed') as last_visit
       from patient p
      where p.archived_at is null
        and (p.first_name ilike $1 or p.last_name ilike $1 or (p.first_name || ' ' || p.last_name) ilike $1 or p.chart_no ilike $1
             or ($2 and regexp_replace(coalesce(p.phone, ''), '\\D', '', 'g') like $3))
      order by p.chart_no ilike $1 desc, p.last_name ilike $4 desc, p.last_name, p.first_name
      limit ${LIMIT}`,
    [like(q), byPhone, like(digits), q.replace(/[\\%_]/g, (c) => '\\' + c) + '%'])).rows);

  return json({
    patients: rows.map((r) => ({ id: r.id, name: r.name, chartNo: r.chart_no, phone: r.phone ?? null, lastVisit: r.last_visit ? new Date(r.last_visit).toISOString() : null })),
  });
};
