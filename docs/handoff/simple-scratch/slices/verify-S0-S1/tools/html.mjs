// Fetch the record's raw HTML for many deep links, as several roles, and save it normalised (CSRF tokens masked).
// node html.mjs <outdir>
import { chromium } from '/home/user/fl-simple/node_modules/playwright/index.mjs';
import pg from '/home/user/fl-simple/node_modules/pg/lib/index.js';
import { writeFileSync, mkdirSync } from 'node:fs';
const OUT = process.argv[2]; mkdirSync(OUT, { recursive: true });
const BASE = 'http://127.0.0.1:4470', S = `${BASE}/c/session-road`;
const db = new pg.Client({ host: '/var/run/postgresql', user: 'root', database: 'flossify_simple' }); await db.connect();
await db.query(`delete from throttle where key like 'login:%'`);
const P = { maria: '1a1d1c5e-ce1a-4d80-801c-f13fb6ef48cb', ledger: '9ea415bd-4b9e-4725-80e8-391464e2c12e', rich: '7e57a1c0-0000-4000-8000-000000000001' };
const V = { today: '5a055ab9-8eaa-42aa-9951-395736601384', past: '1b9c069c-4521-41fc-b079-559aaa843e6a', staleChair: '2ac3bf8c-6471-4d0e-bff7-ada70b33522f',
  cancelled: 'becca4e2-73b5-4ad7-a303-ccf353ba006f', future: 'f0ad9227-8747-4fc7-b6de-11fccdff1518', futureCancelled: '0429460e-778c-4c37-811f-5c01373ad245',
  ledgerChair: '77d83a8b-2083-47fb-b31d-72c2d146c1bf', richToday: '7e57a1c0-0000-4000-8000-0000000000e1' };
const TR = '7e57a1c0-0000-4000-8000-0000000000d1', R0 = '0f0f0f0f-1111-4222-8333-444444444444';
const qs = [
  '', `?visit=${V.today}`, `?visit=${V.past}`, `?visit=${V.staleChair}`, `?visit=${V.cancelled}`, `?visit=${R0}`,
  '?open=vitals', '?open=note', '?open=rx', '?open=done', '?open=file', '?open=details', '?open=health', '?open=constructor', '?open=__proto__',
  `?open=details&dash=${V.today}`, `?visit=${V.today}&open=vitals`, '?back=chart', '?back=treatment', '?back=overview',
  '?saved=new', '?saved=details', `?saved=form&form=${R0}`, `?form=${R0}&used=phone`, '?stale=1', '?saved=health', '?saved=birth', '?saved=nothing',
  '?saved=checked', '?saved=checked-today', '?saved=consent', '?saved=consent-already', '?saved=paper', `?saved=intake&intake=${R0}`, '?saved=capacity',
  '?saved=consent-removed', '?capacity=refused', '?saved=plan', '?saved=plan-done', '?saved=done', '?saved=lab-moved', '?saved=note', '?saved=addendum',
  '?saved=rx%3A' + R0, '?saved=file', '?saved=files%3A2', '?saved=recall-cleared', '?saved=vitals-high', '?saved=letter%3A' + R0, '?saved=answered',
  '?saved=loa-denied', '?saved=payplan%3A' + R0, '?saved=adjusted%3A2026-10-30', '?saved=charted', '?saved=nonsense', '?saved=constructor', '?saved=toString',
  '?saved=__proto__', '?saved=hasOwnProperty-x', `?saved=done&treated=${TR}`, `?treated=${TR}`, `?saved=charted&treated=${TR}&chartskip=changed`,
  `?saved=done&treated=${TR}&back=chart`, `?saved=done&treated=${TR}&back=treatment`,
];
const PAGES = [];
for (const q of qs) PAGES.push(['maria', q]);
for (const q of ['', `?visit=${V.future}`, `?visit=${V.futureCancelled}`, `?visit=${V.ledgerChair}`, '?saved=plan', '?open=done']) PAGES.push(['ledger', q]);
for (const q of qs.filter((x) => x.includes('treated') || x === '' || x.includes('visit') || x.startsWith('?saved='))) PAGES.push(['rich', q]);
PAGES.push(['rich', `?visit=${V.richToday}`]);
const ROLES = { owner: 'liwayway.domingo@example.com', dentist: 'hazel.tabanao@example.com', assistant: 'snap.asst@example.com', custom: 'snap.desk@example.com' };
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const norm = (h) => h.replace(/name="_csrf" value="[^"]*"/g, 'name="_csrf" value="X"').replace(/data-csrf="[^"]*"/g, 'data-csrf="X"').replace(/"csrf":"[^"]*"/g, '"csrf":"X"');
let n = 0;
for (const [role, email] of Object.entries(ROLES)) {
  const ctx = await browser.newContext({ serviceWorkers: 'block' }); const page = await ctx.newPage();
  await page.goto(`${BASE}/auth/login/?any=1`); await page.fill('#email', email); await page.fill('#password', 'flossify');
  await Promise.all([page.waitForNavigation(), page.click('button[type="submit"]')]);
  const cookie = (await ctx.cookies()).map((c) => `${c.name}=${c.value}`).join('; ');
  const pages = role === 'owner' ? PAGES : PAGES.filter(([p, q]) => q === '' || q.includes('visit=') || q.includes('open=') || q.includes('treated') || q === '?saved=plan');
  for (const [p, q] of pages) {
    const r = await fetch(`${S}/patients/${P[p]}/${q}`, { redirect: 'manual', headers: { cookie } });
    const body = await r.text();
    const name = `${role}__${p}__${q.replace(/[^a-zA-Z0-9=&_-]/g, '_').slice(0, 120) || 'plain'}`;
    writeFileSync(`${OUT}/${name}.html`, `STATUS ${r.status} ${r.headers.get('location') ?? ''}\n` + norm(body));
    n++;
  }
  await ctx.close();
}
console.log('saved', n);
await browser.close(); await db.end();
