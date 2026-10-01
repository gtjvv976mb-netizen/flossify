// The public profile's own lines and the clinic's founding year, end to end: a person's page in Clinic settings
// (Public profile pane: a bad year refused, PDA / practising since / about saved and audited, "nothing changed"),
// the public dentist page saying it, My page's own form, Clinic profile's Founded (saved, "since <year>" on the
// clinic page, kept by a form drawn without the field), and the geometry at 390 px.
//
//   node scripts/dev/settings/profile-check.mjs [base=http://127.0.0.1:4610] [slug=session-road] [email] [password=flossify]
//   DB=flossify_t (default) · PGHOST (default /var/run/postgresql) · PGPORT · PGUSER — the server's own database, local only
//
// Needs a dev server on `base` whose DATABASE_URL is that database, and a seeded owner with a public profile (scripts/db/seed.ts).
// Writes to that person's and clinic's rows (test data). Set PW_CHROMIUM to a Chromium binary when Playwright's own is not installed.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import pg from 'pg';
const [base = 'http://127.0.0.1:4610', slug = 'session-road', emailArg = 'liwayway.domingo@example.com', password = 'flossify'] = process.argv.slice(2);
const HOST = process.env.PGHOST ?? '/var/run/postgresql';
if (!HOST.startsWith('/') && !['localhost', '127.0.0.1', '::1'].includes(HOST)) throw new Error('refusing: not a local database');
const db = new pg.Client({ host: HOST, port: process.env.PGPORT ? Number(process.env.PGPORT) : undefined, user: process.env.PGUSER, database: process.env.DB ?? 'flossify_t' }); await db.connect();
const q = async (sql, p = []) => (await db.query(sql, p)).rows;
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage(); p.setDefaultTimeout(30000);
const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/Astro background|dev toolbar|audit/.test(m.text())) errs.push(m.text()); });
const ok = (s) => console.log('  ok  ' + s);
await p.goto(`${base}/auth/login/?any=1`); await p.fill('#email', emailArg); await p.fill('#password', password);
await Promise.all([p.waitForURL(/\/c\//), p.click('[data-go]')]);
const me = (await q(`select id, slug, pda_member, practising_since, about from staff where email = $1`, [emailArg]))[0];
assert(me?.slug, 'the seeded owner has a public profile');
// Start from nothing saved, so a second run sees the same saves (test data: the seed's own values are not kept).
await q(`update staff set pda_member = false, practising_since = null, about = null where id = $1`, [me.id]);
await q(`update clinic set founded = null where slug = $1`, [slug]);
me.pda_member = false; me.practising_since = null; me.about = null;
const clinicId = (await q(`select id from clinic where slug = $1`, [slug]))[0].id;
// 1. The person's page: the Public profile pane and its form.
const here = `${base}/c/${slug}/settings/people/${me.id}/`;
await p.goto(here, { waitUntil: 'load' });
const pane = p.locator('#profile'); assert.equal(await pane.count(), 1, 'Public profile pane');
await pane.locator('input[name="pda"]').check(); await pane.locator('input[name="since"]').evaluate((el) => el.removeAttribute('pattern')); await pane.locator('input[name="since"]').fill('abcd');
await Promise.all([p.waitForResponse((r) => r.request().method() === 'POST'), pane.locator('button[type="submit"]').click()]); await p.waitForLoadState('load');
assert.match((await p.locator('#profile').innerText()).replace(/\s+/g, ' '), /Practising since is a year between 1950 and \d{4}, or blank\./);
assert.equal((await q('select practising_since from staff where id = $1', [me.id]))[0].practising_since, me.practising_since, 'nothing saved on a refusal');
ok('person page: a bad year is refused in the pane, nothing saved');
const auditsBefore = (await q(`select count(*)::int as n from audit_log where action = 'staff.bio' and entity_id = $1`, [me.id]))[0].n;
await p.locator('#profile input[name="since"]').fill('2009');
await p.locator('#profile textarea[name="about"]').fill('General dentistry and root canals since 2009.\n\nIlocano, Filipino and English.');
await Promise.all([p.waitForURL(/done=bio/), p.locator('#profile button[type="submit"]').click()]);
assert.match((await p.locator('#profile').innerText()).replace(/\s+/g, ' '), /Saved .*public profile\./);
const row = (await q('select pda_member, practising_since, about from staff where id = $1', [me.id]))[0];
assert.deepEqual(row, { pda_member: true, practising_since: 2009, about: 'General dentistry and root canals since 2009.\n\nIlocano, Filipino and English.' });
assert.equal((await q(`select count(*)::int as n from audit_log where action = 'staff.bio' and entity_id = $1`, [me.id]))[0].n, auditsBefore + 1, 'one audit row');
ok('person page: PDA, since 2009 and the about saved, audited staff.bio');
await Promise.all([p.waitForURL(/done=bio-same/), p.locator('#profile button[type="submit"]').click()]);
assert.match((await p.locator('#profile').innerText()).replace(/\s+/g, ' '), /Nothing changed/);
ok('person page: saving again says nothing changed');
// 2. The public page says it.
await p.goto(`${base}/dentists/${me.slug}/`, { waitUntil: 'load' });
const pub = (await p.textContent('main')).replace(/\s+/g, ' ');
assert.match(pub, /practising since 2009/); assert.match(pub, /PDA member/); assert.match(pub, /Ilocano, Filipino and English/);
ok('public profile: "practising since 2009", PDA member, the about');
// 3. My page: the same lines, by the person.
await p.goto(`${base}/c/${slug}/account/`, { waitUntil: 'load' });
const bio = p.locator('#bio'); assert.equal(await bio.count(), 1);
assert.equal(await bio.locator('input[name="pda"]').isChecked(), true);
await bio.locator('input[name="pda"]').uncheck();
await Promise.all([p.waitForURL(/done=bio/), bio.locator('button[type="submit"]').click()]);
assert.match((await p.locator('#bio').innerText()).replace(/\s+/g, ' '), /Saved\. Your public profile says it now\./);
assert.equal((await q('select pda_member from staff where id = $1', [me.id]))[0].pda_member, false);
ok('My page: the person unticks PDA, saved and said');
// 4. The clinic's founding year on Clinic profile.
await p.goto(`${base}/c/${slug}/settings/`, { waitUntil: 'load' });
const founded = p.locator('input[name="founded"]'); assert.equal(await founded.count(), 1, 'Founded field on Clinic profile');
await founded.fill('1999');
const profileForm = p.locator('form:has(input[name="founded"])');
await Promise.all([p.waitForLoadState('load'), profileForm.locator('button[type="submit"]').first().click()]);
assert.equal((await q('select founded from clinic where id = $1', [clinicId]))[0].founded, 1999);
await p.goto(`${base}/find/${slug}/`, { waitUntil: 'load' });
assert.match((await p.textContent('main')).replace(/\s+/g, ' '), /since 1999/);
ok('Clinic profile: Founded 1999 saved; the clinic page says "since 1999"');
// A form without the field (an old tab) keeps the year.
await p.goto(`${base}/c/${slug}/settings/`, { waitUntil: 'load' });
await p.evaluate(() => document.querySelector('input[name="founded"]').remove());
await Promise.all([p.waitForLoadState('load'), p.locator('form:has(input[name="chairs"]) button[type="submit"]').first().click()]);
assert.equal((await q('select founded from clinic where id = $1', [clinicId]))[0].founded, 1999, 'a form without the field keeps the year');
ok('Clinic profile: a form drawn without the field keeps the saved year');
// 5. Geometry at 390: no sideways scroll, targets ≥ 44 px on both pages.
for (const url of [here, `${base}/c/${slug}/account/#bio`, `${base}/c/${slug}/settings/`]) {
  await p.setViewportSize({ width: 390, height: 844 }); await p.goto(url, { waitUntil: 'load' }); await p.waitForTimeout(500);
  const g = await p.evaluate(() => ({ scroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    small: [...document.querySelectorAll('button, a.ws-btn, input[type="submit"], input:not([type=hidden]):not([type=checkbox]):not([type=radio]), textarea')].filter((b) => b.getClientRects().length && b.getBoundingClientRect().height > 0 && b.getBoundingClientRect().height < 44).map((b) => `${(b.name || b.textContent || '').trim().slice(0, 24)} ${Math.round(b.getBoundingClientRect().height)}px`) }));
  assert.equal(g.scroll, 0, `${url}: no sideways scroll`); assert.deepEqual(g.small, [], `${url}: targets ≥ 44px`);
  await p.setViewportSize({ width: 1440, height: 900 });
}
ok('390 px: no sideways scroll, every field and button at least 44 px, on the person page, My page and Clinic settings');
if (process.env.PW_STATE_OUT) await ctx.storageState({ path: process.env.PW_STATE_OUT });
await db.end(); await browser.close();
if (errs.length) { console.log('browser errors:', errs); process.exit(1); }
console.log('all passed');
