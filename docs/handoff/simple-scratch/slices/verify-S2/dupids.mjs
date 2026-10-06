import { chromium } from '/home/user/fl-simple/node_modules/playwright/index.mjs';
const BASE = `http://127.0.0.1:${process.env.PORT_ || 4470}`;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
for (const email of ['liwayway.domingo@example.com', 'hazel.tabanao@example.com']) {
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
const page = await ctx.newPage();
await page.goto(`${BASE}/auth/login/?any=1`); await page.fill('#email', email); await page.fill('#password', 'flossify');
await Promise.all([page.waitForNavigation(), page.click('button[type="submit"]')]);
for (const id of ['1a1d1c5e-ce1a-4d80-801c-f13fb6ef48cb', '7e57a1c0-0000-4000-8000-000000000001', '9ea415bd-4b9e-4725-80e8-391464e2c12e']) {
  await page.goto(`${BASE}/c/session-road/patients/${id}/`, { waitUntil: 'load' }); await page.waitForTimeout(300);
  const r = await page.evaluate(() => { const m = new Map(); for (const e of document.querySelectorAll('[id]')) m.set(e.id, (m.get(e.id) ?? 0) + 1); const dup = [...m].filter(([, n]) => n > 1); const badFor = [...document.querySelectorAll('label[for]')].filter((l) => !document.getElementById(l.htmlFor)).map((l) => l.htmlFor); const badAria = [...document.querySelectorAll('[aria-controls],[aria-labelledby]')].flatMap((e) => (e.getAttribute('aria-controls') ?? e.getAttribute('aria-labelledby')).split(' ')).filter((x) => x && !document.getElementById(x)); return { dup, badFor, badAria: [...new Set(badAria)] }; });
  console.log(email.split('@')[0], id.slice(0, 8), JSON.stringify(r));
}
await ctx.close();
}
await b.close();
