// Seed the development database from the same invented data the static pages
// use, so the site reads the same clinics from Postgres that it used to read
// from TypeScript. Runs as the superuser (it is setting up), not as the app.
//
//   DB=flossify_dev node --experimental-strip-types scripts/db/seed.ts
//
// Dev logins (owner of each group): <first dentist's email> / "flossify"

import pg from 'pg';
import { scryptSync, randomBytes } from 'node:crypto';
import { clinics as demoClinics, patients, appointments, claims } from '../../src/data/demo.ts';
import { listings, dentists, services } from '../../src/data/directory.ts';

const db = new pg.Client({ database: process.env.DB ?? 'flossify_dev' });
await db.connect();

// Same scheme as src/lib/auth.ts: scrypt, "salt:hash", both hex.
const hash = (pw: string) => { const salt = randomBytes(16); return `${salt.toString('hex')}:${scryptSync(pw, salt, 64).toString('hex')}`; };
const email = (name: string) => name.replace(/^Dr\.\s*/, '').toLowerCase().replace(/[^a-z]+/g, '.') .replace(/^\.|\.$/g, '') + '@example.com';

await db.query('begin');

// One group per listing, except the two demo clinics that share Highland Dental Group.
const groupIds = new Map<string, string>();
const groupOf = (slug: string) => demoClinics.find((c) => c.slug === slug)?.group ?? listings.find((l) => l.slug === slug)!.name;
for (const l of listings) {
  const g = groupOf(l.slug);
  if (!groupIds.has(g)) {
    const { rows } = await db.query('insert into clinic_group (name, slug) values ($1, $2) returning id', [g, g.toLowerCase().replace(/[^a-z0-9]+/g, '-')]);
    groupIds.set(g, rows[0].id);
  }
}

const clinicIds = new Map<string, string>();
for (const l of listings) {
  const demo = demoClinics.find((c) => c.slug === l.slug);
  const { rows } = await db.query(
    `insert into clinic (group_id, name, slug, address_line, city, province, phone, tin, notation, about, area, booking_mode, walk_ins, chairs, philhealth_dental, founded, photo_keys, listed)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,true) returning id`,
    [groupIds.get(groupOf(l.slug)), l.name, l.slug, l.address, l.area, demo?.province ?? (l.area === 'Marikina City' ? 'Metro Manila' : 'Benguet'), l.phone,
     demo?.tin ?? null, demo?.notation ?? 'fdi', l.about, l.area, l.workspace ? 'live' : 'request', l.walkIns, l.chairs, l.philhealth, l.since, l.photos]);
  const id = rows[0].id; clinicIds.set(l.slug, id);
  for (const [dow, h] of Object.entries(l.hours)) if (h) await db.query('insert into clinic_hours values ($1,$2,$3,$4)', [id, +dow, h[0] * 60, h[1] * 60]);
  for (const hmo of l.hmos) await db.query('insert into clinic_hmo values ($1,$2)', [id, hmo]);
  // The fee guide: catalogue price unless the clinic overrides or does not offer it.
  for (const s of services) {
    const o = l.prices[s.id];
    if (o === null) continue;
    await db.query(
      `insert into procedure_catalog (clinic_id, code, name, default_price, tooth_scoped, local_name, category, price_max, price_from, unit, minutes)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [id, s.id, s.name, o?.min ?? s.min ?? 0, !!s.unit?.includes('tooth'), s.local ?? null, s.cat, o ? o.max ?? null : s.max ?? null, o ? false : !!s.from, s.unit ?? null, s.minutes]);
  }
}

// Dentists are staff with a public profile; the first dentist in each group owns it and can log in.
const staffIds = new Map<string, string>();
const owners = new Set<string>();
for (const d of dentists) {
  const home = d.clinics[0].slug; const g = groupOf(home); const gid = groupIds.get(g)!;
  const isOwner = !owners.has(gid); if (isOwner) owners.add(gid);
  const { rows } = await db.query(
    `insert into staff (group_id, full_name, email, prc_licence, role, password_hash, slug, prc_checked_on, pda_member, specialty, practices, practising_since, about, home_clinic_id, phone, password_set_at, prc_status)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,now(), case when $8::date is not null then 'checked' else 'pending' end) returning id`,
    [gid, d.name, email(d.name), d.prc, isOwner ? 'owner' : 'dentist', hash('flossify'), d.slug, d.prcCheckedOn, d.pda, d.specialty, d.practices, d.since, d.about, clinicIds.get(home),
     // A 555 mobile per dentist, so the reset-by-text flow can be tried against the dev database.
     `0917 555 2${String(staffIds.size + 1).padStart(3, '0')}`]);
  staffIds.set(d.slug, rows[0].id);
  for (const c of d.clinics) {
    const cid = clinicIds.get(c.slug)!;
    await db.query('insert into staff_access (staff_id, clinic_id, can_view_finance, can_edit_records, can_manage_staff) values ($1,$2,$3,true,$3) on conflict do nothing', [rows[0].id, cid, isOwner]);
    for (const dow of c.days) await db.query('insert into staff_schedule values ($1,$2,$3)', [rows[0].id, cid, dow]);
  }
}
// A group owner sees every branch in the group.
for (const l of listings) {
  const gid = groupIds.get(groupOf(l.slug))!;
  const { rows } = await db.query(`select id from staff where group_id = $1 and role = 'owner'`, [gid]);
  for (const r of rows) await db.query('insert into staff_access (staff_id, clinic_id, can_view_finance, can_edit_records, can_manage_staff) values ($1,$2,true,true,true) on conflict (staff_id, clinic_id) do update set can_view_finance = true, can_manage_staff = true', [r.id, clinicIds.get(l.slug)]);
}

// Flossify's own operations account: a group with no clinic, one admin, marked platform_admin.
{
  const { rows: [g] } = await db.query(`insert into clinic_group (name, slug) values ('Flossify', 'flossify') returning id`);
  const { rows: [ops] } = await db.query(
    `insert into staff (group_id, full_name, email, phone, role, password_hash, password_set_at) values ($1, 'Flossify Operations', 'ops@flossify.example', '0917 555 0001', 'admin', $2, now()) returning id`,
    [g.id, hash('flossify')]);
  await db.query('insert into platform_admin (staff_id) values ($1)', [ops.id]);
}

// Every group with a clinic starts its 30-day trial at the placeholder price (src/lib/billing.ts).
await db.query(`select billing_ensure(g.id, 1990) from clinic_group g where exists (select 1 from clinic c where c.group_id = g.id)`);

// Patients, their teeth, today's appointments and the HMO claims, from demo.ts.
const patientIds = new Map<string, string>();
for (const p of patients) {
  const cid = clinicIds.get(p.clinic)!;
  const { rows } = await db.query(
    `insert into patient (clinic_id, chart_no, first_name, last_name, birth_date, sex, phone) values ($1,$2,$3,$4,$5,$6,$7) returning id`,
    [cid, p.chartNo, p.firstName, p.lastName, p.birthDate, p.sex, p.phone]);
  patientIds.set(p.id, rows[0].id);
  await db.query(`insert into medical_history (clinic_id, patient_id, allergies, conditions) values ($1,$2,$3,$4)`, [cid, rows[0].id, p.allergies, p.conditions]);
  for (const [fdi, mark] of Object.entries(p.teeth)) {
    if (!mark) continue;
    if (mark.surfaces?.length) for (const s of mark.surfaces) await db.query(`insert into tooth_state (clinic_id, patient_id, fdi, surface, condition) values ($1,$2,$3,$4,$5)`, [cid, rows[0].id, +fdi, s, mark.condition]);
    else await db.query(`insert into tooth_state (clinic_id, patient_id, fdi, condition) values ($1,$2,$3,$4)`, [cid, rows[0].id, +fdi, mark.condition]);
  }
}
// The demo day is today, Manila time: the times are kept, the date is not.
const todayManila = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
for (const a of appointments) {
  const cid = clinicIds.get(a.clinic)!; const dentist = dentists.find((d) => d.clinics.some((c) => c.slug === a.clinic));
  const startsAt = `${todayManila}T${a.startsAt.slice(11)}`;
  await db.query(`insert into appointment (clinic_id, patient_id, dentist_id, starts_at, ends_at, reason, status) values ($1,$2,$3,$4,$4::timestamptz + interval '45 minutes',$5,$6)`,
    [cid, patientIds.get(a.patientId), dentist ? staffIds.get(dentist.slug) : null, startsAt, a.reason, a.status]);
}
for (const c of claims) {
  const cid = clinicIds.get(c.clinic)!;
  const { rows } = await db.query(`insert into hmo_provider (clinic_id, name) values ($1,$2) on conflict do nothing returning id`, [cid, c.provider]);
  const providerId = rows[0]?.id ?? (await db.query('select id from hmo_provider where clinic_id = $1 and name = $2', [cid, c.provider])).rows[0].id;
  await db.query(`insert into hmo_claim (clinic_id, provider_id, patient_id, claimed, approved, status, filed_at) values ($1,$2,$3,$4,$5,$6,$7)`,
    [cid, providerId, patientIds.get(c.patientId), c.claimed, c.approved, c.status, c.filedAt]);
}
// Balances in demo.ts become an open invoice each, so the workspace tiles still add up.
for (const p of patients) {
  if (!p.balance) continue;
  const cid = clinicIds.get(p.clinic)!;
  await db.query(`insert into invoice_series (clinic_id, prefix, next_number) values ($1, 'A', 1) on conflict do nothing`, [cid]);
  const { rows } = await db.query(`update invoice_series set next_number = next_number + 1 where clinic_id = $1 and prefix = 'A' returning next_number - 1 as n`, [cid]);
  await db.query(`insert into invoice (clinic_id, patient_id, series_prefix, number, subtotal, vat_rate, vat_amount, total, status) values ($1,$2,'A',$3,$4,0,0,$4,'issued')`, [cid, patientIds.get(p.id), rows[0].n, p.balance]);
}

await db.query('commit');
const n = async (t: string) => (await db.query(`select count(*)::int as c from ${t}`)).rows[0].c;
console.log(`seeded: ${await n('clinic')} clinics, ${await n('staff')} staff, ${await n('procedure_catalog')} catalogue rows, ${await n('patient')} patients, ${await n('appointment')} appointments, ${await n('hmo_claim')} claims`);
console.log(`dev logins: ${[...owners].length} owners, password "flossify" — e.g. ${email(dentists[0].name)}`);
await db.end();
