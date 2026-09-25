// GET /api/search?q=<text>[&clinic=<slug>] — the top bar's search, as you type.
//
// Returns { q, patients: [...], bookings: [...] } for ONE clinic: the branch
// the page is open on (the shell sends clinic=<slug>), or without it the
// branch this person signed in to:
//   patients — name, chart no., mobile; matched on first name, last name, the
//              two together (either order), chart no., or the mobile's digits
//              (three or more; "0917…" and "+63 917…" are the same number).
//   bookings — booking ref, patient, time, service, status: the coming
//              visits (from today, Manila) of the patients above, and a ref
//              that matches (any date, newest first). Cancelled visits are
//              left out.
// Fewer than two characters is an empty answer, not a search.
//
// A booking ref is two letters, a dash and four letters or digits
// ("SE-7K2Q"), and every ref at a clinic starts with the same two letters, so
// a name ("Se…") must never match them all. A ref is looked up only when what
// was typed looks like one: a digit or a dash in it, or the four characters of
// its own part ("7K2Q", "SE-7K", "se7k2q"); the match is from the start.
//
// The session must be able to open the clinic (canOpen: signed in, not
// disabled, current token version, access to this branch), and every query
// runs inside withClinic(), so row-level security keeps it to this clinic's
// rows: a slug the person may not open is a 403, never another clinic's data.
// Rate limited per person with hit(): a person typing never meets the limit;
// a script does. A read, so no CSRF token; the answer is no-store and JSON
// (a cross-site page cannot read it: no CORS header is ever sent).
export const prerender = false;

import type { APIRoute } from 'astro';
import { readSession, canOpen } from '../../lib/auth';
import { withClinic, pool } from '../../lib/db';
import { hit, waitText } from '../../lib/throttle';
import { prettyPhone } from '../../lib/messages';
import { shellLinks } from '../../components/ws/routes';

/** [limit, window seconds]: about four lookups a second, sustained for a minute. */
const RATE: readonly [number, number] = [240, 60];
const MAX_PATIENTS = 6;
const MAX_BOOKINGS = 5;
const Q_MAX = 80;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { 'cache-control': 'no-store', vary: 'cookie', ...extra } });
/** Backslash, percent and underscore mean something to LIKE; the person typed them as letters. */
const esc = (s: string) => s.replace(/[\\%_]/g, (c) => '\\' + c);

const TZ = 'Asia/Manila';
const parts = (d: Date, opts: Intl.DateTimeFormatOptions) =>
  Object.fromEntries(new Intl.DateTimeFormat('en-US', { ...opts, timeZone: TZ }).formatToParts(d).map((p) => [p.type, p.value]));
/** "Thu 24 Sep, 9:00 am" — Manila time, composed from parts so the comma and case are ours. */
const when = (d: Date) => {
  const p = parts(d, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  return `${p.weekday} ${p.day} ${p.month}, ${p.hour}:${p.minute} ${String(p.dayPeriod).toLowerCase()}`;
};
const ymd = (d: Date) => { const p = parts(d, { year: 'numeric', month: '2-digit', day: '2-digit' }); return `${p.year}-${p.month}-${p.day}`; };

const STATUS: Record<string, string> = {
  booked: 'Booked', confirmed: 'Confirmed', arrived: 'Arrived', in_lobby: 'In lobby', in_chair: 'In chair',
  completed: 'Completed', no_show: 'No show', cancelled: 'Cancelled',
};

export const GET: APIRoute = async ({ url, cookies }) => {
  const session = readSession(cookies);
  if (!session) return json({ error: 'Sign in to search.' }, 401);
  // Without clinic=, the branch this person signed in to. The operator's session has none.
  const slug = url.searchParams.get('clinic')
    || (UUID.test(session.clinicId) && UUID.test(session.staffId)
      ? (await pool.query('select slug from staff_branches($1) where id = $2', [session.staffId, session.clinicId])).rows[0]?.slug
      : '')
    || '';
  const clinic = slug ? await canOpen(session, slug) : undefined;
  if (!clinic) return json({ error: 'This account cannot open that clinic.' }, 403);

  const q = (url.searchParams.get('q') ?? '').replace(/\s+/g, ' ').trim().slice(0, Q_MAX);
  if (q.length < 2) return json({ q, patients: [], bookings: [] });

  const rate = await hit('search:s:' + session.staffId, ...RATE);
  if (!rate.allowed) return json({ error: 'Too many searches at once. ' + waitText(rate.retryAfter) }, 429, { 'retry-after': String(rate.retryAfter) });

  // The digits of a mobile, both ways it is written: 0917 555 0142 and +63 917 555 0142.
  const digits = q.replace(/\D/g, '');
  const byPhone = digits.length >= 3 && digits.length >= q.replace(/[\s+()-]/g, '').length - 1;
  const local = digits.startsWith('0') ? '63' + digits.slice(1) : digits;
  const like = '%' + esc(q) + '%';
  const starts = esc(q) + '%';
  // The ref as typed, without its dash or spaces: "se-7k2q" → "SE7K2Q".
  const ref = q.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const refDigit = /\d/.test(ref) || q.includes('-');
  const refWhole = ref.length >= 3 && ref.length <= 6 && (refDigit || ref.length === 6); // "SE-7K", "SE7K2Q"
  const refOwn = ref.length >= 2 && ref.length <= 4 && (refDigit || ref.length === 4); // "7K", "7K2Q"

  const links = shellLinks(clinic.slug);
  const base = `/c/${clinic.slug}`;
  const out = await withClinic(clinic.id, async (tx) => {
    const patients = (await tx.query(
      `select p.id, p.first_name, p.last_name, p.chart_no, p.phone
         from patient p
        where p.archived_at is null
          and (p.first_name ilike $1 or p.last_name ilike $1
               or (p.first_name || ' ' || p.last_name) ilike $1 or (p.last_name || ' ' || p.first_name) ilike $1
               or (p.last_name || ', ' || p.first_name) ilike $1 or p.chart_no ilike $1
               or ($2 and (regexp_replace(coalesce(p.phone, ''), '\\D', '', 'g') like $3
                           or regexp_replace(coalesce(p.phone, ''), '\\D', '', 'g') like $4)))
        order by p.chart_no ilike $5 desc, p.last_name ilike $5 desc, p.first_name ilike $5 desc, p.last_name, p.first_name
        limit ${MAX_PATIENTS}`,
      [like, byPhone, '%' + digits + '%', '%' + local + '%', starts])).rows as { id: string; first_name: string; last_name: string; chart_no: string; phone: string | null }[];

    type Row = { id: string; public_ref: string | null; starts_at: Date; status: string; reason: string | null; patient_id: string; first_name: string; last_name: string; chart_no: string };
    const cols = `a.id, a.public_ref, a.starts_at, a.status, a.reason, p.id as patient_id, p.first_name, p.last_name, p.chart_no`;
    const ids = patients.map((p) => p.id);
    // The matched patients' coming visits, soonest first.
    const coming = ids.length ? (await tx.query(
      `select ${cols} from appointment a join patient p on p.id = a.patient_id
        where a.status <> 'cancelled' and a.patient_id = any($1::uuid[])
          and a.starts_at >= ((now() at time zone '${TZ}')::date::timestamp at time zone '${TZ}')
        order by a.starts_at limit ${MAX_BOOKINGS}`, [ids])).rows as Row[] : [];
    // A ref, when the text looks like one: newest first.
    const byRef = refWhole || refOwn ? (await tx.query(
      `select ${cols} from appointment a join patient p on p.id = a.patient_id
        where a.status <> 'cancelled' and a.public_ref is not null
          and (($1 and regexp_replace(a.public_ref, '[^A-Za-z0-9]', '', 'g') ilike $3)
               or ($2 and split_part(a.public_ref, '-', 2) ilike $3))
        order by a.starts_at desc limit ${MAX_BOOKINGS}`, [refWhole, refOwn, ref + '%'])).rows as Row[] : [];
    // Refs first (the person typed one), but never crowding out every coming visit.
    const keep = byRef.slice(0, coming.length ? MAX_BOOKINGS - Math.min(2, coming.length) : MAX_BOOKINGS);
    const seen = new Set(keep.map((r) => r.id));
    const bookings = [...keep, ...coming.filter((r) => !seen.has(r.id))].slice(0, MAX_BOOKINGS);
    return { patients, bookings };
  });

  return json({
    q,
    patients: out.patients.map((p) => ({
      id: p.id,
      name: `${p.first_name} ${p.last_name}`.trim(),
      chartNo: p.chart_no,
      mobile: p.phone ? prettyPhone(p.phone) : null,
      href: `${base}/patients/${p.id}/`,
    })),
    bookings: out.bookings.map((b) => ({
      id: b.id,
      ref: b.public_ref,
      patient: `${b.first_name} ${b.last_name}`.trim(),
      chartNo: b.chart_no,
      when: when(new Date(b.starts_at)),
      service: b.reason,
      status: STATUS[b.status] ?? b.status,
      // That day, that booking (routes.ts: the Dashboard's side panel once it lands, the Schedule until then).
      href: links.booking(ymd(new Date(b.starts_at)), b.id),
    })),
  });
};
