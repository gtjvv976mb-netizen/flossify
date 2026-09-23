// POST /api/bookings — a patient books without an account.
//
// Body: { clinic, service, dentist?, at, who, name, patientName?, phone, hmo?, notes?, consent }
// The slot is re-checked against the live schedule inside the same transaction
// that inserts, so two people cannot take the same chair. The patient row is
// matched by mobile number or created; a reminder is queued in message_log for
// the SMS sender to pick up. Returns { ref, cancelToken, at, clinic }.
export const prerender = false;

import type { APIRoute } from 'astro';
import { randomBytes } from 'node:crypto';
import { withClinic } from '../../../lib/db';
import { loadListing, openSlots, slotIso } from '../../../lib/directory-db';

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
const digits = (s: string) => s.replace(/\D/g, '');
const PHONE = /^(\+?63|0)9\d{9}$/;
const ref = (slug: string) => `${slug.slice(0, 2).toUpperCase()}-${randomBytes(3).toString('base64url').replace(/[-_]/g, 'X').slice(0, 4).toUpperCase()}`;

export const POST: APIRoute = async ({ request }) => {
  let b: any;
  try { b = await request.json(); } catch { return json({ error: 'Send JSON.' }, 400); }

  const l = await loadListing(String(b.clinic ?? ''));
  if (!l) return json({ error: 'Unknown clinic.' }, 404);
  const name = String(b.name ?? '').trim(), phone = String(b.phone ?? '').trim();
  if (!name) return json({ error: 'We need a name.' }, 400);
  if (!PHONE.test(digits(phone).replace(/^63/, '+63'))) return json({ error: 'A Philippine mobile number, like 0917 000 0000.' }, 400);
  if (b.consent !== true) return json({ error: 'Tick the consent box.' }, 400);
  const service = l.fees.find((f) => f.id === b.service) ?? l.fees.find((f) => f.id === 'consultation') ?? l.fees[0];
  const dentist = b.dentist ? l.dentistProfiles.find((d) => d.slug === b.dentist) : null;
  if (b.dentist && !dentist) return json({ error: 'That dentist is not at this clinic.' }, 400);
  const forOther = b.who === 'other';
  const patientName = forOther ? String(b.patientName ?? '').trim() : name;
  if (!patientName) return json({ error: 'Whose visit is it?' }, 400);

  // When. Live clinics must pick a real open slot; request clinics state a preference.
  let startsAt: Date, endsAt: Date, source: 'web' | 'request';
  if (l.workspace) {
    const at = String(b.at ?? '');
    const open = await openSlots(l, { dentist: dentist?.slug ?? null, minutes: service.minutes, days: 28 });
    const hit = open.find((s) => slotIso(s) === at);
    if (!hit) return json({ error: 'That slot has just gone. Pick another.' }, 409);
    startsAt = new Date(at); endsAt = new Date(startsAt.getTime() + service.minutes * 60_000); source = 'web';
  } else {
    const day = String(b.reqDate ?? ''), part = String(b.reqTime ?? 'Morning');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return json({ error: 'Pick a day.' }, 400);
    const hour = part === 'Afternoon' ? 14 : part === 'Midday' ? 12 : 9;
    startsAt = new Date(`${day}T${String(hour).padStart(2, '0')}:00:00+08:00`); endsAt = new Date(startsAt.getTime() + service.minutes * 60_000); source = 'request';
  }

  const publicRef = ref(l.slug), cancelToken = randomBytes(16).toString('base64url');
  const [first, ...rest] = patientName.split(/\s+/);
  const last = rest.join(' ') || '—';
  const phoneKey = digits(phone).slice(-10);

  const result = await withClinic(l.id, async (tx) => {
    // A returning patient is their mobile number — when the visit is for the person booking.
    // Booking for someone else never matches on the booker's phone.
    const { rows: found } = forOther ? { rows: [] as any[] } : await tx.query(
      `select id, chart_no, first_name from patient where archived_at is null and right(regexp_replace(coalesce(phone, ''), '\\D', '', 'g'), 10) = $1 order by created_at limit 1`, [phoneKey]);
    let patientId: string, chartNo: string, returning = false;
    if (found[0]) { patientId = found[0].id; chartNo = found[0].chart_no; returning = true; }
    else {
      const { rows } = await tx.query(
        `insert into patient (clinic_id, chart_no, first_name, last_name, phone) values ($1, 'W-' || lpad((select count(*) + 1 from patient)::text, 4, '0'), $2, $3, $4) returning id, chart_no`,
        [l.id, first, last, forOther ? null : phone]);
      patientId = rows[0].id; chartNo = rows[0].chart_no;
    }
    const { rows: dent } = dentist ? await tx.query('select id from staff where slug = $1', [dentist.slug]) : { rows: [] as any[] };
    const { rows: cat } = await tx.query('select id from procedure_catalog where code = $1', [service.id]);
    const { rows: appt } = await tx.query(
      `insert into appointment (clinic_id, patient_id, dentist_id, starts_at, ends_at, reason, status, source, public_ref, cancel_token, booked_by_name, booked_by_phone, catalog_id, hmo_id, notes)
       values ($1,$2,$3,$4,$5,$6,'booked',$7,$8,$9,$10,$11,$12,$13,$14) returning id`,
      [l.id, patientId, dent[0]?.id ?? null, startsAt, endsAt, service.name, source, publicRef, cancelToken, name, phone, cat[0]?.id ?? null, b.hmo || null, String(b.notes ?? '').slice(0, 500) || null]);
    // The confirmation text, queued. No link in it: telcos block them.
    const when = startsAt.toLocaleString('en-PH', { timeZone: 'Asia/Manila', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
    const body = source === 'web'
      ? `${l.name}: ${service.name} booked for ${when}. Ref ${publicRef}. We'll text the day before; reply Y to confirm or call ${l.phone} to change.`
      : `${l.name}: we received your request for ${service.name} on ${when}. Ref ${publicRef}. We'll text to confirm the time.`;
    await tx.query(`insert into message_log (clinic_id, patient_id, channel, to_address, body, status) values ($1,$2,'sms',$3,$4,'queued')`, [l.id, patientId, phone, body]);
    await tx.query(`insert into audit_log (clinic_id, action, entity, entity_id) values ($1, 'booking.create', 'appointment', $2)`, [l.id, appt[0].id]);
    return { id: appt[0].id as string, chartNo, returning };
  });

  return json({ ref: publicRef, cancelToken, at: startsAt.toISOString(), source, clinic: l.slug, chartNo: result.chartNo, returning: result.returning }, 201);
};
