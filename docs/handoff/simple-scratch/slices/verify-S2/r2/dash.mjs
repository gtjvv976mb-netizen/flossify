import { chromium } from '/home/user/fl-simple/node_modules/playwright/index.mjs';
const BASE = 'http://127.0.0.1:4470';
const MARIA = '1a1d1c5e-ce1a-4d80-801c-f13fb6ef48cb', TODAY = '5a055ab9-8eaa-42aa-9951-395736601384';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
for (const [w, h] of [[1440, 900], [390, 844]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}/auth/login/?any=1`); await page.fill('#email', 'liwayway.domingo@example.com'); await page.fill('#password', 'flossify');
  await Promise.all([page.waitForNavigation(), page.click('button[type="submit"]')]);
  await page.goto(`${BASE}/c/session-road/patients/${MARIA}/?open=details&dash=${TODAY}`, { waitUntil: 'load' }); await page.waitForTimeout(600);
  const s = await page.evaluate(() => ({ url: location.search + location.hash, open: document.getElementById('details').open, focus: document.activeElement?.name ?? document.activeElement?.tagName, caret: document.activeElement?.selectionStart === document.activeElement?.value?.length, dash: document.querySelector('#details input[name=dash]')?.value ?? null, back: !!document.querySelector('#details input[name=back]'), tab: document.querySelector('[role=tab][aria-selected=true]')?.id }));
  const locs = []; page.on('response', (r) => { if (r.status() === 303) locs.push(r.headers()['location']); }); await Promise.all([page.waitForNavigation(), page.click('#details button[type=submit]')]); console.log('303 →', locs.join(' '));
  await page.waitForTimeout(500);
  console.log(w, JSON.stringify(s), '→ saved to', page.url().replace(BASE, ''), errors.length ? 'ERR ' + errors : '');
  await ctx.close();
}
await browser.close();
