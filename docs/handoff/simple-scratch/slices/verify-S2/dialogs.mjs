import { chromium } from '/home/user/fl-simple/node_modules/playwright/index.mjs';
const BASE = 'http://127.0.0.1:4470';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
const page = await ctx.newPage();
await page.goto(`${BASE}/auth/login/?any=1`); await page.fill('#email', 'liwayway.domingo@example.com'); await page.fill('#password', 'flossify');
await Promise.all([page.waitForNavigation(), page.click('button[type="submit"]')]);
for (const id of ['1a1d1c5e-ce1a-4d80-801c-f13fb6ef48cb', '7e57a1c0-0000-4000-8000-000000000001', '9ea415bd-4b9e-4725-80e8-391464e2c12e']) {
  await page.goto(`${BASE}/c/session-road/patients/${id}/`, { waitUntil: 'load' }); await page.waitForTimeout(300);
  const r = await page.evaluate(() => [...document.querySelectorAll('dialog[data-ws-panel]')].filter((d) => !d.id.startsWith('rec-visit-')).map((d) => ({ id: d.id, inTab: !!d.closest('[data-rec-panel]'), forms: [...d.querySelectorAll('form')].map((f) => `${f.querySelector('input[name=intent]')?.value ?? '?'}:${f.querySelector('input[name=back]') ? 'back' : 'NO-BACK'}:${(f.getAttribute('action') || '').split('#')[1] ?? ''}`) })));
  console.log(id.slice(0, 8)); for (const d of r) console.log('  ', d.id, d.inTab ? 'IN-TAB' : '', d.forms.join(' | '));
  const vis = await page.evaluate(() => [...document.querySelectorAll('dialog[data-ws-panel][id^="rec-visit-"]')].map((d) => ({ id: d.id.slice(0, 16), inTab: !!d.closest('[data-rec-panel]'), forms: [...d.querySelectorAll('form')].map((f) => f.querySelector('input[name=intent]')?.value ?? f.getAttribute('action')) })));
  console.log('   visits:', vis.length, 'in tab:', vis.filter((v) => v.inTab).length, 'forms:', [...new Set(vis.flatMap((v) => v.forms))].join(','));
}
await b.close();
