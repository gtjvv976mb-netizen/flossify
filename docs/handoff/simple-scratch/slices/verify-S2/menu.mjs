import { chromium } from '/home/user/fl-simple/node_modules/playwright/index.mjs';
const BASE = 'http://127.0.0.1:4470';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
for (const [w, h, y] of [[1366, 768, 0], [1440, 900, 0], [1024, 768, 0], [820, 1180, 0], [390, 844, 0], [390, 664, 1200], [1280, 720, 300]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/auth/login/?any=1`); await page.fill('#email', 'liwayway.domingo@example.com'); await page.fill('#password', 'flossify');
  await Promise.all([page.waitForNavigation(), page.click('button[type="submit"]')]);
  await page.goto(`${BASE}/c/session-road/patients/1a1d1c5e-ce1a-4d80-801c-f13fb6ef48cb/`, { waitUntil: 'load' }); await page.waitForTimeout(400);
  await page.evaluate((y) => scrollTo(0, y), y); await page.waitForTimeout(200);
  await page.click('.rec-add-btn'); await page.waitForTimeout(500);
  const r = await page.evaluate(() => { const pop = document.querySelector('.rec-add .ws-menu-pop'); const pr = pop.getBoundingClientRect(); const items = [...pop.querySelectorAll('.ws-menu-item')]; const last = items[items.length - 1]; last.scrollIntoView({ block: 'nearest' }); const lr = last.getBoundingClientRect(); const hit = document.elementFromPoint(lr.left + 20, lr.top + lr.height / 2); const bar = document.querySelector('[data-rec-bar]').getBoundingClientRect(); return { y: Math.round(scrollY), bar: [Math.round(bar.top), Math.round(bar.bottom)], pop: [Math.round(pr.top), Math.round(pr.bottom), Math.round(pr.left), Math.round(pr.right)], sh: pop.scrollHeight, ch: pop.clientHeight, ov: getComputedStyle(pop).overflowY, last: [Math.round(lr.top), Math.round(lr.bottom)], lastHit: !!hit && last.contains(hit), sw: document.documentElement.scrollWidth }; });
  console.log(w, h, 'y0', y, JSON.stringify(r), r.pop[1] <= h && r.lastHit ? 'ok' : 'PROBLEM');
  await ctx.close();
}
await b.close();
