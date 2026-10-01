// Role snapshot: 7 roles × 22 workspace pages; tabs, headings, buttons, form fields and links, ids and digits masked.
// node snap.mjs <out.json> <port> <database>
import { chromium } from '/home/user/fl-simple/node_modules/playwright/index.mjs';
import pg from '/home/user/fl-simple/node_modules/pg/lib/index.js';
import { writeFileSync } from 'node:fs';
const [out, port, dbname] = process.argv.slice(2);
const BASE = `http://127.0.0.1:${port}`, S = '/c/session-road';
const db = new pg.Client({ host: '/var/run/postgresql', user: 'root', database: dbname }); await db.connect();
const id = async (email) => (await db.query('select id from staff where email = $1', [email])).rows[0].id;
await db.query(`delete from throttle where key like 'login:%'`);
const PT = '1a1d1c5e-ce1a-4d80-801c-f13fb6ef48cb';
const RX = (await db.query(`select id from prescription where patient_id = $1 order by issued_at limit 1`, [PT])).rows[0].id;
const LT = (await db.query(`select id from clinical_letter where patient_id = $1 order by created_at limit 1`, [PT])).rows[0].id;
const HZ = await id('hazel.tabanao@example.com'), LW = await id('liwayway.domingo@example.com'), RC = await id('ramon.cari.o@example.com');
const ROLES = { owner: 'liwayway.domingo@example.com', admin: 'snap.admin@example.com', dentist: 'hazel.tabanao@example.com', associate: 'snap.assoc@example.com',
  secretary: 'snap.sec@example.com', assistant: 'snap.asst@example.com', custom: 'snap.desk@example.com' };
const PAGES = ['/', '/patients/', `/patients/${PT}/`, '/patients/new/', '/patients/import/', '/patients/qr/', '/patients/forms/', '/finances/', '/finances/new/', '/finances/close/',
  '/claims/', '/messages/', '/calls/', '/tasks/', '/settings/', `/settings/people/${HZ}/`, `/settings/people/${LW}/`, `/settings/people/${RC}/`, '/account/',
  `/patients/${PT}/rx/${RX}/`, `/patients/${PT}/letters/${LT}/`, `/patients/${PT}/treatment-record/`];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const snap = {};
for (const [role, email] of Object.entries(ROLES)) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } }); const page = await ctx.newPage();
  await page.goto(`${BASE}/auth/login/?any=1`); await page.fill('#email', email); await page.fill('#password', 'flossify');
  await Promise.all([page.waitForNavigation(), page.click('button[type="submit"]')]);
  for (const [i, p] of PAGES.entries()) {
    const r = await page.goto(`${BASE}${S}${p}`, { waitUntil: 'load' });
    await page.waitForTimeout(250);
    snap[`${role} ${String(i).padStart(2, '0')} ${p.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, ':id')}`] = await page.evaluate((status) => {
      const m = (s) => (s ?? '').replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id').replace(/\d+/g, '#').replace(/\s+/g, ' ').trim();
      const txt = (e) => m(e.textContent);
      return {
        status, url: m(location.pathname),
        tabs: [...document.querySelectorAll('[role=tab], .ws-nav a, nav a')].map((e) => txt(e)),
        headings: [...document.querySelectorAll('h1, h2, h3, h4')].map((e) => txt(e)),
        buttons: [...document.querySelectorAll('button')].map((e) => txt(e) || m(e.getAttribute('aria-label'))),
        fields: [...document.querySelectorAll('input, select, textarea')].map((e) => `${e.tagName.toLowerCase()}:${e.type}:${e.name}`),
        links: [...document.querySelectorAll('a[href]')].map((e) => `${txt(e)} → ${m(e.getAttribute('href'))}`),
      };
    }, r?.status());
  }
  await ctx.close();
}
writeFileSync(out, JSON.stringify(snap, null, 1));
console.log('pages', Object.keys(snap).length);
await browser.close(); await db.end();
