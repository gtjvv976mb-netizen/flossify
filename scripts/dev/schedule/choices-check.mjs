// The clinic's three choices (044, Clinic settings → Clinic profile → How the day runs), end to end:
//   1. Settings: the three fields are drawn with today's defaults (None · unticked · At the chair); saved, they are
//      stored; a form drawn without them (an older tab) keeps what is saved; a forged gap is refused.
//   2. Time between visits: at a one-chair clinic, a visit planted three open days ahead; with no gap the slot at its
//      end is offered online, with 15 minutes it is not (and 15 minutes later is); the booking API re-checks under its
//      lock and refuses the padded slot; the Dashboard's boot carries the gap.
//   3. Hold reminders: a visit tomorrow with a queued reminder; a closed block over it withdraws the reminder and the
//      block's answer says "Reminder held"; the reminder pass writes none while nobody kept it; Calls says so (lede and
//      line); Keep it, and the next pass writes it. With the switch off the pass reminds a visit in closed time as before.
//   4. Ask at the door: a visit today with an unsigned form; Arrived without a reason is a 409 asking at the door, with
//      one the override is kept as 'arrived', and In the chair then asks nothing. Today's patients' one tap opens the
//      panel's "Check in anyway". Set back to the chair, Arrived goes through without asking.
//   5. Measured: the new block of Clinic profile, light and dark, 1440 and 390 (contrast ≥ 4.5:1 against the composited
//      background, targets ≥ 44 px, no sideways scroll).
//
//   node scripts/dev/schedule/choices-check.mjs [base=http://127.0.0.1:4610] [slug=session-road] [email] [password=flossify]
//   DB=flossify_t (default) · PGHOST · PGPORT · PGUSER — the server's own database, local only (a superuser: the test
//   plants visits, texts and blocks, and runs the reminder pass, which writes reminders for every clinic in it).
//
// Leaves the three choices at their defaults and the one-chair clinic's chairs as they were. Leaves its planted visits
// cancelled and its overrides behind. Set PW_CHROMIUM when Playwright's own Chromium is not installed.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import pg from 'pg';

const [base = 'http://127.0.0.1:4610', slug = 'session-road', email = 'liwayway.domingo@example.com', password = 'flossify'] = process.argv.slice(2);
const HOST = process.env.PGHOST ?? '/var/run/postgresql';
if (!HOST.startsWith('/') && !['localhost', '127.0.0.1', '::1'].includes(HOST)) throw new Error('refusing: not a local database');
const db = new pg.Client({ host: HOST, port: process.env.PGPORT ? Number(process.env.PGPORT) : undefined, user: process.env.PGUSER, database: process.env.DB ?? 'flossify_t' });
await db.connect();
const q = async (sql, p = []) => (await db.query(sql, p)).rows;
const ok = (s) => console.log(`  ok  ${s}`);
const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const ref = () => `CF-${Array.from({ length: 5 }, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]).join('')}`;
const DEFAULTS = `turnover_min = 0, hold_closed_reminders = false, consent_ask_at = 'chair'`;

const clinicId = (await q('select id from clinic where slug = $1', [slug]))[0]?.id;
assert(clinicId, `no clinic ${slug}`);
const staffId = (await q('select id from staff where email = $1', [email]))[0]?.id;
await q(`update clinic set ${DEFAULTS} where id = $1`, [clinicId]);
const choices = async () => (await q('select turnover_min, hold_closed_reminders, consent_ask_at from clinic where id = $1', [clinicId]))[0];
// Two patients of the test's own with a Philippine mobile (made once, kept: Today's patients draws one row per patient,
// so the seed's patients, already on today's book, cannot be used).
const testPatient = async (chart, first, phone) => (await q(`select id, first_name from patient where clinic_id = $1 and chart_no = $2`, [clinicId, chart]))[0]
  ?? (await q(`insert into patient (clinic_id, chart_no, first_name, last_name, phone) values ($1, $2, $3, 'Choices', $4) returning id, first_name`, [clinicId, chart, first, phone]))[0];
const patient = await testPatient('T-CHOICES-1', 'Tala', '09175550311');
const other = await testPatient('T-CHOICES-2', 'Dalisay', '09175550312');
const planted = [];
const visitAt = async (cid, pid, startsSql, mins, extra = {}) => {
  const [r] = await q(
    `insert into appointment (clinic_id, patient_id, dentist_id, chair, starts_at, ends_at, reason, status, source)
     select $1, $2, $3, $4, s, s + make_interval(mins => $5), 'Test: clinic choices', 'booked', 'staff' from (select ${startsSql} as s) x
     returning id, starts_at, ends_at`, [cid, pid, extra.dentistId ?? null, extra.chair ?? 1, mins]);
  planted.push(r.id);
  return r;
};

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
p.setDefaultTimeout(30_000);
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
p.on('console', (m) => { if (m.type() === 'error' && !/Astro background:|dev toolbar|audit's match function|status of 409 \(Conflict\)/.test(m.text())) errs.push(m.text()); });
await p.goto(`${base}/auth/login/?any=1`);
await p.fill('#email', email); await p.fill('#password', password);
await Promise.all([p.waitForURL(/\/c\//), p.click('[data-go]')]);
const settings = `${base}/c/${slug}/settings/`;
const saveProfile = () => Promise.all([p.waitForLoadState('load'), p.locator('form:has(input[name="chairs"]) button[type="submit"]').first().click()]);

// 1. Settings.
{
  await p.goto(settings, { waitUntil: 'load' });
  assert.equal(await p.locator('#set-turnover').inputValue(), '0');
  assert.equal(await p.locator('#set-turnover option:checked').textContent(), 'None');
  assert.equal(await p.locator('input[name="hold_closed_reminders"]').isChecked(), false);
  assert.equal(await p.locator('input[name="consent_ask_at"][value="chair"]').isChecked(), true);
  ok('Clinic profile: How the day runs drawn with the defaults (None · unticked · At the chair)');
  await p.selectOption('#set-turnover', '15');
  await p.locator('input[name="hold_closed_reminders"]').check();
  await p.locator('label.row-radio:has(input[value="arrived"])').click();
  await saveProfile();
  assert.deepEqual(await choices(), { turnover_min: 15, hold_closed_reminders: true, consent_ask_at: 'arrived' });
  await p.goto(settings, { waitUntil: 'load' });
  assert.equal(await p.locator('#set-turnover').inputValue(), '15');
  ok('saved: 15 minutes, hold ticked, At the door; drawn again as saved');
  // An older tab: none of the three on the form.
  await p.evaluate(() => { for (const el of document.querySelectorAll('[name="has_work_choices"], [name="turnover_min"], [name="hold_closed_reminders"], [name="consent_ask_at"]')) el.remove(); });
  await saveProfile();
  assert.deepEqual(await choices(), { turnover_min: 15, hold_closed_reminders: true, consent_ask_at: 'arrived' }, 'an older form keeps the choices');
  // A forged gap is refused and nothing changes.
  await p.goto(settings, { waitUntil: 'load' });
  await p.evaluate(() => { const o = document.createElement('option'); o.value = '7'; document.querySelector('#set-turnover').append(o); document.querySelector('#set-turnover').value = '7'; });
  await saveProfile();
  assert.match((await p.textContent('main')).replace(/\s+/g, ' '), /Pick the time between visits from the list\./);
  assert.equal((await choices()).turnover_min, 15);
  ok('a form without the fields keeps them; a gap not on the list is refused with its sentence');
  await q(`update clinic set ${DEFAULTS} where id = $1`, [clinicId]);
}

// 2. Time between visits: online booking at a one-chair clinic, and the Dashboard's boot.
{
  const lw = (await q(`select id, chairs, slug from clinic where slug = 'leonard-wood'`))[0];
  assert(lw, 'leonard-wood (the seed)');
  // A patient of its own, once (the seed books no one there); archived, so no list shows it.
  const lwPatient = (await q(`select id from patient where clinic_id = $1 and chart_no = 'T-TURNOVER'`, [lw.id]))[0]
    ?? (await q(`insert into patient (clinic_id, chart_no, first_name, last_name, archived_at) values ($1, 'T-TURNOVER', 'Test', 'Turnover', now()) returning id`, [lw.id]))[0];
  await q('update clinic set chairs = 1, turnover_min = 0 where id = $1', [lw.id]);
  try {
    // Three days ahead or later, a weekday it is open, at 2 pm; the slot asked about is the visit's end, 2:30 pm.
    const day = (await q(`select d::date as d from generate_series((now() at time zone 'Asia/Manila')::date + 3, (now() at time zone 'Asia/Manila')::date + 10, interval '1 day') d
                           join clinic_hours h on h.clinic_id = $1 and h.dow = extract(dow from d) and h.close_min >= 1020
                          where not exists (select 1 from appointment a where a.clinic_id = $1 and a.status not in ('cancelled', 'no_show')
                                              and (a.starts_at at time zone 'Asia/Manila')::date = d::date)
                          order by d limit 1`, [lw.id]))[0]?.d;
    assert(day, 'an open weekday ahead with nothing booked');
    const ymd = new Date(day).toISOString().slice(0, 10);
    const v = await visitAt(lw.id, lwPatient.id, `('${ymd} 14:00'::timestamp at time zone 'Asia/Manila')`, 30);
    const slots = async () => (await (await p.request.get(`${base}/api/availability?clinic=leonard-wood&minutes=30&days=14`)).json()).slots.filter((s) => s.date === ymd).map((s) => s.mins);
    const before = await slots();
    assert.ok(before.includes(870), `no gap: 2:30 pm offered right after the 2 pm visit (${before})`);
    assert.ok(!before.includes(840), 'the visit itself is taken');
    await q('update clinic set turnover_min = 15 where id = $1', [lw.id]);
    const after = await slots();
    assert.ok(!after.includes(870) && !after.includes(810), `15 minutes: 1:30 and 2:30 pm are no longer offered (${after})`);
    assert.ok(after.includes(885) || after.includes(900), `15 minutes: 2:45 or 3 pm is (${after})`);
    ok(`online slots, one chair: 2:30 pm offered with no gap; with 15 minutes 1:30 and 2:30 are not, ${after.includes(885) ? '2:45' : '3:00'} pm is`);
    // The booking re-checks the slot with the gap under the clinic's lock.
    const phone = `0917${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`;
    const at = new Date(new Date(v.ends_at).getTime()).toISOString();
    const r = await p.request.post(`${base}/api/bookings`, { headers: { 'content-type': 'application/json', origin: base },
      data: { clinic: 'leonard-wood', name: 'Test Turnover', phone, consent: true, service: 'consultation', at } });
    assert.equal(r.status(), 409, `the padded slot is refused by the booking (${r.status()}: ${await r.text()})`);
    ok('the booking API refuses the slot inside the gap: "That slot has just gone"');
  } finally {
    await q('update clinic set chairs = $2, turnover_min = 0 where id = $1', [lw.id, lw.chairs]);
  }
  await q('update clinic set turnover_min = 20 where id = $1', [clinicId]);
  await p.goto(`${base}/c/${slug}/`, { waitUntil: 'load' });
  const boot = await p.evaluate(() => JSON.parse(document.querySelector('script[data-dash-boot]').textContent));
  assert.equal(boot.turnover, 20, 'the calendar boot carries the gap');
  assert.equal(boot.holdsReminders, false);
  await q('update clinic set turnover_min = 0 where id = $1', [clinicId]);
  ok('the Dashboard boot carries the clinic\'s gap (20) for the suggested times');
}

let restoreHours = async () => {};
const csrfOf = async () => p.evaluate(() => JSON.parse(document.querySelector('script[data-dash-boot]').textContent).csrf);
const api = (method, path, body) => p.evaluate(async ([m, u, b, s]) => {
  const c = JSON.parse(document.querySelector('script[data-dash-boot]').textContent).csrf;
  const r = await fetch(u, { method: m, credentials: 'same-origin', headers: { 'content-type': 'application/json', 'X-CSRF': c }, body: JSON.stringify({ clinic: s, ...b }) });
  return { status: r.status, body: await r.json().catch(() => null) };
}, [method, path, body, slug]);

// 3. Hold reminders for visits in closed time nobody kept.
{
  await p.goto(`${base}/c/${slug}/`, { waitUntil: 'load' });
  await csrfOf();
  // The reminder pass writes tomorrow's reminders, so the visit is tomorrow, in open time. The seed is open Mon–Sat:
  // run on a Saturday, tomorrow is a Sunday, so tomorrow's weekday is opened for this check and closed after it.
  const tomorrowDow = (await q(`select extract(dow from (now() at time zone 'Asia/Manila')::date + 1)::int as d`))[0].d;
  const hadHours = (await q('select open_min, close_min, break_from_min, break_to_min from clinic_hours where clinic_id = $1 and dow = $2', [clinicId, tomorrowDow]))[0] ?? null;
  if (!hadHours || hadHours.open_min > 600 || hadHours.close_min < 720) {
    await q(`insert into clinic_hours (clinic_id, dow, open_min, close_min) values ($1, $2, 540, 1020)
             on conflict (clinic_id, dow) do update set open_min = 540, close_min = 1020, break_from_min = null, break_to_min = null`, [clinicId, tomorrowDow]);
    restoreHours = async () => {
      if (hadHours) await q('update clinic_hours set open_min = $3, close_min = $4, break_from_min = $5, break_to_min = $6 where clinic_id = $1 and dow = $2', [clinicId, tomorrowDow, hadHours.open_min, hadHours.close_min, hadHours.break_from_min, hadHours.break_to_min]);
      else await q('delete from clinic_hours where clinic_id = $1 and dow = $2', [clinicId, tomorrowDow]);
    };
  }
  const startSql = `(((now() at time zone 'Asia/Manila')::date + 1 + time '10:45')::timestamp at time zone 'Asia/Manila')`;
  const v = await visitAt(clinicId, patient.id, startSql, 30, { chair: 4 });
  const remindersOf = async () => q(`select status, dedupe_key from message_log where appointment_id = $1 and kind = 'reminder' order by created_at`, [v.id]);
  // The reminder pass, as the worker runs it.
  await q('select sms_enqueue_reminders()');
  assert.deepEqual((await remindersOf()).map((r) => r.status), ['queued'], 'switch off, open time: the pass writes the reminder');
  await q('update clinic set hold_closed_reminders = true where id = $1', [clinicId]);
  await p.reload({ waitUntil: 'load' });
  assert.equal((await p.evaluate(() => JSON.parse(document.querySelector('script[data-dash-boot]').textContent))).holdsReminders, true);
  const s = new Date(v.starts_at), e = new Date(v.ends_at);
  const add = await api('POST', '/api/schedule/blocks', { kind: 'closed', startsAt: new Date(s.getTime() - 15 * 60_000).toISOString(), endsAt: new Date(e.getTime() + 15 * 60_000).toISOString(), note: 'Test: hold' });
  assert.equal(add.status, 201, `block added (${add.status}: ${add.body?.error})`);
  const blockId = add.body.block.id;
  const inside = add.body.inside.find((x) => x.id === v.id);
  assert.ok(inside, 'the visit is listed inside the block');
  assert.equal(inside.reminder, 'Reminder held: keep the visit or move it, and it goes');
  assert.deepEqual(await remindersOf(), [{ status: 'cancelled', dedupe_key: null }], 'the queued reminder is withdrawn');
  await q('select sms_enqueue_reminders()');
  assert.equal((await remindersOf()).length, 1, 'the pass writes none while nobody kept it');
  ok('a closed block over tomorrow\'s visit withdraws its queued reminder; the block says "Reminder held"; the pass writes none');
  // Calls: the lede and the line.
  await p.goto(`${base}/c/${slug}/calls/`, { waitUntil: 'load' });
  const pane = p.locator('#closed-time');
  assert.match((await pane.innerText()).replace(/\s+/g, ' '), /Their reminder texts wait until the visit is kept or moved\./);
  const row = p.locator(`[data-closed-visit="${v.id}"]`);
  assert.match(await row.innerText(), /Reminder held: keep the visit or move it, and it goes/);
  ok('Calls → In closed time says the texts wait, and the visit\'s line says "Reminder held"');
  // Keep it: the next pass writes the reminder again.
  await Promise.all([p.waitForLoadState('load'), row.locator('button:has-text("Keep it")').click()]);
  assert.ok((await q('select blocked_ok_at from appointment where id = $1', [v.id]))[0].blocked_ok_at, 'kept');
  await q('select sms_enqueue_reminders()');
  assert.deepEqual((await remindersOf()).map((r) => r.status), ['cancelled', 'queued'], 'kept: the pass writes it');
  ok('Keep it, and the next pass writes the reminder');
  // Switch off: a visit in closed time nobody kept is reminded as before.
  await q('update clinic set hold_closed_reminders = false where id = $1', [clinicId]);
  const w = await visitAt(clinicId, patient.id, `(${startSql} + interval '5 minutes')`, 20, { chair: 3 });
  await q('select sms_enqueue_reminders()');
  assert.equal((await q(`select count(*)::int as n from message_log where appointment_id = $1 and kind = 'reminder' and status = 'queued'`, [w.id]))[0].n, 1, 'switch off: reminded');
  // Switching it on withdraws what is waiting for such a visit (the save's holdClosedReminders).
  await p.goto(settings, { waitUntil: 'load' });
  await p.locator('input[name="hold_closed_reminders"]').check();
  await saveProfile();
  assert.equal((await q(`select status from message_log where appointment_id = $1 and kind = 'reminder'`, [w.id]))[0].status, 'cancelled', 'switched on: withdrawn');
  ok('switch off: a visit in closed time is reminded as before; switching it on withdraws that reminder');
  await p.goto(`${base}/c/${slug}/`, { waitUntil: 'load' });
  const rm = await api('PATCH', '/api/schedule/blocks', { id: blockId, remove: true });
  assert.equal(rm.status, 200, 'block removed');
  await q(`update clinic set ${DEFAULTS} where id = $1`, [clinicId]);
}

// 4. Ask at the door.
{
  await q(`update clinic set consent_ask_at = 'arrived' where id = $1`, [clinicId]);
  const plant = async (visitId, patientId = patient.id) => (await q(
    `insert into consent_document (clinic_id, ref, version_id, patient_id, appointment_id, fields, sort, prepared_by)
     values ($1, $2, 'treatment-2026-09', $3, $4, '{}', 1, $5) returning id`, [clinicId, ref(), patientId, visitId, staffId]))[0].id;
  // Later today, so it is on Today's patients and in no one's way.
  const todaySql = `(((now() at time zone 'Asia/Manila')::date + time '16:30')::timestamp at time zone 'Asia/Manila')`;
  const a = await visitAt(clinicId, patient.id, todaySql, 15, { chair: 4 });
  const docA = await plant(a.id);
  await p.goto(`${base}/c/${slug}/`, { waitUntil: 'load' });
  const r1 = await api('PATCH', '/api/schedule', { id: a.id, status: 'arrived' });
  assert.equal(r1.status, 409, `Arrived without a reason → 409 (${r1.status})`);
  assert.equal(r1.body.consent, true);
  assert.match(r1.body.error, /not signed yet\. Say why they are checked in without it, or have it signed while they wait\./);
  assert.equal((await q('select status from appointment where id = $1', [a.id]))[0].status, 'booked', 'nothing changed');
  const r2 = await api('PATCH', '/api/schedule', { id: a.id, status: 'arrived', consentReason: 'Test: signs in the lobby' });
  assert.equal(r2.status, 200, `with a reason → 200 (${r2.status}: ${r2.body?.error})`);
  assert.deepEqual(await q('select context, reason from consent_override where document_id = $1', [docA]), [{ context: 'arrived', reason: 'Test: signs in the lobby' }]);
  const r3 = await api('PATCH', '/api/schedule', { id: a.id, status: 'in_chair' });
  assert.equal(r3.status, 200, `In the chair asks nothing answered at the door (${r3.status}: ${r3.body?.error})`);
  ok('API, at the door: Arrived is asked (409, the door\'s sentence), kept as "arrived" with a reason; In the chair then asks nothing');
  // Today's patients' one tap: the panel says Check in anyway.
  const b = await visitAt(clinicId, other.id, `(${todaySql} + interval '20 minutes')`, 15, { chair: 3 });
  const docB = await plant(b.id, other.id);
  await p.reload({ waitUntil: 'load' });
  const step = p.locator(`.pt-step[data-visit="${b.id}"]`);
  await step.scrollIntoViewIfNeeded();
  assert.match((await step.textContent()).trim(), /Arrived/);
  await step.click();
  const anyway = p.locator('[data-vp-seat-anyway]');
  await anyway.waitFor({ state: 'visible' });
  assert.equal((await anyway.innerText()).trim(), 'Check in anyway');
  assert.match((await p.locator('[data-vp-error]').innerText()).replace(/\s+/g, ' '), /have it signed while they wait\./);
  await p.fill('#vp-why-in', 'Test: in pain, the form after');
  await anyway.click();
  await p.locator('[data-vp-said]').waitFor({ state: 'visible' });
  assert.equal((await q('select status from appointment where id = $1', [b.id]))[0].status, 'arrived');
  assert.deepEqual(await q('select context from consent_override where document_id = $1', [docB]), [{ context: 'arrived' }]);
  ok('Dashboard, at the door: the one tap Arrived opens "Check in anyway"; with a reason checked in and kept');
  // Back at the chair: Arrived goes through without asking, In the chair asks.
  await q(`update clinic set consent_ask_at = 'chair' where id = $1`, [clinicId]);
  const c = await visitAt(clinicId, patient.id, `(${todaySql} + interval '40 minutes')`, 15, { chair: 2 });
  await plant(c.id);
  const r4 = await api('PATCH', '/api/schedule', { id: c.id, status: 'arrived' });
  assert.equal(r4.status, 200, 'at the chair: Arrived is not asked');
  const r5 = await api('PATCH', '/api/schedule', { id: c.id, status: 'in_chair' });
  assert.equal(r5.status, 409, 'at the chair: In the chair is');
  assert.match(r5.body.error, /Say why they go into the chair without it\./);
  ok('set back to the chair: Arrived goes through, In the chair asks');
}

// 5. Measured: How the day runs, light and dark, 1440 and 390.
{
  for (const [w, h] of [[1440, 900], [390, 844]]) {
    await p.setViewportSize({ width: w, height: h });
    for (const scheme of ['light', 'dark']) {
      await p.emulateMedia({ colorScheme: scheme });
      await p.goto(`${settings}#work`, { waitUntil: 'load' });
      await p.waitForTimeout(300);
      const m = await p.evaluate(() => {
        const rgba = (s) => (s.match(/[\d.]+/g) || []).map(Number);
        const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
        const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
        const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
        // Composite every background up the tree over the page's own.
        const bg = (el) => {
          const layers = [];
          for (let e = el; e; e = e.parentElement) { const c = rgba(getComputedStyle(e).backgroundColor); if (c.length >= 3 && (c[3] ?? 1) > 0) layers.push(c); }
          let out = [255, 255, 255];
          for (const c of layers.reverse()) { const a = c[3] ?? 1; out = out.map((v, i) => v * (1 - a) + c[i] * a); }
          return out;
        };
        const head = document.getElementById('work');
        const end = document.getElementById('hmos');
        const inBlock = (el) => (head.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) && (el.compareDocumentPosition(end) & Node.DOCUMENT_POSITION_FOLLOWING);
        const texts = [head, ...document.querySelectorAll('form *')].filter((el) => (el === head || inBlock(el)) && el.getClientRects().length
          && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()));
        const fails = texts.map((el) => ({ t: el.textContent.trim().slice(0, 40), r: ratio(rgba(getComputedStyle(el).color).slice(0, 3), bg(el)) })).filter((x) => x.r < 4.5);
        const lowest = Math.min(...texts.map((el) => ratio(rgba(getComputedStyle(el).color).slice(0, 3), bg(el))));
        const targets = [...document.querySelectorAll('#set-turnover, label.row-radio, label.check')].filter((el) => inBlock(el))
          .map((el) => el.getBoundingClientRect().height).filter((hh) => hh < 44);
        return { fails, lowest, targets, n: texts.length, scroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          font: parseFloat(getComputedStyle(document.getElementById('set-turnover')).fontSize) };
      });
      assert.deepEqual(m.fails, [], `${w} ${scheme}: contrast`);
      assert.deepEqual(m.targets, [], `${w} ${scheme}: targets ≥ 44 px`);
      assert.equal(m.scroll, 0, `${w} ${scheme}: no sideways scroll`);
      assert.ok(m.font >= 16, 'the select is 16 px');
      ok(`How the day runs, ${w} ${scheme}: ${m.n} lines, lowest ${m.lowest.toFixed(2)}:1, targets ≥ 44 px, no sideways scroll`);
    }
  }
}

await q(`update appointment set status = 'cancelled' where id = any($1::uuid[]) and status not in ('completed', 'cancelled')`, [planted]);
await q(`update message_log set status = 'cancelled', dedupe_key = null where appointment_id = any($1::uuid[]) and status = 'queued'`, [planted]);
await q(`update clinic set ${DEFAULTS} where id = $1`, [clinicId]);
await restoreHours();
await db.end();
await browser.close();
if (errs.length) { console.log('\nbrowser errors:'); for (const e of errs) console.log('  ' + e); process.exit(1); }
console.log('\nall passed');
