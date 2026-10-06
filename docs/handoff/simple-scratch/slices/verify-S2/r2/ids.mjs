import { chromium } from '/home/user/fl-simple/node_modules/playwright/index.mjs';
import pg from '/home/user/fl-simple/node_modules/pg/lib/index.js';
const BASE = 'http://127.0.0.1:4470';
const M = '1a1d1c5e-ce1a-4d80-801c-f13fb6ef48cb', R = '7e57a1c0-0000-4000-8000-000000000001', L = '9ea415bd-4b9e-4725-80e8-391464e2c12e';
const db = new pg.Client({ host: '/var/run/postgresql', user: 'root', database: 'flossify_simple' }); await db.connect();
const RX = (await db.query(`select id from prescription where patient_id = $1 order by issued_at limit 1`, [M])).rows[0].id;
await db.query(`delete from throttle where key like 'login:%'`); await db.end();
const URLS = [`${M}/`, `${M}/?saved=rx:${RX}&back=overview#overview`, `${M}/?saved=recall#recall`, `${M}/?saved=plan-accepted#treatment`, `${R}/?saved=done&treated=7e57a1c0-0000-4000-8000-0000000000d1#chart-offer`, `${R}/?visit=7e57a1c0-0000-4000-8000-0000000000e1`, `${L}/`, `${M}/?open=details&dash=5a055ab9-8eaa-42aa-9951-395736601384`, `${M}/?saved=form&form=0f0f0f0f-1111-4222-8333-444444444444`];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
for (const who of ['liwayway.domingo@example.com', 'hazel.tabanao@example.com']) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/auth/login/?any=1`); await page.fill('#email', who); await page.fill('#password', 'flossify');
  await Promise.all([page.waitForNavigation(), page.click('button[type="submit"]')]);
  for (const u of URLS) {
    await page.goto('about:blank'); await page.goto(`${BASE}/c/session-road/patients/${u}`, { waitUntil: 'load' }); await page.waitForTimeout(250);
    const r = await page.evaluate(() => {
      const ids = [...document.querySelectorAll('[id]')].map((e) => e.id); const seen = new Map(); ids.forEach((i) => seen.set(i, (seen.get(i) ?? 0) + 1));
      const dups = [...seen].filter(([, n]) => n > 1).map(([i, n]) => `${i}×${n}`);
      const badRefs = [];
      for (const a of ['aria-labelledby', 'aria-controls', 'aria-describedby', 'for', 'list']) for (const el of document.querySelectorAll(`[${a}]`)) for (const id of el.getAttribute(a).split(/\s+/).filter(Boolean)) if (!document.getElementById(id)) badRefs.push(`${a}=${id}`);
      return { dups, badRefs: [...new Set(badRefs)] };
    });
    console.log(`${who.split('.')[0].padEnd(9)} ${u.slice(0, 8)}${u.slice(37, 90).padEnd(55)} dups=${r.dups.join(',') || 0} badRefs=${r.badRefs.join(',') || 0}`);
  }
  await ctx.close();
}
await browser.close();
