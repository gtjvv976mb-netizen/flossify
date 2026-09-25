// GET /api/patients/match?clinic=<slug>&first=&last=&mobile=&birth=&chart=
// — "is this someone we already have?" Add patient asks as the name, mobile,
// birth date and chart no. are typed, so the desk hears it before saving.
// The page's Save asks the server again (src/lib/import.ts, lookAlikes); this
// only says it early.
//
// Returns { matches: [{ id, name, chartNo, mobile, born, href }] } (up to 5):
// the same chart no.; the same first and last name (accents and case aside)
// when the birth dates agree or one is missing; the same mobile with the same
// last name. canOpen() first, the query inside withClinic() (row-level
// security keeps it to this clinic), the schedule's rate limit per person,
// no-store. A GET that changes nothing needs no CSRF token.
export const prerender = false;

import type { APIRoute } from 'astro';
import { readSession, canOpen } from '../../../lib/auth';
import { withClinic } from '../../../lib/db';
import { hit, waitText, LIMITS } from '../../../lib/throttle';
import { normalizePhone, prettyPhone, PH_MOBILE } from '../../../lib/messages';
import { fold, chartKey } from '../../../lib/import';
import { dateText } from '../../../lib/health';

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
const YMD = /^\d{4}-\d{2}-\d{2}$/;

export const GET: APIRoute = async ({ url, cookies }) => {
  const session = readSession(cookies);
  if (!session) return json({ error: 'Sign in to look up patients.' }, 401);
  const clinic = await canOpen(session, url.searchParams.get('clinic') ?? '');
  if (!clinic) return json({ error: 'This account cannot open that clinic.' }, 403);
  const rate = await hit('schedule:s:' + session.staffId, ...LIMITS.schedule.staff);
  if (!rate.allowed) return json({ error: 'Too many lookups at once. ' + waitText(rate.retryAfter) }, 429);

  const p = (k: string) => (url.searchParams.get(k) ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
  const first = fold(p('first')), last = fold(p('last'));
  const mobile = normalizePhone(p('mobile'));
  const birth = YMD.test(p('birth')) ? p('birth') : null;
  const chart = p('chart') ? chartKey(p('chart')) : '';
  if (!last && !PH_MOBILE.test(mobile) && !chart) return json({ matches: [] });

  // Candidates by what can be asked of an index or a cheap scan, then compared the way people mean names.
  const rows = await withClinic(clinic.id, async (tx) => (await tx.query<{ id: string; first_name: string; last_name: string; suffix: string | null; chart_no: string; phone: string | null; birth: string | null }>(
    `select id, first_name, last_name, suffix, chart_no, phone, to_char(birth_date, 'YYYY-MM-DD') as birth
       from patient
      where archived_at is null
        and (($1 <> '' and upper(replace(chart_no, ' ', '')) = $1)
             or ($2 <> '' and btrim(regexp_replace(translate(lower(last_name), 'áàâäãéèêëíìîïóòôöõúùûüñç', 'aaaaaeeeeiiiiooooouuuunc'), '[^a-z0-9]+', ' ', 'g')) = $2)
             or ($3 <> '' and right(regexp_replace(coalesce(phone, ''), '\\D', '', 'g'), 10) = $3))
      order by chart_no
      limit 200`,
    [chart, last, PH_MOBILE.test(mobile) ? mobile.slice(1) : ''])).rows);

  const matches = rows.filter((r) => {
    if (chart && chartKey(r.chart_no) === chart) return true;
    const sameLast = !!last && fold(r.last_name) === last;
    if (sameLast && first && fold(r.first_name) === first && (!birth || !r.birth || birth === r.birth)) return true;
    if (sameLast && PH_MOBILE.test(mobile) && r.phone && normalizePhone(r.phone) === mobile) return true;
    return false;
  }).slice(0, 5);

  return json({
    matches: matches.map((r) => ({
      id: r.id, name: [r.first_name, r.last_name, r.suffix].filter(Boolean).join(' '), chartNo: r.chart_no,
      mobile: r.phone ? prettyPhone(r.phone) : null, born: r.birth ? dateText(r.birth) : null, href: `/c/${clinic.slug}/patients/${r.id}/`,
    })),
  });
};
