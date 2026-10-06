import { chromium } from '/home/user/fl-simple/node_modules/playwright/index.mjs';
const BASE = 'http://127.0.0.1:4470';
const REC = `${BASE}/c/session-road/patients/7e57a1c0-0000-4000-8000-000000000001/`;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
for (const [w, h] of [[1440, 900], [390, 844]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/auth/login/?any=1`); await page.fill('#email', 'liwayway.domingo@example.com'); await page.fill('#password', 'flossify');
  await Promise.all([page.waitForNavigation(), page.click('button[type="submit"]')]);
  for (const t of ['patient', 'chart', 'treatment-record']) {
    await page.goto(`${REC}#${t}`, { waitUntil: 'load' }); await page.waitForTimeout(500);
    await page.screenshot({ path: `/tmp/fl-simple-scratch/s2/tab-${t}-${w}.png` });
  }
  await ctx.close();
}
await b.close();
