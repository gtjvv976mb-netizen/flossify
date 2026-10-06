import { chromium } from '/home/user/fl-simple/node_modules/playwright/index.mjs';
const BASE = 'http://127.0.0.1:4470';
const [w, h] = (process.argv[2] ?? '1366x768').split('x').map(Number);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: w, height: h }, serviceWorkers: 'block' });
const page = await ctx.newPage();
await page.goto(`${BASE}/auth/login/?any=1`); await page.fill('#email', 'liwayway.domingo@example.com'); await page.fill('#password', 'flossify');
await Promise.all([page.waitForNavigation(), page.click('[data-go]')]);
await page.goto(`${BASE}/c/session-road/patients/1a1d1c5e-ce1a-4d80-801c-f13fb6ef48cb/#patient`, { waitUntil: 'load' }); await page.waitForTimeout(350);
await page.evaluate(() => document.getElementById('rec-rec-patient-tab').focus());
for (let i = 0; i < 60; i++) {
  await page.keyboard.press('Tab');
  const s = await page.evaluate(() => { const a = document.activeElement; const r = a.getBoundingClientRect(); return { n: (a.name || a.innerText || a.tagName).replace(/\s+/g, ' ').slice(0, 24), t: Math.round(r.top), b: Math.round(r.bottom), y: Math.round(scrollY) }; });
  if (i > 25) console.log(JSON.stringify(s));
  if (s.n === 'note') break;
}
await b.close();
