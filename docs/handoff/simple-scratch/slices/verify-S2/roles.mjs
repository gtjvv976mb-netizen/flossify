import { chromium } from '/home/user/fl-simple/node_modules/playwright/index.mjs';
import pg from '/home/user/fl-simple/node_modules/pg/lib/index.js';
const db = new pg.Client({ host: '/var/run/postgresql', user: 'root', database: 'flossify_simple' }); await db.connect();
await db.query(`delete from throttle where key like 'login:%'`); await db.end();
const BASE = 'http://127.0.0.1:4470';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
for (const email of ['snap.desk@example.com', 'snap.sec@example.com', 'snap.asst@example.com', 'snap.assoc@example.com', 'snap.admin@example.com']) for (const [w, h] of [[1440, 900], [390, 844]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, serviceWorkers: 'block' });
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(`${BASE}/auth/login/?any=1`); await page.fill('#email', email); await page.fill('#password', 'flossify');
  await Promise.all([page.waitForNavigation(), page.click('button[type="submit"]')]);
  const res = await page.goto(`${BASE}/c/session-road/patients/1a1d1c5e-ce1a-4d80-801c-f13fb6ef48cb/`, { waitUntil: 'load' }); await page.waitForTimeout(400);
  const r = await page.evaluate(() => { const bar = document.querySelector('[data-rec-bar]'); if (!bar) return { nobar: true, title: document.title }; const tabs = [...bar.querySelectorAll('[role=tab]')].map((t) => { const r = t.getBoundingClientRect(); return `${Math.round(r.width)}x${Math.round(r.height)}`; }); const add = bar.querySelector('.rec-add'); return { tabs, add: add ? [...add.querySelectorAll('.ws-menu-item')].map((e) => e.innerText.split('\n')[0]) : null, addBox: add ? (() => { const r = add.getBoundingClientRect(); return `${Math.round(r.width)}x${Math.round(r.height)}`; })() : null, sw: document.documentElement.scrollWidth, row: Math.round(bar.getBoundingClientRect().height) }; });
  console.log(email.split('@')[0], w, res.status(), JSON.stringify(r), errs.length ? errs : '');
  await ctx.close();
}
await b.close();
