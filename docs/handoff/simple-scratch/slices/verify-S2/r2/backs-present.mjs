import { chromium } from '/home/user/fl-simple/node_modules/playwright/index.mjs';
const BASE = 'http://127.0.0.1:4470';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
const page = await ctx.newPage();
await page.goto(`${BASE}/auth/login/?any=1`); await page.fill('#email', 'liwayway.domingo@example.com'); await page.fill('#password', 'flossify');
await Promise.all([page.waitForNavigation(), page.click('button[type="submit"]')]);
for (const pid of ['1a1d1c5e-ce1a-4d80-801c-f13fb6ef48cb', '7e57a1c0-0000-4000-8000-000000000001', '9ea415bd-4b9e-4725-80e8-391464e2c12e']) {
  await page.goto(`${BASE}/c/session-road/patients/${pid}/`, { waitUntil: 'load' }); await page.waitForTimeout(300);
  const r = await page.evaluate(() => [...document.querySelectorAll('dialog')].map((d) => ({ id: d.id, forms: [...d.querySelectorAll('form[method=post], form[method=POST]')].map((f) => ({ intent: f.querySelector('input[name=intent]')?.value ?? '?', action: f.getAttribute('action'), back: !!f.querySelector('input[name=back]') })) })).filter((d) => d.forms.length));
  for (const d of r) for (const f of d.forms) if (!f.back) console.log(pid.slice(0, 8), d.id, f.intent, f.action?.replace(/.*patients\/[^/]+\//, '…/'), 'NO BACK');
  console.log(pid.slice(0, 8), r.length, 'dialogs with forms;', r.reduce((n, d) => n + d.forms.length, 0), 'forms');
}
await browser.close();
