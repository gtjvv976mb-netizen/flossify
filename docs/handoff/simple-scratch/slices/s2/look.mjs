// Quick look: sign in as owner, open Maria's record at 1440 and 390, screenshot, report errors and the bar.
import { chromium } from '/home/user/fl-simple/node_modules/playwright/index.mjs';
import pg from '/home/user/fl-simple/node_modules/pg/lib/index.js';
const BASE = 'http://127.0.0.1:4470';
const db = new pg.Client({ host: '/var/run/postgresql', user: 'root', database: 'flossify_simple' }); await db.connect();
await db.query(`delete from throttle where key like 'login:%'`); await db.end();
const url = process.argv[2] ?? '/c/session-road/patients/1a1d1c5e-ce1a-4d80-801c-f13fb6ef48cb/';
const who = process.argv[3] ?? 'liwayway.domingo@example.com';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
for (const [w, h] of [[1440, 900], [390, 844]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(String(e))); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(`${BASE}/auth/login/?any=1`); await page.fill('#email', who); await page.fill('#password', 'flossify');
  await Promise.all([page.waitForNavigation(), page.click('button[type="submit"]')]);
  await page.goto(BASE + url, { waitUntil: 'load' }); await page.waitForTimeout(600);
  const info = await page.evaluate(() => {
    const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)]; };
    return { bar: r('[data-rec-bar]'), tabs: [...document.querySelectorAll('[role=tab][id^=rec-rec-]')].map((t) => [t.id, t.getAttribute('aria-selected'), (t.innerText||'').replace(/\s+/g,' '), Math.round(t.getBoundingClientRect().width), Math.round(t.getBoundingClientRect().height)]), add: r('.rec-add'), sw: document.documentElement.scrollWidth, iw: innerWidth, stick: getComputedStyle(document.documentElement).getPropertyValue('--rec-stick'), panels: [...document.querySelectorAll('[data-rec-panel]')].map((p) => p.id + (p.hidden ? '(h)' : '')), dialogs: document.querySelectorAll('dialog[data-ws-panel]').length, inTabs: [...document.querySelectorAll('[data-rec-panel] dialog')].map((d) => d.id) };
  });
  console.log(w, JSON.stringify(info), errs);
  await page.screenshot({ path: `/tmp/fl-simple-scratch/s2/look-${w}.png`, fullPage: false });
  await page.evaluate(() => scrollTo(0, 1400)); await page.waitForTimeout(200);
  console.log(' scrolled bar', await page.evaluate(() => { const b = document.querySelector('[data-rec-bar]').getBoundingClientRect(); return [Math.round(b.top), Math.round(b.bottom)]; }));
  await page.screenshot({ path: `/tmp/fl-simple-scratch/s2/look-${w}-scrolled.png` });
  await ctx.close();
}
await b.close();
