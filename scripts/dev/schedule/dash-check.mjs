// The Dashboard for a dentist who runs the clinic (the owner, 3 Oct 2026: "imagine you're a dentist who also manages
// his own clinic, make the clinic site suitable for your operations with ease of access and better user experience"),
// measured:
//   - the day's calendar starts in the first screen at 1440 × 900 (the slim number strip; no empty tasks card; the
//     website's lane only while something waits, or when #requests asks for it);
//   - an owner with a column of her own (she treats) gets Mine · Everyone and "Next for you": the patient in her
//     chair, or the next one booked with her, with the allergies, Open record (on that visit) and the next step;
//     pressing the step moves the card on; Mine narrows Today's patients to hers; Everyone brings the clinic back;
//   - a dentist's Dashboard still opens on their own column, with "Next for you";
//   - someone with no column of their own sees no "Next for you";
//   - New → Task opens the Tasks page's form; an open task brings the tasks card back;
//   - every line of the strip and the tiles ≥ 4.5:1 against what is behind it, light and dark, 1440 and 390; no target
//     under 44 px; no sideways scroll.
//
//   node scripts/dev/schedule/dash-check.mjs [base=http://127.0.0.1:4610]
//   PW_CHROMIUM · DB=flossify_t · PGHOST · PGPORT · PGUSER (local only). Reseed before: it moves today's visits on.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import pg from 'pg';

const [base = 'http://127.0.0.1:4610'] = process.argv.slice(2);
const HOST = process.env.PGHOST ?? '/var/run/postgresql';
if (!HOST.startsWith('/') && !['localhost', '127.0.0.1', '::1'].includes(HOST)) throw new Error('refusing: not a local database');
const db = new pg.Client({ host: HOST, port: process.env.PGPORT ? Number(process.env.PGPORT) : undefined, user: process.env.PGUSER, database: process.env.DB ?? 'flossify_t' });
await db.connect();
const q = async (sql, p = []) => (await db.query(sql, p)).rows;
const ok = (s) => console.log(`  ok  ${s}`);
const slug = 'session-road';
const clinicId = (await q('select id from clinic where slug = $1', [slug]))[0].id;
const staffId = async (email) => (await q('select id from staff where email = $1', [email]))[0].id;
const owner = 'liwayway.domingo@example.com', dentist = 'hazel.tabanao@example.com';
const ownerId = await staffId(owner);

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
async function signIn(email, viewport = { width: 1440, height: 900 }) {
  const ctx = await browser.newContext({ viewport, isMobile: viewport.width < 500, hasTouch: viewport.width < 500 });
  const p = await ctx.newPage();
  p.setDefaultTimeout(30_000);
  p.errs = [];
  p.on('pageerror', (e) => p.errs.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/Astro background:|dev toolbar|audit's match function/.test(m.text())) p.errs.push(m.text()); });
  await p.goto(`${base}/auth/login/?any=1`);
  await p.fill('#email', email); await p.fill('#password', 'flossify');
  await Promise.all([p.waitForURL(/\/c\//), p.click('[data-go]')]);
  if (!p.url().includes(`/c/${slug}/`)) await p.goto(`${base}/c/${slug}/`);
  await p.waitForSelector('[data-pt-list]', { state: 'attached' });
  await p.waitForTimeout(600);
  return { ctx, p };
}

const measure = (p) => p.evaluate(() => {
  const rgba = (s) => (s.match(/[\d.]+/g) || []).map(Number);
  const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
  // What is behind: the element's own backgrounds and its ancestors', and the glass (::before) of the card it sits on,
  // composited over the worst case of the room behind (white in light, black in dark: the card is the floor).
  const dark = matchMedia('(prefers-color-scheme: dark)').matches || document.documentElement.dataset.theme === 'dark';
  const bg = (el) => {
    const layers = [];
    for (let e = el; e; e = e.parentElement) {
      const c = rgba(getComputedStyle(e).backgroundColor); if (c.length >= 3 && (c[3] ?? 1) > 0) layers.push(c);
      const g = rgba(getComputedStyle(e, '::before').backgroundColor); if (getComputedStyle(e, '::before').content !== 'none' && g.length >= 3 && (g[3] ?? 1) > 0) layers.push(g);
    }
    let out = dark ? [0, 0, 0] : [255, 255, 255];
    for (const c of layers.reverse()) { const a = c[3] ?? 1; out = out.map((v, i) => v * (1 - a) + c[i] * a); }
    return out;
  };
  const vis = (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  const scope = [...document.querySelectorAll('[data-pt-next], [data-dash-tiles]')];
  const words = scope.flatMap((s) => [s, ...s.querySelectorAll('*')]).filter((el) => vis(el) && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()));
  const measured = words.map((el) => ({ t: el.textContent.trim().slice(0, 30), r: ratio(rgba(getComputedStyle(el).color).slice(0, 3), bg(el)) }));
  const small = scope.flatMap((s) => [...s.querySelectorAll('a, button')]).filter(vis)
    .filter((el) => el.getBoundingClientRect().height < 44).map((el) => `${el.textContent.trim().slice(0, 24)} ${Math.round(el.getBoundingClientRect().height)}`);
  const grid = document.querySelector('.cal-frame')?.getBoundingClientRect();
  return {
    fails: measured.filter((x) => x.r < 4.5), lowest: Math.min(...measured.map((x) => x.r)), n: measured.length, small,
    scroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    gridTop: grid && grid.height ? Math.round(grid.top) : null,
  };
});
const nextText = (p) => p.evaluate(() => { const b = document.querySelector('[data-pt-next]'); return b && !b.hidden ? b.innerText.replace(/\s+/g, ' ').trim() : null; });

// --- 1. The owner who treats -----------------------------------------------------------------------------------------
console.log('\n1. The owner who treats (Dr. Domingo, Session Road)');
await q('delete from clinic_task where clinic_id = $1', [clinicId]);
{
  const { ctx, p } = await signIn(owner);
  const m = await measure(p);
  assert.ok(m.gridTop !== null && m.gridTop < 700, `the calendar's grid starts in the first screen (${m.gridTop})`);
  assert.equal(await p.locator('#tasks').count(), 0, 'no tasks card while nothing is open');
  assert.equal(await p.locator('[data-reqs]').evaluate((e) => getComputedStyle(e).display), 'none', 'the website lane is away while nothing waits');
  ok(`1440: the calendar's grid starts at ${m.gridTop} px; no empty tasks card; no empty lane`);

  const visits = await q(`select a.id, a.status, p.first_name || ' ' || p.last_name as name from appointment a join patient p on p.id = a.patient_id
     where a.clinic_id = $1 and a.dentist_id = $2 and a.status not in ('cancelled', 'no_show', 'completed')
       and (a.starts_at at time zone 'Asia/Manila')::date = (now() at time zone 'Asia/Manila')::date order by a.starts_at`, [clinicId, ownerId]);
  assert.ok(visits.length >= 2, 'the seed has her visits today (reseed if not)');
  const first = visits.find((v) => v.status === 'in_chair') ?? visits[0];
  const t = await nextText(p);
  assert.ok(t && t.includes(first.name.split(' ')[0]), `Next for you names ${first.name}: ${t}`);
  assert.match(t, /Open record/);
  const href = await p.locator('[data-pt-next] a', { hasText: 'Open record' }).getAttribute('href');
  assert.ok(href.endsWith(`?visit=${first.id}`), `Open record opens the record on that visit: ${href}`);
  ok(`Next for you: "${t.slice(0, 90)}…", Open record → ${href.replace(/^.*patients\//, 'patients/')}`);

  // The record opens with This visit for that visit.
  const rec = await ctx.newPage();
  await rec.goto(`${base}${href}`);
  assert.equal(await rec.locator('#this-visit').count(), 1, 'the record opens with This visit');
  await rec.close();
  ok('Open record lands on the record with This visit');

  // Mine · Everyone: the owner opens on everyone; Mine narrows Today's patients to hers.
  const tabs = p.locator('nav[aria-label="Whose visits and patients"] a');
  assert.equal(await tabs.count(), 2, 'Mine · Everyone for the owner who treats');
  assert.equal(await tabs.nth(1).getAttribute('aria-current'), 'page', 'she opens on Everyone (she runs the clinic)');
  await tabs.nth(0).click();
  await p.waitForFunction(() => /with you/.test(document.querySelector('#patients .ws-pane-head .meta')?.textContent ?? ''));
  assert.match(p.url(), new RegExp(`dentist=${ownerId}`), 'Mine is her own column, by id');
  await p.locator('nav[aria-label="Whose visits and patients"] a').nth(1).click();
  await p.waitForFunction(() => !/with you/.test(document.querySelector('#patients .ws-pane-head .meta')?.textContent ?? ''));
  ok('Mine narrows Today’s patients to hers ("with you"), Everyone brings the clinic back');

  // The step on the card: Done on the patient in the chair moves the card to the next one.
  if (first.status === 'in_chair') {
    await p.locator('[data-pt-next] .pt-step').click();
    await p.waitForFunction((n) => !(document.querySelector('[data-pt-next]')?.innerText ?? '').includes(n), first.name.split(' ')[0]);
    const after = (await q('select status from appointment where id = $1', [first.id]))[0].status;
    assert.equal(after, 'completed', 'Done on the card marks the visit done');
    const t2 = await nextText(p);
    assert.ok(t2 && t2.startsWith('Next for you'), `the card moves on: ${t2}`);
    assert.equal(await p.evaluate(() => document.activeElement?.closest('[data-pt-next]') !== null), true, 'the focus stays on the card');
    ok(`Done on the card: the visit is done, the card moves on ("${t2.slice(0, 60)}…"), the focus stays on it`);
  }
  assert.deepEqual(p.errs, [], 'no script errors');
  await ctx.close();
}

// --- 2. A dentist ----------------------------------------------------------------------------------------------------
console.log('\n2. A dentist (Dr. Tabanao)');
{
  const id = await staffId(dentist);
  const { ctx, p } = await signIn(dentist);
  const tabs = p.locator('nav[aria-label="Whose visits and patients"] a');
  assert.equal(await tabs.nth(0).getAttribute('aria-current'), 'page', 'a dentist still opens on Mine');
  const mine = await q(`select count(*)::int as n from appointment where clinic_id = $1 and dentist_id = $2 and status <> 'cancelled'
     and (starts_at at time zone 'Asia/Manila')::date = (now() at time zone 'Asia/Manila')::date`, [clinicId, id]);
  const t = await nextText(p);
  assert.equal(!!t, mine[0].n > 0, `Next for you only with visits of their own today (${mine[0].n}): ${t}`);
  ok(`opens on Mine; Next for you ${t ? 'shows' : 'is away'} with ${mine[0].n} visit(s) of theirs today`);
  await ctx.close();
}

// --- 3. Someone with no column of their own ----------------------------------------------------------------------------
console.log('\n3. Someone with no column here');
{
  // The owner without her schedule rows at this clinic for the length of this check, then put back.
  const rows = await q('select * from staff_schedule where staff_id = $1 and clinic_id = $2', [ownerId, clinicId]);
  await q('delete from staff_schedule where staff_id = $1 and clinic_id = $2', [ownerId, clinicId]);
  try {
    const { ctx, p } = await signIn(owner);
    assert.equal(await p.locator('[data-pt-next]').count(), 0, 'no Next for you');
    assert.equal(await p.locator('nav[aria-label="Whose visits and patients"]').count(), 0, 'no Mine · Everyone');
    ok('no Next for you, no Mine · Everyone');
    await ctx.close();
  } finally {
    for (const r of rows) {
      const keys = Object.keys(r);
      await q(`insert into staff_schedule (${keys.join(', ')}) values (${keys.map((_, i) => `$${i + 1}`).join(', ')})`, keys.map((k) => r[k]));
    }
  }
}

// --- 4. Tasks: New → Task, and the card comes back with an open task ---------------------------------------------------
console.log('\n4. Tasks');
{
  const { ctx, p } = await signIn(owner);
  await p.click('button[aria-controls="ws-new"]');
  const item = p.locator('a.ws-menu-item', { hasText: 'Task for the team' });
  await item.waitFor({ state: 'visible' });
  await item.click();
  await p.waitForURL(/\/tasks\/\?new=1/);
  assert.ok(await p.locator('#task-new').evaluate((d) => d.open || d.hasAttribute('open')), 'the Tasks page opens its form');
  ok('New → Task for the team opens the Tasks page with its form open');
  await q(`insert into clinic_task (clinic_id, title, assignee_id, created_by) values ($1, 'Call the lab about 26', $2, $2)`, [clinicId, ownerId]);
  await p.goto(`${base}/c/${slug}/`);
  await p.waitForSelector('#tasks');
  assert.match(await p.locator('#tasks').innerText(), /Call the lab about 26/);
  ok('an open task brings the tasks card back, with it');
  await q('delete from clinic_task where clinic_id = $1', [clinicId]);
  // #requests asks for the lane even when nothing waits.
  await p.goto(`${base}/c/${slug}/#requests`);
  await p.waitForTimeout(500);
  assert.notEqual(await p.locator('[data-reqs]').evaluate((e) => getComputedStyle(e).display), 'none', '#requests shows the lane');
  ok('#requests (the inbox’s link) shows the lane, waiting or not');
  await ctx.close();
}

// --- 5. Measured: light and dark, 1440 and 390 -------------------------------------------------------------------------
console.log('\n5. Measured');
for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  for (const scheme of ['light', 'dark']) {
    const { ctx, p } = await signIn(owner, vp);
    await p.emulateMedia({ colorScheme: scheme });
    await p.reload(); await p.waitForSelector('[data-pt-list]', { state: 'attached' }); await p.waitForTimeout(500);
    const m = await measure(p);
    assert.deepEqual(m.fails, [], `${vp.width} ${scheme}: contrast`);
    assert.deepEqual(m.small, [], `${vp.width} ${scheme}: targets`);
    assert.equal(m.scroll, 0, `${vp.width} ${scheme}: no sideways scroll`);
    ok(`${vp.width} ${scheme}: ${m.n} lines on the strip and the card, lowest ${m.lowest.toFixed(2)}:1; targets ≥ 44 px; no sideways scroll`);
    if (process.env.OUT && scheme === 'light') await p.screenshot({ path: `${process.env.OUT}/dash-${vp.width}.png` });
    await ctx.close();
  }
}

await browser.close();
await db.end();
console.log('\nall passed');
