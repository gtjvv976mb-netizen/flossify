// The 030 role snapshot, for the patient record: 7 roles × the record of Maria, Ledger Test and Rich Test (and
// Maria's record with ?visit= today, and her print pages), fingerprinted as snap.mjs does — tabs, headings,
// buttons, form fields, links (ids and digits masked) — plus what S8 must prove unchanged:
//   intents  every form on the page as "<method> <action> intent=<intent>" (sorted, unique)
//   actions  every form action (sorted, unique)
//   hrefs    every link's target, without its text (sorted, unique)
//   panels   every side panel (dialog[data-ws-panel]) id
//   opens    every data-ws-open / data-pick-open value (sorted, unique)
//   recgo    every data-rec-go / data-rec-show value (sorted, unique)
// node snap-record.mjs <out.json> [port] [database]     then: node cmp.mjs <before.json> <after.json>
import { chromium } from '/home/user/fl-simple/node_modules/playwright/index.mjs';
import pg from '/home/user/fl-simple/node_modules/pg/lib/index.js';
import { writeFileSync } from 'node:fs';
const [out, port = process.env.PORT_ || '4470', dbname = process.env.DB_ || 'flossify_simple'] = process.argv.slice(2);
const BASE = `http://127.0.0.1:${port}`, S = '/c/session-road';
const db = new pg.Client({ host: '/var/run/postgresql', user: 'root', database: dbname }); await db.connect();
await db.query(`delete from throttle where key like 'login:%'`);
const MARIA = '1a1d1c5e-ce1a-4d80-801c-f13fb6ef48cb', LEDGER = '9ea415bd-4b9e-4725-80e8-391464e2c12e', RICH = '7e57a1c0-0000-4000-8000-000000000001';
const TODAY = '5a055ab9-8eaa-42aa-9951-395736601384';
const RX = (await db.query(`select id from prescription where patient_id = $1 order by issued_at limit 1`, [MARIA])).rows[0].id;
const LT = (await db.query(`select id from clinical_letter where patient_id = $1 order by created_at limit 1`, [MARIA])).rows[0].id;
const ROLES = { owner: 'liwayway.domingo@example.com', admin: 'snap.admin@example.com', dentist: 'hazel.tabanao@example.com', associate: 'snap.assoc@example.com',
  secretary: 'snap.sec@example.com', assistant: 'snap.asst@example.com', custom: 'snap.desk@example.com' };
const PAGES = [
  ['maria', `/patients/${MARIA}/`], ['maria-visit', `/patients/${MARIA}/?visit=${TODAY}`], ['ledger', `/patients/${LEDGER}/`], ['rich', `/patients/${RICH}/`],
  ['maria-trec-print', `/patients/${MARIA}/treatment-record/`], ['ledger-trec-print', `/patients/${LEDGER}/treatment-record/`],
  ['maria-rx-print', `/patients/${MARIA}/rx/${RX}/`], ['maria-letter-print', `/patients/${MARIA}/letters/${LT}/`],
];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const snap = {};
for (const [role, email] of Object.entries(ROLES)) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' }); const page = await ctx.newPage();
  await page.goto(`${BASE}/auth/login/?any=1`); await page.fill('#email', email); await page.fill('#password', 'flossify');
  await Promise.all([page.waitForNavigation(), page.click('button[type="submit"]')]);
  for (const [i, [name, p]] of PAGES.entries()) {
    const r = await page.goto(`${BASE}${S}${p}`, { waitUntil: 'load' });
    await page.waitForTimeout(300);
    snap[`${role} ${String(i).padStart(2, '0')} ${name}`] = await page.evaluate((status) => {
      const m = (s) => (s ?? '').replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id').replace(/\d+/g, '#').replace(/\s+/g, ' ').trim();
      const txt = (e) => m(e.textContent);
      const uniq = (xs) => [...new Set(xs)].sort();
      return {
        status, url: m(location.pathname),
        tabs: [...document.querySelectorAll('[role=tab], .ws-nav a, nav a')].map((e) => txt(e)),
        headings: [...document.querySelectorAll('h1, h2, h3, h4')].map((e) => txt(e)),
        buttons: [...document.querySelectorAll('button')].map((e) => txt(e) || m(e.getAttribute('aria-label'))),
        fields: [...document.querySelectorAll('input, select, textarea')].map((e) => `${e.tagName.toLowerCase()}:${e.type}:${e.name}`),
        links: [...document.querySelectorAll('a[href]')].map((e) => `${txt(e)} → ${m(e.getAttribute('href'))}`),
        intents: uniq([...document.querySelectorAll('form')].map((f) => `${(f.getAttribute('method') || 'get').toLowerCase()} ${m(f.getAttribute('action') ?? '')} intent=${f.querySelector('input[name=intent]')?.value ?? ''}`)),
        actions: uniq([...document.querySelectorAll('form')].map((f) => m(f.getAttribute('action') ?? ''))),
        hrefs: uniq([...document.querySelectorAll('a[href]')].map((e) => m(e.getAttribute('href')))),
        panels: [...document.querySelectorAll('dialog[data-ws-panel]')].map((d) => m(d.id)),
        opens: uniq([...document.querySelectorAll('[data-ws-open], [data-pick-open]')].map((e) => m(e.getAttribute('data-ws-open') ?? e.getAttribute('data-pick-open')))),
        recgo: uniq([...document.querySelectorAll('[data-rec-go], [data-rec-show]')].map((e) => (e.dataset.recGo ? 'go:' + e.dataset.recGo : 'show:' + e.dataset.recShow))),
      };
    }, r?.status());
  }
  await ctx.close();
}
writeFileSync(out, JSON.stringify(snap, null, 1));
console.log('pages', Object.keys(snap).length);
await browser.close(); await db.end();
