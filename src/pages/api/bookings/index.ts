// POST /api/bookings — a patient books without an account.
//
// Body: { clinic, service, dentist?, at, who, name, patientName?, phone, hmo?, notes?, consent }
// The slot is re-checked against the live schedule inside the same transaction
// that inserts, under the same advisory lock the schedule takes, so neither two
// patients nor a patient and the front desk can take one chair. The patient row is
// matched by mobile number or created; the confirmation text is queued in
// message_log for the SMS sender to pick up. Returns { ref, cancelToken, at,
// clinic, reminder, fallback }: `reminder` is true when the day-before text will
// come, and the confirmation says so only then; `fallback` is, for a request, the
// sentence the text ends on ("No word by Thu 24 Sep? Call …"), so the page can
// say the same.
//
// A request names a day and a part of it. It is refused, in plain words, for a
// day the clinic is closed, a part of the day outside its hours, or a part of
// today less than an hour away, since the text would name a time nobody can keep.
//
// The texts are one-way (Semaphore sends from a sender name; a reply reaches
// nobody), so no text asks for one. They say what happens and whom to call.
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
import { findClash, whenText } from '../../../lib/schedule';
import { manilaNow, fmtHour, willRemind, type Now } from '../../../lib/availability';
import type { Hours } from '../../../data/directory';
import { hit, clientIp, waitText, LIMITS } from '../../../lib/throttle';

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
/**
 * A request's part of the day, as the patient chose it: when that part runs
 * (minutes after midnight), the placeholder hour for the lane, and the word for
 * the text. The placeholder only marks the lane until the desk places the visit.
 */
const PART: Record<string, { from: number; to: number; hour: number; words: string }> = {
  Morning: { from: 0, to: 12 * 60, hour: 9, words: 'morning' },
  Midday: { from: 11 * 60, to: 14 * 60, hour: 12, words: 'midday' },
  Afternoon: { from: 12 * 60, to: 18 * 60, hour: 14, words: 'afternoon' },
};
const DAY_NAME = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
/** As for live slots (slotsFor): nothing today sooner than an hour from now; nobody can get there. */
const LEAD_MIN = 60;
/** The shortest visit the lane holds, so a part of the day has room for one. */
const SLOT_MIN = 30;
const up30 = (m: number) => Math.ceil(m / 30) * 30;
/** A calendar day `n` days after `ymd`, and its weekday (0 = Sunday). Plain date arithmetic, no time zone. */
function addDays(ymd: string, n: number) {
  const [y, m, d] = ymd.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return { ymd: t.toISOString().slice(0, 10), dow: t.getUTCDay() };
}
/** Noon in Manila on that day: a Date for the words below. */
const noon = (ymd: string) => new Date(`${ymd}T12:00:00+08:00`);
/** "Thu 25 Sep": whenText without the time, for a request that has no time yet. */
const dayText = (d: Date) => whenText(d).split(',')[0];
/** "Thu" */
const weekday = (d: Date) => whenText(d).split(' ')[0];
const hasHours = (hours: Hours) => Object.values(hours).some(Boolean);
/**
 * Where a request's placeholder goes on its day, in minutes after midnight, or
 * why the patient must pick again: inside the part of the day, inside the
 * clinic's hours that day, and, for today, an hour or more from now. Otherwise
 * the text would name a day or a part of it the patient cannot come. A clinic
 * with no hours on file is taken as open.
 */
function placeRequest(hours: Hours, day: { ymd: string; dow: number }, part: (typeof PART)[string], now: Now): { mins: number } | { error: string } {
  const h = hours[day.dow];
  if (hasHours(hours) && !h) return { error: `The clinic is closed on ${DAY_NAME[day.dow]}s. Pick another day.` };
  const open = h ? Math.round(h[0] * 60) : 0, close = h ? Math.round(h[1] * 60) : 24 * 60;
  const span = (p: (typeof PART)[string]) => ({ lo: up30(Math.max(p.from, open)), hi: Math.min(p.to, close) - SLOT_MIN });
  const w = span(part);
  if (w.lo > w.hi) return { error: `The clinic is open ${fmtHour(h![0])} to ${fmtHour(h![1])} on ${DAY_NAME[day.dow]}s. Pick another time of day.` };
  const earliest = day.ymd === now.ymd ? up30(now.mins + LEAD_MIN) : 0;
  if (Math.max(w.lo, earliest) > w.hi) {
    const later = Object.values(PART).some((p) => { const x = span(p); return Math.max(x.lo, earliest) <= x.hi; });
    return { error: later ? `Too late for today's ${part.words}. Pick a later time of day, or another day.` : `It is too late to ask for today. Pick another day.` };
  }
  return { mins: Math.min(Math.max(part.hour * 60, w.lo, earliest), w.hi) };
}
/**
 * What a request's text tells the patient to do if the clinic stays quiet. Never
 * an instruction nobody can follow: the confirmation goes out at once, at any
 * hour (the worker holds only reminders and the desk's own texts overnight).
 * - The last day the clinic is open after today and before the visit, with its
 *   date: "No word by Thu 24 Sep? Call …".
 * - No such day, and the clinic open now for half an hour more: "To set it now, call …".
 * - Otherwise when it next opens, later today or on the visit day itself (a
 *   closed day was refused): "To set it sooner, call … on Sat from 9 am."
 * With no hours on file: the day before, when there is one, and no hour.
 */
function requestFallback(hours: Hours, visit: string, call: string, now: Now): string {
  const known = hasHours(hours);
  for (let i = 1; i <= 7; i++) {
    const d = addDays(visit, -i);
    if (d.ymd <= now.ymd) break;
    if (!known || hours[d.dow]) return `No word by ${dayText(noon(d.ymd))}? Call ${call}.`;
  }
  const today = hours[now.day], onVisit = hours[addDays(visit, 0).dow];
  if (today && now.mins >= today[0] * 60 && now.mins < today[1] * 60 - 30) return `To set it now, call ${call}.`;
  if (today && now.mins < today[0] * 60) return `To set it sooner, call ${call} today from ${fmtHour(today[0])}.`;
  if (onVisit && visit > now.ymd) return `To set it sooner, call ${call} on ${weekday(noon(visit))} from ${fmtHour(onVisit[0])}.`;
  return `To set it sooner, call ${call}.`;
}
/** Length in GSM-7 characters, the alphabet texts go out in: the extension characters count twice. */
const smsLen = (s: string) => [...s].length + (s.match(/[\^{}\\[\]~|€]/g)?.length ?? 0);
/** The first body that fits one text (160 characters); failing that, the last, shortest one. */
const fit = (...bodies: string[]) => bodies.find((b) => smsLen(b) <= 160) ?? bodies[bodies.length - 1];
/** "Consultation" → "consultation", mid-sentence; "TMJ splint" stays as it is. */
const lower = (s: string) => /^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s;
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

  // A request's day and part of the day are form fields too, so they are checked here:
  // a real calendar day (2026-02-31 would roll into March), not one gone, the clinic
  // open, and time left in the part asked for (placeRequest).
  const now = manilaNow();
  let part = PART.Morning, reqDay = '', reqMins = 0;
  if (!l.workspace) {
    reqDay = String(b.reqDate ?? '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(reqDay) || addDays(reqDay, 0).ymd !== reqDay) return json({ error: 'Pick a day.' }, 400);
    if (reqDay < now.ymd) return json({ error: 'That day has passed. Pick today or a later day.' }, 400);
    const want = String(b.reqTime ?? '');
    part = Object.hasOwn(PART, want) ? PART[want] : PART.Morning;
    const placed = placeRequest(l.hours, addDays(reqDay, 0), part, now);
    if ('error' in placed) return json({ error: placed.error }, 400);
    reqMins = placed.mins;
  }

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
    // The time is a placeholder for the lane; the text names the part of the day, not a time nobody set.
    const hh = String(Math.floor(reqMins / 60)).padStart(2, '0'), mm = String(reqMins % 60).padStart(2, '0');
    startsAt = new Date(`${reqDay}T${hh}:${mm}:00+08:00`); endsAt = new Date(startsAt.getTime() + service.minutes * 60_000); source = 'request';
  }

  const publicRef = ref(l.slug), cancelToken = randomBytes(16).toString('base64url');
  // A request is not reminded until the desk places it (019), so its text promises no reminder.
  const reminder = source === 'web' && willRemind(startsAt);
  const call = l.phone?.trim() || 'the clinic';
  const fallback = source === 'request' ? requestFallback(l.hours, reqDay, call, now) : null;
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
    // The confirmation text, queued. No link in it: telcos block them. No reply asked
    // for: none would arrive. A reminder is promised only when one will come (willRemind);
    // a request promises none, since it is not reminded until the desk places it (019),
    // and ends on what to do if the clinic stays quiet (requestFallback).
    // "We" is the clinic: its name opens the text. One text, 160 characters: when the
    // service's name would make it two, the text says "your visit" instead. A clinic
    // name long enough to overflow even then still goes, as two.
    const booked = (what: string) => `${l.name}: ${what} booked for ${whenText(startsAt)}. Ref ${publicRef}.${reminder ? ` We'll remind you the day before.` : ''} To change it, call ${call}.`;
    const asked = (what: string) => `${l.name}: we'll confirm a time for your ${what}, ${dayText(startsAt)} ${part.words}. Ref ${publicRef}. ${fallback}`;
    const body = source === 'web' ? fit(booked(service.name), booked('your visit')) : fit(asked(lower(service.name)), asked('visit'));
    await tx.query(`insert into message_log (clinic_id, patient_id, appointment_id, channel, to_address, body, status, kind) values ($1,$2,$5,'sms',$3,$4,'queued','confirmation')`, [l.id, patientId, phone, body, appt[0].id]);
    await tx.query(`insert into audit_log (clinic_id, action, entity, entity_id) values ($1, 'booking.create', 'appointment', $2)`, [l.id, appt[0].id]);
    return { id: appt[0].id as string, chartNo, returning };
  });

  if ('gone' in result) return json({ error: 'That slot has just gone. Pick another.' }, 409);
  if ('tooMany' in result) return json({ error: 'That number has booked five times today. Call the clinic instead — they will be glad to help.' }, 429);
  return json({ ref: publicRef, cancelToken, at: startsAt.toISOString(), source, clinic: l.slug, chartNo: result.chartNo, returning: result.returning, reminder, fallback }, 201);
};
