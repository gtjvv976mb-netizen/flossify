import { chromium } from '/home/user/fl-simple/node_modules/playwright/index.mjs';
import pg from '/home/user/fl-simple/node_modules/pg/lib/index.js';
const BASE = 'http://127.0.0.1:4470', S = `${BASE}/c/session-road`;
const db = new pg.Client({ host: '/var/run/postgresql', user: 'root', database: 'flossify_simple' }); await db.connect();
await db.query(`delete from throttle where key like 'login:%'`);
const P = { maria: '1a1d1c5e-ce1a-4d80-801c-f13fb6ef48cb', rich: '7e57a1c0-0000-4000-8000-000000000001' };
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
for (const [who, email] of [['owner', 'liwayway.domingo@example.com'], ['dentist', 'hazel.tabanao@example.com']]) for (const scheme of ['light', 'dark']) for (const w of [390, 1440]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: w === 390 ? 844 : 900 }, colorScheme: scheme, serviceWorkers: 'block' }); const page = await ctx.newPage();
  await page.goto(`${BASE}/auth/login/?any=1`); await page.fill('#email', email); await page.fill('#password', 'flossify');
  await Promise.all([page.waitForNavigation(), page.click('button[type="submit"]')]);
  for (const [pn, pid] of Object.entries(P)) {
    await page.goto(`${S}/patients/${pid}/`, { waitUntil: 'load' }); await page.waitForTimeout(300);
    const tabs = await page.$$eval('[role=tab][id^=rec-rec-]', (t) => t.map((x) => x.id));
    const res = [];
    for (const t of tabs) {
      await page.evaluate((id) => document.getElementById(id).click(), t); await page.waitForTimeout(120);
      res.push(await page.evaluate((id) => {
        const vis = (el) => el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) && el.getClientRects().length > 0;
        const teal = [...document.querySelectorAll('main button, main a, main summary')].filter((e) => vis(e) && (e.classList.contains('ws-btn-primary') || /rgb\(14, 116, 113\)/.test(getComputedStyle(e).backgroundColor))).length;
        return `${id.replace(/^rec-rec-|-tab$/g, '')}:sx=${document.documentElement.scrollWidth - document.documentElement.clientWidth},teal=${teal}`;
      }, t));
    }
    console.log(who, scheme, w, pn, res.join(' '));
  }
  await ctx.close();
}
await browser.close(); await db.end();
