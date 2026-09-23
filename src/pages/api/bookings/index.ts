// POST /api/bookings — a patient books without an account.
//
// Body: { clinic, service, dentist?, at, who, name, patientName?, phone, hmo?, notes?, consent }
// The slot is re-checked against the live schedule inside the same transaction
// that inserts, under the same advisory lock the schedule takes, so neither two
// patients nor a patient and the front desk can take one chair. The patient row is
// matched by mobile number or created; a reminder is queued in message_log for
// the SMS sender to pick up. Returns { ref, cancelToken, at, clinic }.
//
// Rate limited: twenty bookings an hour from one address, counted before anything
// is written; five a day from one mobile number at one clinic, counted inside the
// transaction on bookings that exist. A person never meets either; a script does,
// and is told to call the clinic.
export const prerender = false;

import type { APIRoute } from 'astro';
import { randomBytes } from 'node:crypto';
import { withClinic } from '../../../lib/db';
import { loadListing, openSlots, slotIso } from '../../../lib/directory-db';
import { findClash } from '../../../lib/schedule';
import { hit, clientIp, waitText, LIMITS } from '../../../lib/throttle';

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
const digits = (s: string) => s.replace(/\D/g, '');
const PHONE = /^(\+?63|0)9\d{9}$/;
const ref = (slug: string) => `${slug.slice(0, 2).toUpperCase()}-${randomBytes(3).toString('base64url').replace(/[-_]/g, 'X').slice(0, 4).toUpperCase()}`;

export const POST: APIRoute = async ({ request, clientAddress }) => {
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

  // The limits, counted only once the fields are sound so a bad form never costs a real person a turn.
  const ip = clientIp({ request, clientAddress });
  const byIp = await hit('book:ip:' + ip, ...LIMITS.booking.ip);
  if (!byIp.allowed) return json({ error: 'Too many bookings from this connection. ' + waitText(byIp.retryAfter) }, 429);

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
    // One booker at a time per clinic, the same gate the schedule takes: the check below
    // and the insert have to be one step, or two people who looked at the same free slot
    // both get it. Released when the transaction ends.
    await tx.query('select pg_advisory_xact_lock(hashtext($1))', [l.id]);

    // The slot, re-read now that nobody else can be inserting. openSlots ran before the
    // transaction and only narrowed the offer; this is what actually holds the chair.
    if (l.workspace) {
      const { rows: dentRow } = dentist ? await tx.query('select id from staff where slug = $1', [dentist.slug]) : { rows: [] as any[] };
      if (dentist) {
        const clash = await findClash(tx, l.id, { startsAt, endsAt, chair: null, dentistId: dentRow[0]?.id ?? null });
        if (clash) return { gone: true as const };
      } else {
        // No dentist asked for: the clinic can take as many at once as it has chairs.
        const { rows: busy } = await tx.query<{ n: number }>(
          `select count(*)::int as n from appointment a
            where a.status not in ('cancelled', 'no_show', 'completed')
              and a.starts_at < $2 and a.ends_at > $1`, [startsAt, endsAt]);
        if (busy[0].n >= l.chairs) return { gone: true as const };
      }
    }

    // Five a day from one number at this clinic, counted on bookings that exist — a slot
    // that was already gone costs the person nothing.
    const { rows: recent } = await tx.query(
      `select count(*)::int as n from appointment
        where source in ('web', 'request') and status <> 'cancelled' and created_at > now() - interval '1 day'
          and right(regexp_replace(coalesce(booked_by_phone, ''), '\\D', '', 'g'), 10) = $1`, [phoneKey]);
    if (recent[0].n >= LIMITS.booking.phone[0]) return { tooMany: true as const };
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
    // The box the booker ticked, recorded against the notice in force: which words, when, from where,
    // and for which visit. The booker's name, not the patient's — for someone else's visit they differ.
    await tx.query(
      `insert into patient_consent (clinic_id, patient_id, version_id, channel, given_by_name, ip, appointment_id)
       select $1, $2, v.id, 'web', $3, $4::inet, $5 from current_consent_version() v where v.id is not null`,
      [l.id, patientId, name, ip, appt[0].id]);
    // The confirmation text, queued. No link in it: telcos block them.
    const when = startsAt.toLocaleString('en-PH', { timeZone: 'Asia/Manila', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
    const body = source === 'web'
      ? `${l.name}: ${service.name} booked for ${when}. Ref ${publicRef}. We'll text the day before; reply Y to confirm or call ${l.phone} to change.`
      : `${l.name}: we received your request for ${service.name} on ${when}. Ref ${publicRef}. We'll text to confirm the time.`;
    await tx.query(`insert into message_log (clinic_id, patient_id, appointment_id, channel, to_address, body, status, kind) values ($1,$2,$5,'sms',$3,$4,'queued','confirmation')`, [l.id, patientId, phone, body, appt[0].id]);
    await tx.query(`insert into audit_log (clinic_id, action, entity, entity_id) values ($1, 'booking.create', 'appointment', $2)`, [l.id, appt[0].id]);
    return { id: appt[0].id as string, chartNo, returning };
  });

  if ('gone' in result) return json({ error: 'That slot has just gone. Pick another.' }, 409);
  if ('tooMany' in result) return json({ error: 'That number has booked five times today. Call the clinic instead — they will be glad to help.' }, 429);
  return json({ ref: publicRef, cancelToken, at: startsAt.toISOString(), source, clinic: l.slug, chartNo: result.chartNo, returning: result.returning }, 201);
};
