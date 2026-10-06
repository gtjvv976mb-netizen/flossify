// Row widths: the bar, each tab and Add ▾, at tablet widths. node roww.mjs
import { chromium } from '/home/user/fl-simple/node_modules/playwright/index.mjs';
const BASE = 'http://127.0.0.1:4470';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
const page = await ctx.newPage();
await page.goto(`${BASE}/auth/login/?any=1`); await page.fill('#email', process.argv[2] || 'liwayway.domingo@example.com'); await page.fill('#password', 'flossify');
await Promise.all([page.waitForNavigation(), page.click('button[type="submit"]')]);
await page.goto(`${BASE}/c/session-road/patients/1a1d1c5e-ce1a-4d80-801c-f13fb6ef48cb/`, { waitUntil: 'load' }); await page.waitForTimeout(400);
for (const w of (process.argv[3] || '768,800,834,900,1000,1024,1080,1112,1199,1200,1280,1366,1440').split(',').map(Number)) {
  await page.setViewportSize({ width: w, height: 900 }); await page.waitForTimeout(150);
  console.log(await page.evaluate((w) => {
    const bar = document.querySelector('[data-rec-bar]'); const r = bar.getBoundingClientRect();
    const items = [...bar.querySelectorAll('[role=tab], .rec-add-btn')].map((t) => { const q = t.getBoundingClientRect(); return `${Math.round(q.width)}@${Math.round(q.top - r.top)}`; });
    const sb = document.querySelector('.ws-side, [data-ws-side], aside'); 
    const labels = [...bar.querySelectorAll('[role=tab]')].map((t) => t.innerText.replace(/\s+/g, ' ').trim()); return `${w}: fit ${bar.dataset.fit ?? 'full'} bar ${Math.round(r.width)}x${Math.round(r.height)} items ${items.join(' ')} [${labels.join(' | ')}] sw ${document.documentElement.scrollWidth}`;
  }, w));
}
await b.close();
