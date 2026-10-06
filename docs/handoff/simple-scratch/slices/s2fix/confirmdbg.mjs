import { chromium } from '/home/user/fl-simple/node_modules/playwright/index.mjs';
import pg from '/home/user/fl-simple/node_modules/pg/lib/index.js';
const db = new pg.Client({ host: '/var/run/postgresql', user: 'root', database: 'flossify_simple' }); await db.connect();
const pid = (await db.query(`select id from patient where chart_no like 'T-LAND-%' order by created_at desc limit 1`)).rows[0].id; await db.end();
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await (await b.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' })).newPage();
page.on('dialog', (d) => d.accept());
await page.goto('http://127.0.0.1:4470/auth/login/?any=1'); await page.fill('#email', 'liwayway.domingo@example.com'); await page.fill('#password', 'flossify');
await Promise.all([page.waitForNavigation(), page.click('button[type="submit"]')]);
await page.goto(`http://127.0.0.1:4470/c/session-road/patients/${pid}/#chart`, { waitUntil: 'load' }); await page.waitForTimeout(300);
const btn = page.locator('[data-rec-panel]:not([hidden]) form:has(input[name=intent][value=plan-remove]) button').first();
await btn.scrollIntoViewIfNeeded();
await Promise.all([page.waitForNavigation(), btn.click()]); await page.waitForLoadState('load');
for (const t of [100, 500, 1500]) {
  await page.waitForTimeout(t);
  console.log(t, await page.evaluate(() => { const el = document.querySelector('[data-rec-saved]'); const r = el.getBoundingClientRect(); const h = document.elementFromPoint(r.left + 24, r.top + 20); return { r: Math.round(r.top), h: h?.tagName, vis: document.visibilityState, focus: document.hasFocus(), pe: getComputedStyle(document.body).pointerEvents, h2: document.elementFromPoint(700, 450)?.tagName, sy: scrollY }; }));
}
await b.close();
