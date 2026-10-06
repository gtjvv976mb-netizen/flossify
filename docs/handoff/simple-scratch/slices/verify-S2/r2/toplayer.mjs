import { chromium } from '/home/user/fl-simple/node_modules/playwright/index.mjs';
const BASE = 'http://127.0.0.1:4470';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
for (const [w, h] of [[1440, 900], [390, 844]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/auth/login/?any=1`); await page.fill('#email', 'liwayway.domingo@example.com'); await page.fill('#password', 'flossify');
  await Promise.all([page.waitForNavigation(), page.click('button[type="submit"]')]);
  await page.goto(`${BASE}/c/session-road/patients/1a1d1c5e-ce1a-4d80-801c-f13fb6ef48cb/#chart`, { waitUntil: 'load' }); await page.waitForTimeout(300);
  await page.evaluate(() => scrollTo(0, 1500)); await page.waitForTimeout(200);
  for (const id of ['rec-rx-add', 'rec-plan-add', 'details', 'rec-note-add']) {
    await page.evaluate((id) => window.ws.openPanel(id, null), id); await page.waitForTimeout(300);
    const s = await page.evaluate((id) => {
      const d = document.getElementById(id);
      const hits = [...d.querySelectorAll('[data-ws-title], button, input, select, textarea')].filter((e) => e.getClientRects().length && e.checkVisibility()).slice(0, 12).map((e) => { const r = e.getBoundingClientRect(); const x = r.left + Math.min(r.width / 2, 20), y = r.top + Math.min(r.height / 2, 10); if (y < 0 || y > innerHeight) return null; const t = document.elementFromPoint(x, y); return d.contains(t) ? null : `${e.tagName}${e.name ? '[' + e.name + ']' : ''} covered by ${t?.className?.toString().slice(0, 30)}`; }).filter(Boolean);
      return { modal: d.matches(':modal'), covered: hits };
    }, id);
    console.log(w, id, 'modal', s.modal, s.covered.length ? 'COVERED: ' + s.covered.join('; ') : 'nothing covered');
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  }
  await ctx.close();
}
await browser.close();
