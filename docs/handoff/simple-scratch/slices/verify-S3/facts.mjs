import { chromium } from '/home/user/fl-simple/node_modules/playwright/index.mjs';
const BASE = 'http://127.0.0.1:4470';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
for (const [w, h] of [[390, 844], [360, 740], [768, 1024]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  await page.goto(BASE + '/auth/login/?any=1'); await page.fill('#email', 'liwayway.domingo@example.com'); await page.fill('#password', 'flossify');
  await Promise.all([page.waitForNavigation(), page.click('[data-go]')]);
  await page.goto(`${BASE}/c/session-road/patients/7e57a1c0-0000-4000-8000-000000000401/`, { waitUntil: 'networkidle' });
  const r = await page.evaluate(() => {
    const f = document.querySelector('.rec-facts'); const fr = f.getBoundingClientRect();
    const test = (t) => { const s = document.createElement('span'); s.textContent = t; document.querySelector('.rec-facts-in').appendChild(s); const w = s.getBoundingClientRect().width; s.remove(); return Math.round(w); };
    return { factsW: Math.round(fr.width), samples: ['Maxicare 1234-5678', 'Maxicare 0123-4567-8901-2345', 'EastWest Healthcare 1100-2233-4455', 'Insular Health Care 12-3456789', 'Health Partners Dental Access', 'Health Partners Dental Access HPDA-0000-1234-5678-9', 'Intellicare IC-0000-4455-7788'].map((t) => [t, test(t)]) };
  });
  console.log(w, JSON.stringify(r));
  await page.locator('.rec-who').screenshot({ path: `/tmp/fl-simple-scratch/verify-S3/facts-${w}.png` });
  await ctx.close();
}
await b.close();
