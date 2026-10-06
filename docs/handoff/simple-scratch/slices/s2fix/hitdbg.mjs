import { chromium } from '/home/user/fl-simple/node_modules/playwright/index.mjs';
import pg from '/home/user/fl-simple/node_modules/pg/lib/index.js';
const db = new pg.Client({ host: '/var/run/postgresql', user: 'root', database: 'flossify_simple' }); await db.connect();
const pid = (await db.query(`select id from patient where chart_no like 'T-LAND-%' order by created_at desc limit 1`)).rows[0].id; await db.end();
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await (await b.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' })).newPage();
await page.goto('http://127.0.0.1:4470/auth/login/?any=1'); await page.fill('#email', 'liwayway.domingo@example.com'); await page.fill('#password', 'flossify');
await Promise.all([page.waitForNavigation(), page.click('button[type="submit"]')]);
for (const u of ['?saved=file-removed#files', '?saved=loa-cancelled#loas', '?saved=plan-removed#treatment']) {
  await page.goto(`http://127.0.0.1:4470/c/session-road/patients/${pid}/${u}`, { waitUntil: 'load' }); await page.waitForTimeout(500);
  console.log(u, await page.evaluate(() => { const el = document.querySelector('[data-rec-saved]'); const r = el.getBoundingClientRect(); const x = r.left + 24, y = r.top + Math.min(r.height / 2, 22); const h = document.elementFromPoint(x, y); const chain = []; for (let e = h; e && chain.length < 5; e = e.parentElement) chain.push(e.tagName + (e.id ? '#' + e.id : '') + '.' + [...e.classList].slice(0, 3).join('.')); return { r: [r.left, r.top, r.width, r.height].map(Math.round), x, y, chain, fx: [...document.querySelectorAll('*')].filter((e) => { const s = getComputedStyle(e); return (s.position === 'fixed' || s.position === 'sticky') && e.getClientRects().length; }).map((e) => e.tagName + '.' + [...e.classList].slice(0, 2).join('.') + ' ' + JSON.stringify([...Object.values(e.getBoundingClientRect().toJSON())].map(Math.round))) }; }));
}
await b.close();
