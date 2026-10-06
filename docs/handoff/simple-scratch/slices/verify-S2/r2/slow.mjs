// Verifier: a card's own button refused by the rate limit ("Too many saves at once"). Where does the page land, and
// is the sentence on screen? node slow.mjs  (sets the owner's record:s:<id> throttle over its limit, then clears it)
import { chromium } from '/home/user/fl-simple/node_modules/playwright/index.mjs';
import pg from '/home/user/fl-simple/node_modules/pg/lib/index.js';
const BASE = `http://127.0.0.1:${process.env.PORT_ || 4470}`;
const RICH = '7e57a1c0-0000-4000-8000-000000000001', MARIA = '1a1d1c5e-ce1a-4d80-801c-f13fb6ef48cb';
const db = new pg.Client({ host: '/var/run/postgresql', user: 'root', database: 'flossify_simple' }); await db.connect();
const owner = (await db.query(`select id from staff where email = 'liwayway.domingo@example.com'`)).rows[0].id;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
const page = await ctx.newPage();
page.on('dialog', (d) => d.accept());
await page.goto(`${BASE}/auth/login/?any=1`); await page.fill('#email', 'liwayway.domingo@example.com'); await page.fill('#password', 'flossify');
await Promise.all([page.waitForNavigation(), page.click('button[type="submit"]')]);
const cases = [
  ['plan row: Patient agreed', MARIA, 'treatment', '#treatment form:has(input[name=to][value=accepted]) button'],
  ['lab row: next step', RICH, 'treatment', '#treatment-lab form:has(input[name=intent][value=lab-next]) button'],
  ['LOA row: Cancel', RICH, 'loas', '#loas form:has(input[name=intent][value=loa-cancel]) button'],
];
for (const [name, pid, hash, sel] of cases) {
  await page.goto('about:blank');
  await page.goto(`${BASE}/c/session-road/patients/${pid}/#${hash}`, { waitUntil: 'load' }); await page.waitForTimeout(400);
  const b = page.locator(sel).first();
  if (!(await b.count())) { console.log(name, 'no such button'); continue; }
  await db.query(`insert into throttle (key, hits, window_start) values ($1, 100000, now()) on conflict (key) do update set hits = 100000, window_start = now()`, ['record:s:' + owner]);
  await b.scrollIntoViewIfNeeded();
  await Promise.all([page.waitForNavigation(), b.click()]);
  await page.waitForTimeout(600);
  await db.query(`delete from throttle where key = $1`, ['record:s:' + owner]);
  const s = await page.evaluate(() => {
    const vis = (el) => !!el && el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) && el.getClientRects().length > 0;
    const sel = document.querySelector('[role="tab"][aria-selected="true"][id^="rec-rec-"]');
    const all = [...document.querySelectorAll('.ws-callout')].filter((c) => /Too many saves/.test(c.textContent));
    return {
      url: location.hash, tab: sel ? sel.id.replace(/^rec-rec-|-tab$/g, '') : null,
      sentences: all.length, shown: all.filter(vis).length,
      where: all.map((c) => c.closest('[data-rec-panel]')?.dataset.recPanel ?? c.closest('dialog')?.id ?? 'head'),
      onScreen: all.filter(vis).some((c) => { const r = c.getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; }),
    };
  });
  console.log(`${name.padEnd(26)} → tab ${s.tab} ${s.url} sentence drawn ${s.sentences}× in ${s.where.join(',')}, shown ${s.shown}, on screen ${s.onScreen} ${s.shown && s.onScreen ? 'ok' : 'FAIL: the refusal is not on screen'}`);
}
await browser.close(); await db.end();
