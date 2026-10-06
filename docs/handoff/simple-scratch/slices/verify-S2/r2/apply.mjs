import { chromium } from '/home/user/fl-simple/node_modules/playwright/index.mjs';
const BASE = 'http://127.0.0.1:4470';
const RICH = '7e57a1c0-0000-4000-8000-000000000001', D1 = '7e57a1c0-0000-4000-8000-0000000000d1';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
const page = await ctx.newPage();
const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`${BASE}/auth/login/?any=1`); await page.fill('#email', 'liwayway.domingo@example.com'); await page.fill('#password', 'flossify');
await Promise.all([page.waitForNavigation(), page.click('button[type="submit"]')]);
await page.goto(`${BASE}/c/session-road/patients/${RICH}/?saved=done&treated=${D1}&back=overview#chart-offer`, { waitUntil: 'load' }); await page.waitForTimeout(500);
const before = await page.evaluate(() => { const o = document.getElementById('chart-offer'); const r = o?.getBoundingClientRect(); return { tab: document.querySelector('[role=tab][aria-selected=true]')?.id, offer: o?.innerText.replace(/\s+/g, ' ').slice(0, 160), top: r && Math.round(r.top), bar: Math.round(document.querySelector('[data-rec-bar]').getBoundingClientRect().bottom), lines: document.querySelectorAll('[data-rec-saved]').length, action: o?.querySelector('form')?.getAttribute('action')?.replace(/.*patients\/[^/]+\//, '…/') }; });
console.log('before', JSON.stringify(before));
const btn = page.locator('#chart-offer form button').first();
if (await btn.count()) {
  await Promise.all([page.waitForNavigation(), btn.click()]); await page.waitForTimeout(500);
  const after = await page.evaluate(() => { const o = document.getElementById('chart-offer'); const r = o?.getBoundingClientRect(); return { url: location.search + location.hash, tab: document.querySelector('[role=tab][aria-selected=true]')?.id, offer: o?.innerText.replace(/\s+/g, ' ').slice(0, 160), top: r && Math.round(r.top), bar: Math.round(document.querySelector('[data-rec-bar]').getBoundingClientRect().bottom), lines: document.querySelectorAll('[data-rec-saved]').length, tooth36: document.querySelector('[data-odontogram] button[data-fdi="36"]')?.getAttribute('aria-label') }; });
  console.log('after ', JSON.stringify(after));
}
console.log('errors', errors.join(' | ') || 'none');
await browser.close();
