// In the chair asks why when a consent form of the visit is not agreed (consent_override, context in_chair), end to end:
//   1. The API: a visit with two unsigned forms, one already gone ahead without today (an override at today's Manila
//      date) — In the chair without a reason is a 409 { consent: true } naming only the other form, nothing changes;
//      with consentReason it is seated and the override is kept (in_chair, state to_sign, the reason).
//   2. The Dashboard: Today's patients' one tap "In the chair" on a visit with an unsigned form opens the visit's panel
//      with the amber sentence, a box for why and Seat anyway; an empty box is not sent; with a reason the patient is
//      seated. The prompt's words and box are measured (contrast against the panel, light and dark; 44 px; no
//      sideways scroll at 390).
//   3. A visit with nothing to ask seats in one tap, as before.
//
//   node scripts/dev/schedule/seat-check.mjs [base=http://127.0.0.1:4610] [slug=session-road] [email] [password=flossify]
//   DB=flossify_t (default) · PGHOST · PGPORT · PGUSER — the server's own database, local only (a superuser: the test
//   plants forms and resets today's statuses).
//
// Needs the seed's three visits today at the clinic (scripts/db/seed.ts). Leaves its planted forms and their overrides
// behind (an override restricts deleting its form). Set PW_CHROMIUM when Playwright's own Chromium is not installed.
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

const clinicId = (await q('select id from clinic where slug = $1', [slug]))[0]?.id;
assert(clinicId, `no clinic ${slug}`);
const staffId = (await q('select id from staff where email = $1', [email]))[0]?.id;
const today = await q(
  `select a.id, a.patient_id, p.first_name, a.status from appointment a join patient p on p.id = a.patient_id
    where a.clinic_id = $1 and (a.starts_at at time zone 'Asia/Manila')::date = (now() at time zone 'Asia/Manila')::date
      and a.status not in ('cancelled', 'no_show', 'completed') order by a.starts_at`, [clinicId]);
assert(today.length >= 3, 'three visits today (the seed)');
const [plain, ui, api] = today;          // seated in one tap · the Dashboard's prompt · the API
// Every one waits in the lobby again, so the run can be repeated.
await q(`update appointment set status = 'in_lobby', seated_at = null where id = any($1::uuid[])`, [today.map((t) => t.id)]);
const plant = async (visit) => (await q(
  `insert into consent_document (clinic_id, ref, version_id, patient_id, appointment_id, fields, sort, prepared_by)
   values ($1, $2, 'treatment-2026-09', $3, $4, '{}', 1, $5) returning id`, [clinicId, ref(), visit.patient_id, visit.id, staffId]))[0].id;
// The plain visit: whatever forms it has get an override today, so nothing is asked of it.
await q(`insert into consent_override (clinic_id, document_id, context, state_then, reason, staff_id)
         select $1, d.id, 'strip', 'to_sign', 'Test: answered today', $2 from consent_document d
          where d.appointment_id = $3 and d.cancelled_at is null and consent_document_state(d.id) not in ('agreed', 'no_photos')`, [clinicId, staffId, plain.id]);

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
p.setDefaultTimeout(30_000);
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
// The 409s the test asks for are logged by the browser itself as failed loads: expected, not the page's errors.
p.on('console', (m) => { if (m.type() === 'error' && !/Astro background:|dev toolbar|audit's match function|status of 409 \(Conflict\)/.test(m.text())) errs.push(m.text()); });
await p.goto(`${base}/auth/login/?any=1`);
await p.fill('#email', email); await p.fill('#password', password);
await Promise.all([p.waitForURL(/\/c\//), p.click('[data-go]')]);
await p.goto(`${base}/c/${slug}/`, { waitUntil: 'load' });
const csrf = await p.evaluate(() => JSON.parse(document.querySelector('script[data-dash-boot]').textContent).csrf);
const patch = (body) => p.evaluate(async ([b, c, s]) => {
  const r = await fetch('/api/schedule', { method: 'PATCH', credentials: 'same-origin', headers: { 'content-type': 'application/json', 'X-CSRF': c }, body: JSON.stringify({ clinic: s, ...b }) });
  return { status: r.status, body: await r.json().catch(() => null) };
}, [body, csrf, slug]);

// 1. The API.
{
  const asked = await plant(api), answered = await plant(api);
  await q(`insert into consent_override (clinic_id, document_id, context, state_then, reason, staff_id) values ($1, $2, 'strip', 'to_sign', 'Test: answered today', $3)`, [clinicId, answered, staffId]);
  const r1 = await patch({ id: api.id, status: 'in_chair' });
  assert.equal(r1.status, 409, `no reason → 409 (got ${r1.status})`);
  assert.equal(r1.body.consent, true);
  assert.ok(r1.body.forms.includes(asked) && !r1.body.forms.includes(answered), `asks about the unanswered form only: ${JSON.stringify(r1.body.forms)}`);
  assert.match(r1.body.error, /Consent to dental examination and treatment: not signed yet.*Say why they go into the chair without it\./);
  assert.equal((await q('select status from appointment where id = $1', [api.id]))[0].status, 'in_lobby', 'nothing changed');
  const r2 = await patch({ id: api.id, status: 'in_chair', consentReason: 'Test: toothache, signs after' });
  assert.equal(r2.status, 200, `with a reason → 200 (got ${r2.status}: ${r2.body?.error})`);
  assert.equal((await q('select status from appointment where id = $1', [api.id]))[0].status, 'in_chair');
  const ov = await q(`select context, state_then, reason from consent_override where document_id = $1`, [asked]);
  assert.deepEqual(ov, [{ context: 'in_chair', state_then: 'to_sign', reason: 'Test: toothache, signs after' }]);
  ok(`API: ${api.first_name} — 409 consent naming only the unanswered form, nothing changed; with a reason seated, override in_chair kept`);
}

// 2. The Dashboard: Today's patients' one tap, then the panel's prompt.
{
  const doc = await plant(ui);
  await p.reload({ waitUntil: 'load' });
  const step = p.locator(`.pt-step[data-visit="${ui.id}"]`);
  await step.scrollIntoViewIfNeeded();
  assert.match((await step.textContent()).trim(), /In the chair/);
  await step.click();
  const err = p.locator('[data-vp-error]');
  await err.waitFor({ state: 'visible' });
  assert.equal(await err.getAttribute('data-tone'), 'warn', 'amber, not red: nothing is blocked');
  assert.match((await err.innerText()).replace(/\s+/g, ' '), /not signed yet\. Say why they go into the chair without it\./);
  const box = p.locator('#vp-why-in'), seat = p.locator('[data-vp-seat-anyway]');
  assert.equal(await p.evaluate(() => document.activeElement?.id), 'vp-why-in', 'the box has the focus');
  await seat.click();
  assert.equal(await box.getAttribute('aria-invalid'), 'true', 'an empty reason is not sent');
  assert.equal((await q('select status from appointment where id = $1', [ui.id]))[0].status, 'in_lobby');
  // Measured with the prompt open: the sentence, the placeholder and the button against what is behind them, and targets.
  for (const scheme of ['light', 'dark']) {
    await p.emulateMedia({ colorScheme: scheme });
    const m = await p.evaluate(() => {
      const rgb = (s) => (s.match(/[\d.]+/g) || []).map(Number);
      const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
      const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
      const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
      // The first opaque background up the tree, over the panel's own.
      const bg = (el) => { for (let e = el; e; e = e.parentElement) { const c = rgb(getComputedStyle(e).backgroundColor); if (c.length === 3 || (c[3] ?? 1) > 0.95) return c.slice(0, 3); } return [255, 255, 255]; };
      const err = document.querySelector('[data-vp-error]');
      const words = err.querySelector('span.min-w-0');
      const input = document.getElementById('vp-why-in');
      const btn = document.querySelector('[data-vp-seat-anyway]');
      return {
        words: ratio(rgb(getComputedStyle(words).color), bg(err)),
        placeholder: ratio(rgb(getComputedStyle(input, '::placeholder').color), bg(input)),
        button: ratio(rgb(getComputedStyle(btn).color), bg(btn)),
        heights: [input.getBoundingClientRect().height, btn.getBoundingClientRect().height],
        font: parseFloat(getComputedStyle(input).fontSize),
      };
    });
    for (const k of ['words', 'placeholder', 'button']) assert.ok(m[k] >= 4.5, `${scheme}: ${k} ${m[k].toFixed(2)}:1`);
    assert.ok(m.heights.every((h) => h >= 44), `${scheme}: targets ${m.heights}`);
    assert.ok(m.font >= 16, 'the box is 16 px');
    ok(`prompt, ${scheme}: words ${m.words.toFixed(2)}:1, placeholder ${m.placeholder.toFixed(2)}:1, button ${m.button.toFixed(2)}:1, targets ≥ 44 px, 16 px`);
  }
  await p.emulateMedia({ colorScheme: 'light' });
  await box.fill('Test: a child in pain, the parent signs after');
  await seat.click();
  await p.locator('[data-vp-said]').waitFor({ state: 'visible' });
  assert.match(await p.locator('[data-vp-said]').innerText(), /is in the chair/);
  assert.equal((await q('select status from appointment where id = $1', [ui.id]))[0].status, 'in_chair');
  assert.deepEqual(await q('select context, reason from consent_override where document_id = $1', [doc]), [{ context: 'in_chair', reason: 'Test: a child in pain, the parent signs after' }]);
  ok(`Dashboard: ${ui.first_name}'s one tap opens the panel's prompt; empty is not sent; with a reason seated and kept`);
}

// 3. Nothing to ask: one tap seats.
{
  await p.reload({ waitUntil: 'load' });
  const step = p.locator(`.pt-step[data-visit="${plain.id}"]`);
  await step.scrollIntoViewIfNeeded();
  await step.click();
  await p.waitForFunction(async () => true);
  for (let i = 0; i < 40 && (await q('select status from appointment where id = $1', [plain.id]))[0].status !== 'in_chair'; i++) await p.waitForTimeout(250);
  assert.equal((await q('select status from appointment where id = $1', [plain.id]))[0].status, 'in_chair', 'seated in one tap');
  assert.equal(await p.locator('[data-vp-seat-anyway]').count(), 0, 'no prompt');
  ok(`${plain.first_name}: nothing to ask, seated in one tap`);
}

// 4. The prompt fits a phone.
{
  await q(`update appointment set status = 'in_lobby', seated_at = null where id = $1`, [ui.id]);
  await plant(ui);
  await p.setViewportSize({ width: 390, height: 844 });
  await p.goto(`${base}/c/${slug}/`, { waitUntil: 'load' });
  const step = p.locator(`.pt-step[data-visit="${ui.id}"]`);
  await step.scrollIntoViewIfNeeded();
  await step.click();
  await p.locator('[data-vp-seat-anyway]').waitFor({ state: 'visible' });
  const g = await p.evaluate(() => ({ scroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    box: document.getElementById('vp-why-in').getBoundingClientRect().width }));
  assert.equal(g.scroll, 0, 'no sideways scroll at 390');
  assert.ok(g.box >= 150, `the box is usable at 390 (${Math.round(g.box)} px)`);
  ok('390 px: the prompt fits, no sideways scroll');
}

await db.end();
await browser.close();
if (errs.length) { console.log('\nbrowser errors:'); for (const e of errs) console.log('  ' + e); process.exit(1); }
console.log('\nall passed');
