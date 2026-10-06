// A card's own button (no back): where the page lands, and whether the saved line is on screen (not under the row,
// not above the viewport). node cards.mjs [port] [w] [h]
import { chromium } from '/home/user/fl-simple/node_modules/playwright/index.mjs';
import pg from '/home/user/fl-simple/node_modules/pg/lib/index.js';
const PORT = process.argv[2] || 4470; const W = +(process.argv[3] || 1440), H = +(process.argv[4] || 900);
const BASE = `http://127.0.0.1:${PORT}`;
const db = new pg.Client({ host: '/var/run/postgresql', user: 'root', database: 'flossify_simple' }); await db.connect();
const q = async (sql, p = []) => (await db.query(sql, p)).rows;
await q(`delete from throttle where key like 'login:%' or key like 'record:%'`);
const RUN = String(Date.now() % 65536);
const ID = `7e57a1c0-0000-4000-8000-0000000c${Number(RUN).toString(16).padStart(4, '0')}`;
const C = `(select id from clinic where slug = 'session-road')`;
const OWNER = `(select id from staff where email = 'liwayway.domingo@example.com')`;
await q(`insert into patient (id, clinic_id, chart_no, first_name, last_name, birth_date, sex, created_by) select $1, ${C}, 'T-VER-' || $2, 'Verify', 'Cards', date '1980-01-02', 'female', ${OWNER}`, [ID, RUN]);
const plan = (await q(`insert into treatment_plan (clinic_id, patient_id, name) select ${C}, $1, 'Plan' returning id`, [ID]))[0].id;
for (const [n, fdi] of [['Composite filling', 16], ['Porcelain crown', 26], ['Extraction', 48]]) await q(`insert into treatment_plan_item (clinic_id, plan_id, patient_id, name, fdi, price) select ${C}, $1, $2, $3, $4, 1000`, [plan, ID, n, fdi]);
await q(`insert into lab_order (clinic_id, patient_id, lab_name, description) select ${C}, $1, 'Test Lab', 'PFM crown 26'`, [ID]);
await q(`insert into recall (clinic_id, patient_id, due_on) select ${C}, $1, current_date + 100`, [ID]);
const URL_ = `${BASE}/c/session-road/patients/${ID}/`;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: W, height: H }, serviceWorkers: 'block' });
const page = await ctx.newPage();
page.on('dialog', (d) => d.accept());
await page.goto(`${BASE}/auth/login/?any=1`); await page.fill('#email', 'liwayway.domingo@example.com'); await page.fill('#password', 'flossify');
await Promise.all([page.waitForNavigation(), page.click('button[type="submit"]')]);
const SEE = (words) => {
  const top = document.querySelector('[data-ws-top]')?.getBoundingClientRect();
  const bar = document.querySelector('[data-rec-bar]')?.getBoundingClientRect();
  const cover = Math.max(top?.bottom ?? 0, bar ? bar.bottom : 0);
  const sel = document.querySelector('[role=tab][aria-selected=true]');
  const els = [...document.querySelectorAll('.ws-callout')].filter((c) => c.innerText.includes(words) && c.getClientRects().length && !c.closest('[hidden]') && !c.closest('dialog'));
  return { url: location.search + location.hash, tab: sel?.id ?? null, y: Math.round(scrollY), cover: Math.round(cover),
    lines: els.map((c) => { const r = c.getBoundingClientRect(); const hit = document.elementFromPoint(Math.min(innerWidth - 2, r.left + 20), r.top + r.height / 2); return { top: Math.round(r.top), bottom: Math.round(r.bottom), onScreen: r.top >= cover - 1 && r.bottom <= innerHeight, hit: hit && c.contains(hit) }; }) };
};
const cases = [
  ['#chart', 'form:has(input[name=to][value=accepted]) button', 'Marked accepted'],
  ['#chart', 'form:has(input[name=to][value=declined]) button', 'Marked declined'],
  ['#chart', 'form:has(input[name=intent][value=plan-remove]) button', 'Taken off the plan'],
  ['#chart', 'form:has(input[name=intent][value=lab-next]) button', 'Lab case moved on'],
  ['#overview', 'form:has(input[name=intent][value=recall-done]) button', 'Marked as came in'],
  ['#overview', 'form:has(input[name=intent][value=recall-set]):has(input[name=months]) button', 'Next check-up set'],
];
for (const [hash, sel, words] of cases) {
  await page.goto('about:blank'); await page.goto(URL_ + (process.env.BASEMODE && hash === '#chart' ? '#treatment' : hash), { waitUntil: 'load' }); await page.waitForTimeout(400);
  const btn = page.locator(`[data-rec-panel]:not([hidden]) ${sel}`).first();
  if (!(await btn.count())) { console.log(`${words}: no button`); continue; }
  await btn.scrollIntoViewIfNeeded(); await page.waitForTimeout(150);
  await Promise.all([page.waitForNavigation(), btn.click()]); await page.waitForTimeout(700);
  const r = await page.evaluate(SEE, words);
  const vis = r.lines.some((l) => l.onScreen && l.hit);
  console.log(`${W} ${vis ? 'ok  ' : 'HIDDEN'} ${words}: ${JSON.stringify(r)}`);
}
await b.close(); await db.end();
